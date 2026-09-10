// A JSON reader that keeps the text it read. Reformatting by way of
// `JSON.parse` and `JSON.stringify` is the obvious approach and it quietly
// damages three things: integer-like keys come back reordered, whole numbers
// past 2^53 come back rounded, and duplicate keys disappear without a word.
// Every scalar here stays the exact characters the author wrote, so formatting
// only ever changes the whitespace between them.
//
// It is strict on purpose — RFC 8259 and nothing more. Comments, trailing
// commas and single quotes are reported where they sit rather than quietly
// accepted, because saying where a document goes wrong is the whole job.

const WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't'])
const NUMBER = /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y

// Deep enough for any real document, shallow enough that a hostile one runs
// out of parser before it runs out of stack.
const MAX_DEPTH = 500

// Reformats `text`, throwing on anything that is not valid JSON. `indent` is
// the string one level of nesting adds — an empty one minifies. Returns the
// formatted text alongside the things that are legal but worth knowing about.
export function format(text, options = {}) {
  const step = options.indent === undefined ? '  ' : options.indent
  const ctx = { text: String(text), i: 0, problems: [] }

  // A byte order mark is invisible, survives copy and paste, and makes
  // `JSON.parse` fail on the first character with nothing to point at.
  if (ctx.text.charCodeAt(0) === 0xfeff) {
    ctx.i = 1
    warn(ctx, 0, 'The text begins with a byte order mark, which JSON.parse rejects. It has been left out.')
  }

  const node = readValue(ctx, 0)

  skipWhitespace(ctx)
  if (ctx.i < ctx.text.length) {
    fail(ctx, ctx.i, 'the document already ended here — JSON holds one value, not several')
  }

  return {
    text: write(node, '', step, Boolean(options.sort)),
    problems: ctx.problems
  }
}

// Line and column are only ever wanted for a message, so they are counted when
// one is written rather than carried through the whole scan.
function positionOf(text, index) {
  let line = 1
  let start = 0

  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') { line++; start = i + 1 }
  }

  return { line, column: index - start + 1 }
}

function fail(ctx, index, message) {
  const { line, column } = positionOf(ctx.text, index)
  throw new Error(`Line ${line}, column ${column}: ${message}`)
}

function warn(ctx, index, message) {
  const { line, column } = positionOf(ctx.text, index)
  ctx.problems.push({ line, column, message })
}

function skipWhitespace(ctx) {
  while (ctx.i < ctx.text.length && WHITESPACE.has(ctx.text[ctx.i])) ctx.i++
}

function readValue(ctx, depth) {
  if (depth > MAX_DEPTH) fail(ctx, ctx.i, 'nested far deeper than any real document goes')

  skipWhitespace(ctx)
  const start = ctx.i
  const ch = ctx.text[start]

  if (ch === undefined) fail(ctx, start, 'the document ends where a value should be')
  if (ch === '{') return readObject(ctx, depth)
  if (ch === '[') return readArray(ctx, depth)
  if (ch === '"') return { kind: 'scalar', raw: readString(ctx) }
  if (ch === '-' || (ch >= '0' && ch <= '9')) return { kind: 'scalar', raw: readNumber(ctx) }

  for (const word of ['true', 'false', 'null']) {
    if (ctx.text.startsWith(word, start)) {
      ctx.i += word.length
      return { kind: 'scalar', raw: word }
    }
  }

  fail(ctx, start, describe(ctx, start))
}

