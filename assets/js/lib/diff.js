// Longest-common-subsequence diff over an array of tokens. The diff tool uses
// it for both granularities: lines, and words within a line.

// The DP table is (n+1)*(m+1) 32-bit cells, so this cap keeps it at 8MB. Past
// that the two inputs are almost certainly unrelated and a token-level diff
// would be noise anyway, so the middle section is reported as one replacement.
const MAX_CELLS = 2_000_000

function middle(a, b) {
  const n = a.length
  const m = b.length

  if (n === 0) return b.map(text => ({ type: 'add', text }))
  if (m === 0) return a.map(text => ({ type: 'del', text }))

  if ((n + 1) * (m + 1) > MAX_CELLS) {
    return [
      ...a.map(text => ({ type: 'del', text })),
      ...b.map(text => ({ type: 'add', text }))
    ]
  }

  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }

  const out = []
  let i = 0
  let j = 0

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }

  while (i < n) out.push({ type: 'del', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })

  return out
}

/**
 * Diffs two token arrays.
 *
 * Common head and tail are stripped first — for the usual case of a small
 * edit in a large file that leaves the DP table tiny.
 *
 * @returns {{type: 'same'|'add'|'del', text: string}[]}
 */
export function diffTokens(a, b) {
  let start = 0
  const shortest = Math.min(a.length, b.length)
  while (start < shortest && a[start] === b[start]) start++

  let aEnd = a.length
  let bEnd = b.length
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--
    bEnd--
  }

  const out = []
  for (let i = 0; i < start; i++) out.push({ type: 'same', text: a[i] })

  // Appended one at a time rather than spread into push: two large unrelated
  // inputs can put hundreds of thousands of parts in here, and spreading an
  // array that long overflows the argument limit — the diff would die with a
  // stack overflow on exactly the input that needs it most.
  for (const part of middle(a.slice(start, aEnd), b.slice(start, bEnd))) out.push(part)

  for (let i = aEnd; i < a.length; i++) out.push({ type: 'same', text: a[i] })

  return out
}

export const splitLines = text => text.split('\n')

// Keeps the whitespace attached to each token so a word diff can be rendered
// back as readable text.
export const splitWords = text => text.match(/\S+\s*|\s+/g) || []

export function countChanges(parts) {
  let added = 0
  let removed = 0
  for (const part of parts) {
    if (part.type === 'add') added++
    else if (part.type === 'del') removed++
  }
  return { added, removed, unchanged: parts.length - added - removed }
}

/**
 * Pairs a linear diff into rows for a side-by-side view.
 *
 * A run of deletions followed by a run of additions is the same edit seen from
 * both sides, so the two runs are zipped together into `change` rows. Whatever
 * is left over when one run is longer becomes a one-sided row, and the empty
 * half is rendered as a gap so the two columns stay level.
 *
 * An unchanged part may carry a `right`: two lines can match on the comparison
 * keys without being the same string — "ignore case" is exactly that — and each
 * column has to show what its own side actually says.
 *
 * @param {{type: 'same'|'add'|'del', text: string, right?: string}[]} parts
 * @returns {{kind: 'same'|'change'|'del'|'add', left: string|null, right: string|null, leftNo: number|null, rightNo: number|null}[]}
 */
export function alignRows(parts) {
  const rows = []
  let leftNo = 0
  let rightNo = 0
  let i = 0

  while (i < parts.length) {
    if (parts[i].type === 'same') {
      rows.push({
        kind: 'same',
        left: parts[i].text,
        right: parts[i].right ?? parts[i].text,
        leftNo: ++leftNo,
        rightNo: ++rightNo
      })
      i++
      continue
    }

    // Collect the whole run of changed parts at once. Sorting them into two
    // buckets rather than reading them in order means the pairing holds
    // whichever way round the diff happened to emit them.
    const dels = []
    const adds = []
    while (i < parts.length && parts[i].type !== 'same') {
      (parts[i].type === 'del' ? dels : adds).push(parts[i].text)
      i++
    }

    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      const left = k < dels.length ? dels[k] : null
      const right = k < adds.length ? adds[k] : null

      rows.push({
        kind: left !== null && right !== null ? 'change' : left !== null ? 'del' : 'add',
        left,
        right,
        leftNo: left === null ? null : ++leftNo,
        rightNo: right === null ? null : ++rightNo
      })
    }
  }

  return rows
}
