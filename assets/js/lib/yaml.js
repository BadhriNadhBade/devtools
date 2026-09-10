// A YAML reader and writer small enough to ship unbundled. The Backstage
// toolbox this tool is ported from leans on the `yaml` package for both
// directions; there is no bundler here, so this covers the YAML that actually
// turns up in configuration files — block mappings and sequences, flow
// collections, all five scalar styles, anchors, aliases and merge keys — and
// resolves plain scalars against the YAML 1.2 core schema, which is the schema
// that package uses by default.
//
// What it deliberately refuses rather than silently misreads: more than one
// document in a stream, and the explicit `? key` form. Tags are skipped, not
// applied — nothing here would know what to do with a custom one.

const DOC_START = /^---(\s|$)/
const DOC_END = /^\.\.\.(\s|$)/
const BLANK = /^\s*$/
const COMMENT_LINE = /^\s*#/
const DIRECTIVE = /^%/
const ITEM = /^-(\s|$)/
const ANCHOR = /^&([^\s,[\]{}]+)\s*/
const ALIAS = /^\*([^\s,[\]{}]+)\s*/
const TAG = /^(?:!<[^>]*>|![^\s]*)(?:\s+|$)/

// YAML 1.2 core schema. Anything matching none of these stays a string, which
// is why `yes`, `off` and `2024-01-01` come through as text.
const NULLS = new Set(['', '~', 'null', 'Null', 'NULL'])
const TRUES = new Set(['true', 'True', 'TRUE'])
const FALSES = new Set(['false', 'False', 'FALSE'])
const INTEGER = /^[-+]?[0-9]+$/
const OCTAL = /^0o[0-7]+$/
const HEXADECIMAL = /^0x[0-9a-fA-F]+$/
const FLOAT = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/
const INFINITY = /^[-+]?\.(inf|Inf|INF)$/
const NOT_A_NUMBER = /^\.(nan|NaN|NAN)$/

// ---------------------------------------------------------------- reading

export function parse(text) {
  const ctx = {
    lines: String(text).replace(/\r\n?/g, '\n').split('\n'),
    i: 0,
    anchors: new Map()
  }

  skipIgnorable(ctx)

  // A leading `---` is common enough to be worth accepting. Content on the
  // same line belongs to the document, so it is pushed back as an indented
  // line rather than handled as a special case further down.
  if (ctx.i < ctx.lines.length && DOC_START.test(ctx.lines[ctx.i])) {
    const rest = ctx.lines[ctx.i].slice(3).trim()
    if (rest) ctx.lines[ctx.i] = '    ' + rest
    else ctx.i++
  }

  const value = parseNode(ctx, -1)

  skipIgnorable(ctx)
  if (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i]
    if (DOC_START.test(line)) {
      fail(ctx, 'this is a multi-document stream, and JSON holds a single value — convert one document at a time')
    }
    if (!DOC_END.test(line)) fail(ctx, `unexpected content: ${line.trim()}`)
  }

  return value
}

function fail(ctx, message) {
  throw new Error(`Line ${Math.min(ctx.i + 1, ctx.lines.length)}: ${message}`)
}

// Whether any line carries a comment. Comments are the one thing parsing throws
// away that writing cannot put back, so anything that rebuilds a document from
// its structure owes the reader a warning first.
export function hasComments(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').some(line => {
    const content = line.slice(indentOf(line))
    return stripComment(content) !== content.trimEnd()
  })
}

function skipIgnorable(ctx) {
  while (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i]
    if (BLANK.test(line) || COMMENT_LINE.test(line) || DIRECTIVE.test(line)) ctx.i++
    else return
  }
}

function indentOf(line) {
  let n = 0
  while (line[n] === ' ') n++
  return n
}

