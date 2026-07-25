// The matching loop, shared by the main thread and the worker so it exists in
// exactly one place.
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