// The mistakes people actually make are worth naming. "Unexpected token" says
// where the parser gave up and nothing at all about why.
function describe(ctx, index) {
  const ch = ctx.text[index]
  const rest = ctx.text.slice(index)

  if (ch === "'") return 'JSON strings use double quotes, not single ones'
  if (rest.startsWith('//') || rest.startsWith('/*')) return 'JSON has no comments'
  if (rest.startsWith('undefined')) return 'undefined is not a JSON value — write null'

  // Signed, these reach the number reader instead; bare, they land here.
  const notJson = /^(NaN|Infinity)\b/.exec(rest)
  if (notJson) return `${notJson[1]} is not a JSON value`

  const python = /^(True|False|None)\b/.exec(rest)
  if (python) {
    const spelling = { True: 'true', False: 'false', None: 'null' }[python[1]]
    return `JSON writes this as ${spelling}, in lower case`
  }

  if (ch === '+') return 'a JSON number cannot start with a plus sign'
  if (ch === '.') return 'a JSON number needs a digit before the decimal point'
  if (ch === ',') return 'there is no value here, just a comma'
  if (ch === ':') return 'a colon outside an object has nothing to separate'
  if (ch === '}' || ch === ']') return `nothing opened this ${ch}`
  if (/\s/.test(ch)) return 'JSON counts only space, tab, carriage return and line feed as whitespace'

  return `unexpected ${JSON.stringify(ch)} where a value should be`
}

function readString(ctx) {
  const start = ctx.i
  ctx.i++

  while (ctx.i < ctx.text.length) {
    const ch = ctx.text[ctx.i]

    if (ch === '"') {
      ctx.i++
      return ctx.text.slice(start, ctx.i)
    }

    if (ch === '\\') {
      const escape = ctx.text[ctx.i + 1]

      if (escape === 'u') {
        if (!/^[0-9a-fA-F]{4}$/.test(ctx.text.slice(ctx.i + 2, ctx.i + 6))) {
          fail(ctx, ctx.i, '\\u has to be followed by four hexadecimal digits')
        }
        ctx.i += 6
        continue
      }

      if (escape === undefined) fail(ctx, ctx.i, 'the document ends in the middle of an escape')
      if (!ESCAPES.has(escape)) fail(ctx, ctx.i, `\\${escape} is not one of JSON's escapes`)
      ctx.i += 2
      continue
    }

    // A literal newline inside a string is the commonest way a hand-written
    // document breaks, and the message should say so rather than talk about
    // control characters.
    if (ch < ' ') {
      fail(ctx, ctx.i, ch === '\n'
        ? 'a string cannot run across lines — write \\n instead'
        : 'a string cannot hold a raw control character — escape it')
    }

    ctx.i++
  }

  fail(ctx, start, 'this string is never closed')
}

// Safe because the text has already been walked character by character above.
const decodeString = raw => JSON.parse(raw)

function readNumber(ctx) {
  const start = ctx.i
  NUMBER.lastIndex = start
  const match = NUMBER.exec(ctx.text)

  if (!match || match.index !== start) fail(ctx, start, describeNumber(ctx, start))
  ctx.i = start + match[0].length

  // `01`, `1.2.3` and `0x1f` all match a shorter number and then leave a
  // character behind. Catching it here points at the number itself instead of
  // reporting a stray token further along.
  if (/[0-9A-Za-z._]/.test(ctx.text[ctx.i] || '')) fail(ctx, start, describeNumber(ctx, start))

  const raw = match[0]
  const parsed = Number(raw)

  if (parsed === Infinity || parsed === -Infinity) {
    warn(ctx, start, `${raw} is too large for a double and reads back as Infinity`)
  } else if (!/[.eE]/.test(raw) && !Number.isSafeInteger(parsed)) {
    warn(ctx, start, `${raw} is past the point where whole numbers stay exact — it survives here as text, but JSON.parse would round it to ${parsed}`)
  }

  return raw
}

function describeNumber(ctx, index) {
  const rest = ctx.text.slice(index)

  if (/^-?Infinity/.test(rest)) return 'Infinity is not a JSON value'
  if (/^-?NaN/.test(rest)) return 'NaN is not a JSON value'
  if (/^-?0[xX]/.test(rest)) return 'JSON has no hexadecimal numbers'
  if (/^-?0[0-9]/.test(rest)) return 'a JSON number cannot have a leading zero'
  if (/^-?[0-9]*\.[0-9]*\./.test(rest)) return 'this number has two decimal points'
  if (/^-?\./.test(rest)) return 'a JSON number needs a digit before the decimal point'
  if (/^-?[0-9]+\.(?![0-9])/.test(rest)) return 'a JSON number needs a digit after the decimal point'
  if (/^-?[0-9]+[eE][+-]?(?![0-9])/.test(rest)) return 'the exponent needs at least one digit'
  if (/^-(?![0-9])/.test(rest)) return 'a minus sign has to be followed by a digit'

  return 'this is not a valid JSON number'
}