// Parses whatever node starts on the next line, provided it is indented past
// `parentIndent`. Returns null where the node is empty — a key with nothing
// under it, or the end of the stream.
function parseNode(ctx, parentIndent) {
  skipIgnorable(ctx)
  if (ctx.i >= ctx.lines.length) return null

  const line = ctx.lines[ctx.i]
  if (DOC_START.test(line) || DOC_END.test(line)) return null

  const indent = indentOf(line)
  if (line[indent] === '\t') fail(ctx, 'tabs cannot be used to indent YAML — use spaces')
  if (indent <= parentIndent) return null

  const content = stripComment(line.slice(indent))
  if (!content) return null

  if (ITEM.test(content)) return parseSequence(ctx, indent)
  if (findKeyEnd(content) >= 0) return parseMapping(ctx, indent)

  ctx.i++
  return parseInline(ctx, content, parentIndent)
}

function parseMapping(ctx, indent) {
  const map = {}
  const merges = []

  while (ctx.i < ctx.lines.length) {
    skipIgnorable(ctx)
    if (ctx.i >= ctx.lines.length) break

    const line = ctx.lines[ctx.i]
    if (DOC_START.test(line) || DOC_END.test(line)) break

    const lineIndent = indentOf(line)
    if (lineIndent < indent) break
    if (lineIndent > indent) fail(ctx, 'unexpected indentation — this line is indented further than the key above it')

    const content = stripComment(line.slice(indent))
    if (!content) { ctx.i++; continue }
    // `?` only opens an explicit key when a space follows it; `?question` is
    // an ordinary plain scalar.
    if (/^\?(\s|$)/.test(content)) fail(ctx, 'the explicit `? key` form is not supported')

    const keyEnd = findKeyEnd(content)
    if (keyEnd < 0) fail(ctx, `expected \`key: value\`, found: ${content}`)

    const rawKey = content.slice(0, keyEnd).trim()
    const key = readKey(ctx, rawKey)
    const rest = content.slice(keyEnd + 1).trim()
    const keyLine = ctx.i

    ctx.i++
    const value = parseInline(ctx, rest, indent)

    if (rawKey === '<<') {
      for (const source of Array.isArray(value) ? value : [value]) {
        if (!isMap(source)) {
          throw new Error(`Line ${keyLine + 1}: a merge key needs a mapping, or a sequence of mappings`)
        }
        merges.push(source)
      }
      continue
    }

    map[key] = value
  }

  if (!merges.length) return map

  // Keys written out explicitly beat merged ones, and an earlier source in a
  // merge sequence beats a later one.
  const merged = {}
  for (const source of merges) {
    for (const [key, value] of Object.entries(source)) {
      if (!(key in merged)) merged[key] = value
    }
  }
  return { ...merged, ...map }
}

function parseSequence(ctx, indent) {
  const seq = []

  while (ctx.i < ctx.lines.length) {
    skipIgnorable(ctx)
    if (ctx.i >= ctx.lines.length) break

    const line = ctx.lines[ctx.i]
    if (DOC_START.test(line) || DOC_END.test(line)) break

    const lineIndent = indentOf(line)
    if (lineIndent < indent) break
    if (lineIndent > indent) fail(ctx, 'unexpected indentation — this line is indented further than the list above it')

    const content = stripComment(line.slice(indent))
    if (!content) { ctx.i++; continue }
    if (!ITEM.test(content)) break

    const tail = content.slice(1)
    const rest = tail.trim()

    if (!rest) {
      ctx.i++
      seq.push(parseNode(ctx, indent))
      continue
    }

    // Whatever follows the dash is a node in its own right, sitting at the
    // column it actually starts in. Rewriting the line that way means
    // `- type: car` followed by an aligned `  name: pedro` is read as one
    // mapping by exactly the same code that reads a mapping anywhere else,
    // and `- - nested` needs no special case either.
    const contentIndent = indent + 1 + (tail.length - tail.trimStart().length)
    ctx.lines[ctx.i] = ' '.repeat(contentIndent) + rest
    seq.push(parseNode(ctx, contentIndent - 1))
  }

  return seq
}

