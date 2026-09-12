// A small path language for pulling values out of a parsed document — the
// common half of JSONPath, which is the half people actually type.
//
//   $.servers[0].name       a plain path
//   $.servers[*].name       every element
//   $.servers[1:3]          a slice
//   $..name                 every `name` at any depth
//   $.*                     every child of the root
//
// Deliberately not the whole specification: filter expressions (`?(@.x > 2)`)
// are a language of their own, and a half-working one would be worse than an
// honest refusal.

const SEGMENT = /^(?:\.\.(?<descend>[\w$-]+|\*)|\.(?<child>[\w$-]+|\*)|\[(?<bracket>[^\]]*)\])/

function parseBracket(raw) {
  const text = raw.trim()

  if (text === '*') return { kind: 'wildcard' }

  const quoted = text.match(/^'([^']*)'$|^"([^"]*)"$/)
  if (quoted) return { kind: 'child', name: quoted[1] ?? quoted[2] }

  const slice = text.match(/^(-?\d+)?:(-?\d+)?$/)
  if (slice) return { kind: 'slice', from: slice[1] && Number(slice[1]), to: slice[2] && Number(slice[2]) }

  if (/^-?\d+$/.test(text)) return { kind: 'index', index: Number(text) }

  throw new Error(`Cannot read [${raw}] — expected a number, a slice, a quoted key or *`)
}

export function parsePath(expression) {
  let rest = expression.trim()
  if (!rest) return []

  // A leading $ is conventional and optional; so is a leading dot, so that
  // `a.b` and `$.a.b` both work.
  if (rest.startsWith('$')) rest = rest.slice(1)

  const steps = []

  while (rest) {
    // A bare name at the very start, as in `servers[0]`.
    if (!steps.length && /^[\w$-]/.test(rest)) {
      const name = rest.match(/^[\w$-]+/)[0]
      steps.push({ kind: 'child', name })
      rest = rest.slice(name.length)
      continue
    }

    const match = rest.match(SEGMENT)
    if (!match) throw new Error(`Cannot read "${rest}" — a path is made of .name, [0], [*], [1:3] and ..name`)

    const { descend, child, bracket } = match.groups

    if (descend !== undefined) steps.push({ kind: 'descend', name: descend })
    else if (child !== undefined) steps.push(child === '*' ? { kind: 'wildcard' } : { kind: 'child', name: child })
    else steps.push(parseBracket(bracket))

    rest = rest.slice(match[0].length)
  }

  return steps
}

const isContainer = value => value !== null && typeof value === 'object'

// The path a result was found at, written so it can be pasted back in.
const join = (path, key) =>
  typeof key === 'number' ? `${path}[${key}]` : /^[\w$]+$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`

function entriesOf(value) {
  if (Array.isArray(value)) return value.map((item, index) => [index, item])
  if (isContainer(value)) return Object.entries(value)
  return []
}

function step(found, instruction) {
  const out = []

  for (const { path, value } of found) {
    switch (instruction.kind) {
      case 'child': {
        if (!isContainer(value) || !(instruction.name in value)) break
        out.push({ path: join(path, Array.isArray(value) ? Number(instruction.name) : instruction.name), value: value[instruction.name] })
        break
      }

      case 'index': {
        if (!Array.isArray(value)) break
        // A negative index counts from the end, as it does everywhere else.
        const index = instruction.index < 0 ? value.length + instruction.index : instruction.index
        if (index in value) out.push({ path: join(path, index), value: value[index] })
        break
      }

      case 'slice': {
        if (!Array.isArray(value)) break
        const from = instruction.from ?? 0
        const to = instruction.to ?? value.length
        for (let i = from < 0 ? value.length + from : from; i < (to < 0 ? value.length + to : to); i++) {
          if (i in value) out.push({ path: join(path, i), value: value[i] })
        }
        break
      }

      case 'wildcard': {
        for (const [key, child] of entriesOf(value)) out.push({ path: join(path, key), value: child })
        break
      }

      case 'descend': {
        // Breadth-first, so the shallowest hit is listed first — which is
        // almost always the one being looked for.
        const queue = [{ path, value }]
        while (queue.length) {
          const current = queue.shift()
          for (const [key, child] of entriesOf(current.value)) {
            const childPath = join(current.path, key)
            if (instruction.name === '*' || String(key) === instruction.name) {
              out.push({ path: childPath, value: child })
            }
            if (isContainer(child)) queue.push({ path: childPath, value: child })
          }
        }
        break
      }
    }
  }

  return out
}

/**
 * @param {unknown} document  the parsed value
 * @param {string} expression
 * @returns {{path: string, value: unknown}[]}
 * @throws {Error} if the expression does not parse
 */
export default function query(document, expression) {
  const steps = parsePath(expression)

  let found = [{ path: '$', value: document }]
  for (const instruction of steps) found = step(found, instruction)

  return found
}
