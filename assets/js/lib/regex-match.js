// Everything a regular expression can be asked to do here, shared by the main
// thread and the worker so it exists in exactly one place.
//
// Results are plain objects rather than RegExp match arrays because they have
// to survive being posted between threads — a match array carries `index` and
// `groups` as properties, which structured cloning would drop.

const serialize = match => ({
  text: match[0],
  index: match.index,
  groups: match.slice(1),
  named: match.groups ? { ...match.groups } : null
})

/**
 * @param {string} pattern
 * @param {string} flags
 * @param {string} text
 * @param {number} limit  stop after this many matches
 * @throws {SyntaxError} if the pattern does not compile
 */
export default function matchAll(pattern, flags, text, limit) {
  const regex = new RegExp(pattern, flags)

  // Without /g there is only ever the first match, and exec would restart from
  // zero every time anyway.
  if (!regex.global) {
    const match = regex.exec(text)
    return match ? [serialize(match)] : []
  }

  const matches = []
  let match

  while ((match = regex.exec(text)) !== null) {
    matches.push(serialize(match))

    // A zero-length match leaves lastIndex untouched; without a nudge this
    // spins forever on a pattern like `a*`.
    if (match[0] === '') regex.lastIndex++
    if (matches.length >= limit) break
  }

  return matches
}

/**
 * Substitution, with the replacement read the way `String.replace` reads it —
 * `$1`, `$<name>` and `$&` all mean what they mean everywhere else.
 */
export function replaceAll(pattern, flags, text, replacement) {
  const regex = new RegExp(pattern, flags)
  const count = matchAll(pattern, flags, text, Number.MAX_SAFE_INTEGER).length

  return { text: text.replace(regex, replacement), count }
}

/**
 * Splitting on the pattern. Capture groups in the pattern end up in the result
 * — that is what `String.split` does, and hiding it would be a different
 * function wearing the same name.
 */
export function split(pattern, flags, text, limit) {
  // The /g flag means nothing to split and /y breaks it outright, so neither
  // is carried through.
  const regex = new RegExp(pattern, flags.replace(/[gy]/g, ''))
  const pieces = text.split(regex)

  return { pieces: pieces.slice(0, limit), total: pieces.length }
}

/**
 * The one entry point the worker speaks, so adding an operation means adding
 * a case here rather than a second message protocol.
 */
export function run({ op, pattern, flags, text, limit, replacement }) {
  if (op === 'replace') return replaceAll(pattern, flags, text, replacement)
  if (op === 'split') return split(pattern, flags, text, limit)
  return { matches: matchAll(pattern, flags, text, limit) }
}