// Everything that can follow a `key:` on the same line: an alias, an anchor, a
// tag, a block scalar header, a flow collection, or a scalar. The line it came
// from has already been consumed, so anything that spans lines reads on from
// there. `ownerIndent` is the indent a following line has to beat to belong to
// this node.
function parseInline(ctx, text, ownerIndent) {
  const alias = ALIAS.exec(text)
  if (alias) {
    if (text.slice(alias[0].length).trim()) fail(ctx, 'an alias cannot be followed by anything else')
    if (!ctx.anchors.has(alias[1])) fail(ctx, `unknown alias *${alias[1]}`)
    return ctx.anchors.get(alias[1])
  }

  let anchor = null
  let rest = text

  for (;;) {
    const found = ANCHOR.exec(rest)
    if (found) { anchor = found[1]; rest = rest.slice(found[0].length); continue }
    const tag = TAG.exec(rest)
    if (tag) { rest = rest.slice(tag[0].length); continue }
    break
  }

  const value = parseInlineValue(ctx, rest.trim(), ownerIndent)
  if (anchor) ctx.anchors.set(anchor, value)
  return value
}

function parseInlineValue(ctx, rest, ownerIndent) {
  if (rest === '') return parseValueBelow(ctx, ownerIndent)
  if (rest[0] === '|' || rest[0] === '>') return parseBlockScalar(ctx, rest, ownerIndent)
  if (rest[0] === '[' || rest[0] === '{') return parseFlow(ctx, readFlow(ctx, rest))

  if (rest[0] === '"' || rest[0] === "'") {
    const end = skipQuoted(rest, 0)
    if (end < 0) fail(ctx, 'unterminated quoted string')
    if (rest.slice(end + 1).trim()) fail(ctx, 'unexpected content after a quoted value')
    return unquote(rest.slice(0, end + 1))
  }

  return resolveScalar(readPlain(ctx, rest, ownerIndent))
}

// The node under a key that had nothing after its colon. Everything has to be
// indented past the key, with one exception the spec grants and hand-written
// YAML uses constantly: a sequence may sit at the very same indent as the key
// that owns it.
function parseValueBelow(ctx, ownerIndent) {
  skipIgnorable(ctx)

  if (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i]
    const indent = indentOf(line)
    if (indent === ownerIndent && !DOC_START.test(line) && ITEM.test(stripComment(line.slice(indent)))) {
      return parseSequence(ctx, indent)
    }
  }

  return parseNode(ctx, ownerIndent)
}

// A plain scalar can run on across more-indented lines. Only lines that could
// not be anything else are swallowed: a `key:` line or a `- ` line ends the
// scalar, which is what stops a badly indented mapping from disappearing into
// the value above it.
function readPlain(ctx, first, ownerIndent) {
  const parts = [first]

  while (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i]

    if (BLANK.test(line)) {
      let ahead = ctx.i
      while (ahead < ctx.lines.length && BLANK.test(ctx.lines[ahead])) ahead++
      if (ahead >= ctx.lines.length) break
      if (!continues(ctx.lines[ahead], ownerIndent)) break
      parts.push('\n')
      ctx.i = ahead
      continue
    }

    if (!continues(line, ownerIndent)) break
    parts.push(stripComment(line.slice(indentOf(line))))
    ctx.i++
  }

  let out = ''
  for (const part of parts) {
    if (part === '\n') out += '\n'
    else out += out === '' || out.endsWith('\n') ? part : ' ' + part
  }
  return out
}

function continues(line, ownerIndent) {
  if (DOC_START.test(line) || DOC_END.test(line)) return false
  if (indentOf(line) <= ownerIndent) return false

  const content = stripComment(line.slice(indentOf(line)))
  if (!content) return false

  return !ITEM.test(content) && findKeyEnd(content) < 0
}