function readObject(ctx, depth) {
  const open = ctx.i
  ctx.i++

  const members = []
  const seen = new Map()

  skipWhitespace(ctx)
  if (ctx.text[ctx.i] === '}') {
    ctx.i++
    return { kind: 'object', members }
  }

  for (;;) {
    skipWhitespace(ctx)

    if (ctx.text[ctx.i] !== '"') {
      if (ctx.i >= ctx.text.length) fail(ctx, open, 'this object is never closed')
      fail(ctx, ctx.i, ctx.text[ctx.i] === "'"
        ? 'JSON strings use double quotes, not single ones'
        : 'an object key has to be a double-quoted string')
    }

    const keyAt = ctx.i
    const rawKey = readString(ctx)
    const key = decodeString(rawKey)

    // Duplicates are legal text and a mistake every time. `JSON.parse` keeps
    // the last one and says nothing, so this is the only warning anyone gets.
    // Both are kept in the output: dropping one would be an edit, not a format.
    if (seen.has(key)) {
      const first = positionOf(ctx.text, seen.get(key))
      warn(ctx, keyAt, `duplicate key ${rawKey}, already given on line ${first.line} — a parser keeps only the last`)
    } else {
      seen.set(key, keyAt)
    }

    skipWhitespace(ctx)
    if (ctx.text[ctx.i] !== ':') fail(ctx, ctx.i, `expected a colon after the key ${rawKey}`)
    ctx.i++

    members.push({ rawKey, key, value: readValue(ctx, depth + 1) })

    skipWhitespace(ctx)
    const ch = ctx.text[ctx.i]
    const at = ctx.i

    if (ch === ',') {
      ctx.i++
      skipWhitespace(ctx)
      if (ctx.text[ctx.i] === '}') fail(ctx, at, 'JSON does not allow a trailing comma')
      continue
    }

    if (ch === '}') {
      ctx.i++
      return { kind: 'object', members }
    }

    if (ch === undefined) fail(ctx, open, 'this object is never closed')
    fail(ctx, at, 'expected a comma or a closing brace after this value')
  }
}

function readArray(ctx, depth) {
  const open = ctx.i
  ctx.i++

  const items = []

  skipWhitespace(ctx)
  if (ctx.text[ctx.i] === ']') {
    ctx.i++
    return { kind: 'array', items }
  }

  for (;;) {
    items.push(readValue(ctx, depth + 1))

    skipWhitespace(ctx)
    const ch = ctx.text[ctx.i]
    const at = ctx.i

    if (ch === ',') {
      ctx.i++
      skipWhitespace(ctx)
      if (ctx.text[ctx.i] === ']') fail(ctx, at, 'JSON does not allow a trailing comma')
      continue
    }

    if (ch === ']') {
      ctx.i++
      return { kind: 'array', items }
    }

    if (ch === undefined) fail(ctx, open, 'this array is never closed')
    fail(ctx, at, 'expected a comma or a closing bracket after this value')
  }
}

function write(node, pad, step, sort) {
  if (node.kind === 'scalar') return node.raw

  if (node.kind === 'object') {
    if (!node.members.length) return '{}'

    // By code unit rather than locale, so the result does not depend on the
    // machine that produced it. The sort is stable, so duplicate keys keep the
    // order they were written in.
    const members = sort
      ? [...node.members].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      : node.members

    if (!step) {
      return `{${members.map(m => `${m.rawKey}:${write(m.value, '', step, sort)}`).join(',')}}`
    }

    const inner = pad + step
    const body = members.map(m => `${inner}${m.rawKey}: ${write(m.value, inner, step, sort)}`).join(',\n')
    return `{\n${body}\n${pad}}`
  }

  if (!node.items.length) return '[]'
  if (!step) return `[${node.items.map(item => write(item, '', step, sort)).join(',')}]`

  const inner = pad + step
  const body = node.items.map(item => `${inner}${write(item, inner, step, sort)}`).join(',\n')
  return `[\n${body}\n${pad}]`
}