function parseBlockScalar(ctx, header, ownerIndent) {
  const folded = header[0] === '>'
  let chomp = ''
  let explicit = 0

  for (const ch of header.slice(1)) {
    if (ch === '-' || ch === '+') chomp = ch
    else if (ch >= '1' && ch <= '9') explicit = Number(ch)
    else fail(ctx, `unrecognised block scalar header: ${header}`)
  }

  const body = []
  let contentIndent = explicit ? ownerIndent + explicit : 0

  while (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i]

    if (BLANK.test(line)) { body.push(''); ctx.i++; continue }
    if (indentOf(line) <= ownerIndent) break

    // With no explicit indicator the first content line sets the indent for
    // the whole block, exactly as the spec has it.
    if (!contentIndent) contentIndent = indentOf(line)
    if (indentOf(line) < contentIndent) break

    body.push(line.slice(contentIndent))
    ctx.i++
  }

  let trailing = 0
  while (body.length && body[body.length - 1] === '') { body.pop(); trailing++ }

  if (!body.length) return chomp === '+' ? '\n'.repeat(trailing) : ''

  const text = folded ? fold(body) : body.join('\n')
  if (chomp === '-') return text
  if (chomp === '+') return text + '\n'.repeat(trailing + 1)
  return text + '\n'
}

// Folded blocks join a line to the one before it with a space. A blank line is
// a real newline instead, and a line starting with extra space keeps its own
// newline on both sides — that is how a code sample survives inside a `>`
// block.
function fold(lines) {
  let out = ''
  let previous = null

  for (const line of lines) {
    if (line === '') { out += '\n'; previous = null; continue }

    const indented = /^[ \t]/.test(line)
    if (previous) out += previous === 'indented' || indented ? '\n' : ' '
    out += line
    previous = indented ? 'indented' : 'text'
  }

  return out
}

// Flow collections can run over several lines, so the text is gathered up
// until the brackets balance before any of it is parsed.
function readFlow(ctx, first) {
  let text = first

  while (flowDepth(text) > 0) {
    if (ctx.i >= ctx.lines.length) fail(ctx, 'unterminated flow collection — a bracket is never closed')
    text += ' ' + stripComment(ctx.lines[ctx.i].trim())
    ctx.i++
  }

  return text
}

function flowDepth(text) {
  let depth = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (opensQuote(text, i)) {
      const end = skipQuoted(text, i)
      if (end < 0) return 1
      i = end
      continue
    }

    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) break
    if (ch === '[' || ch === '{') depth++
    if (ch === ']' || ch === '}') depth--
  }

  return depth
}

function parseFlow(ctx, text) {
  const state = { text, i: 0 }
  const value = flowNode(ctx, state)

  skipSpace(state)
  if (state.i < state.text.length) {
    fail(ctx, `unexpected content in a flow collection: ${state.text.slice(state.i)}`)
  }

  return value
}

function flowNode(ctx, state) {
  skipSpace(state)
  const ch = state.text[state.i]

  if (ch === '[') return flowSequence(ctx, state)
  if (ch === '{') return flowMapping(ctx, state)

  if (ch === '"' || ch === "'") {
    const end = skipQuoted(state.text, state.i)
    if (end < 0) fail(ctx, 'unterminated quoted string')
    const raw = state.text.slice(state.i, end + 1)
    state.i = end + 1
    return unquote(raw)
  }

  const start = state.i
  while (state.i < state.text.length) {
    const c = state.text[state.i]
    if (c === ',' || c === ']' || c === '}') break
    // Inside a flow collection a `:` only separates a key from its value when
    // a space or a separator follows it, so `a:b` stays a single scalar.
    if (c === ':' && (state.i + 1 >= state.text.length || /[\s,\]}]/.test(state.text[state.i + 1]))) break
    state.i++
  }

  const raw = state.text.slice(start, state.i).trim()

  const alias = ALIAS.exec(raw)
  if (alias && alias[0].trim() === raw) {
    if (!ctx.anchors.has(alias[1])) fail(ctx, `unknown alias *${alias[1]}`)
    return ctx.anchors.get(alias[1])
  }

  return resolveScalar(raw)
}

function flowSequence(ctx, state) {
  state.i++
  const seq = []

  for (;;) {
    skipSpace(state)
    if (state.text[state.i] === ']') { state.i++; return seq }
    if (state.i >= state.text.length) fail(ctx, 'unterminated flow sequence')

    seq.push(flowNode(ctx, state))

    skipSpace(state)
    if (state.text[state.i] === ',') { state.i++; continue }
    if (state.text[state.i] === ']') { state.i++; return seq }
    fail(ctx, 'expected , or ] in a flow sequence')
  }
}

function flowMapping(ctx, state) {
  state.i++
  const map = {}

  for (;;) {
    skipSpace(state)
    if (state.text[state.i] === '}') { state.i++; return map }
    if (state.i >= state.text.length) fail(ctx, 'unterminated flow mapping')

    const key = flowNode(ctx, state)
    skipSpace(state)

    let value = null
    if (state.text[state.i] === ':') {
      state.i++
      value = flowNode(ctx, state)
    }
    map[key === null ? 'null' : String(key)] = value

    skipSpace(state)
    if (state.text[state.i] === ',') { state.i++; continue }
    if (state.text[state.i] === '}') { state.i++; return map }
    fail(ctx, 'expected , or } in a flow mapping')
  }
}

function skipSpace(state) {
  while (state.i < state.text.length && /\s/.test(state.text[state.i])) state.i++
}

// Index of the `:` that separates a mapping key from its value, or -1 when the
// line is not a `key: value` at all. The colon has to be followed by
// whitespace or end the line, which is what keeps a plain scalar like
// `https://example.com` from being read as a key.
function findKeyEnd(content) {
  let depth = 0

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]

    if (opensQuote(content, i)) {
      const end = skipQuoted(content, i)
      if (end < 0) return -1
      i = end
      continue
    }

    if (ch === '[' || ch === '{') { depth++; continue }
    if (ch === ']' || ch === '}') { depth--; continue }

    if (ch === ':' && depth === 0) {
      const next = content[i + 1]
      if (next === undefined || next === ' ' || next === '\t') return i
    }
  }

  return -1
}

// A `#` opens a comment only at the start of the line or after whitespace,
// which is why `color: #fff` has no value — the hash is a comment marker, and
// pretending otherwise here would disagree with every real parser.
function stripComment(content) {
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]

    if (opensQuote(content, i)) {
      const end = skipQuoted(content, i)
      if (end < 0) break
      i = end
      continue
    }

    if (ch === '#' && (i === 0 || /\s/.test(content[i - 1]))) return content.slice(0, i).trimEnd()
  }

  return content.trimEnd()
}

// A quote only opens a quoted scalar at the start of a token. Inside a word —
// `don't`, or a key like `quote'single` — it is an ordinary character, and
// reading it as an opener would swallow the rest of the line hunting for a
// partner that is not there.
function opensQuote(text, i) {
  if (text[i] !== '"' && text[i] !== "'") return false
  return i === 0 || /[\s[{,:]/.test(text[i - 1])
}

// Index of the quote closing the one at `start`, or -1 if it never does.
function skipQuoted(text, start) {
  const quote = text[start]

  for (let i = start + 1; i < text.length; i++) {
    if (quote === "'") {
      if (text[i] !== "'") continue
      if (text[i + 1] === "'") { i++; continue }
      return i
    }

    if (text[i] === '\\') { i++; continue }
    if (text[i] === '"') return i
  }

  return -1
}

function readKey(ctx, raw) {
  if (raw[0] !== '"' && raw[0] !== "'") return raw

  const end = skipQuoted(raw, 0)
  if (end < 0) fail(ctx, 'unterminated quoted key')
  return unquote(raw.slice(0, end + 1))
}

function unquote(raw) {
  const body = raw.slice(1, -1)
  if (raw[0] === "'") return body.replace(/''/g, "'")

  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (match, code) => {
    switch (code[0]) {
      case 'u':
      case 'x': return String.fromCharCode(parseInt(code.slice(1), 16))
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case 'b': return '\b'
      case 'f': return '\f'
      case 'v': return '\v'
      case 'e': return '\x1b'
      case '0': return '\0'
      default: return code
    }
  })
}

function resolveScalar(raw) {
  if (NULLS.has(raw)) return null
  if (TRUES.has(raw)) return true
  if (FALSES.has(raw)) return false
  if (INTEGER.test(raw)) return Number(raw)
  if (OCTAL.test(raw)) return parseInt(raw.slice(2), 8)
  if (HEXADECIMAL.test(raw)) return parseInt(raw.slice(2), 16)
  if (FLOAT.test(raw)) return Number(raw)
  if (INFINITY.test(raw)) return raw[0] === '-' ? -Infinity : Infinity
  if (NOT_A_NUMBER.test(raw)) return NaN
  return raw
}

// ---------------------------------------------------------------- writing

export function stringify(value, options = {}) {
  const step = ' '.repeat(Math.max(1, Math.min(9, options.indent || 2)))
  const text = block(value, '', step)
  return text === '' ? '' : text + '\n'
}

function block(value, pad, step) {
  if (isMap(value)) {
    const keys = Object.keys(value).filter(key => value[key] !== undefined)
    if (!keys.length) return pad + '{}'

    return keys.map(key => {
      const child = value[key]
      const name = pad + quote(String(key)) + ':'
      if (isBranch(child)) return name + '\n' + block(child, pad + step, step)
      if (isBlockString(child)) return name + ' ' + blockString(child, pad + step)
      return name + ' ' + inline(child)
    }).join('\n')
  }

  if (Array.isArray(value)) {
    if (!value.length) return pad + '[]'

    // `- ` is two characters wide whatever the indent step is, so an item's
    // own children have to line up two columns in — otherwise the dash and
    // the keys beneath it disagree about where the item begins.
    const itemPad = pad + '  '

    return value.map(item => {
      if (isBranch(item)) return pad + '- ' + block(item, itemPad, step).slice(itemPad.length)
      if (isBlockString(item)) return pad + '- ' + blockString(item, itemPad)
      return pad + '- ' + inline(item)
    }).join('\n')
  }

  if (isBlockString(value)) return pad + blockString(value, pad + step)
  return pad + inline(value)
}

function isMap(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

function isBranch(value) {
  if (Array.isArray(value)) return value.length > 0
  if (isMap(value)) return Object.keys(value).some(key => value[key] !== undefined)
  return false
}

function inline(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return String(value)

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '.nan'
    if (value === Infinity) return '.inf'
    if (value === -Infinity) return '-.inf'
    return String(value)
  }

  if (typeof value === 'string') return quote(value)
  if (value instanceof Date) return value.toISOString()
  return Array.isArray(value) ? '[]' : '{}'
}

const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/

// A string only earns the literal block style if every line of it survives the
// round trip: no control characters, and no leading or trailing whitespace for
// the block to quietly eat.
function isBlockString(value) {
  if (typeof value !== 'string' || !value.includes('\n')) return false
  if (CONTROL.test(value)) return false
  if (/^[ \t\n]/.test(value)) return false
  return !/[ \t](\n|$)/.test(value)
}

function blockString(value, pad) {
  const trailing = /\n*$/.exec(value)[0].length
  const body = value.slice(0, value.length - trailing)
  const header = trailing === 0 ? '|-' : trailing === 1 ? '|' : '|+'
  const lines = body.split('\n').map(line => (line === '' ? '' : pad + line))

  return header + '\n' + lines.join('\n') + '\n'.repeat(Math.max(0, trailing - 1))
}

function quote(value) {
  if (value === '') return "''"
  if (CONTROL.test(value) || value.includes('\n')) return JSON.stringify(value)
  if (needsQuotes(value)) return "'" + value.replace(/'/g, "''") + "'"
  return value
}

function needsQuotes(value) {
  // Anything that would read back as something other than this exact string.
  if (resolveScalar(value) !== value) return true
  if (value !== value.trim()) return true
  if (/^[,[\]{}#&*!|>'"%@`]/.test(value)) return true
  if (/^[?:-](\s|$)/.test(value)) return true
  // Bare `---` or `...` would come back as a document marker, not a string.
  if (DOC_START.test(value) || DOC_END.test(value)) return true
  if (/:(\s|$)/.test(value) || /\s#/.test(value)) return true
  return false
}
