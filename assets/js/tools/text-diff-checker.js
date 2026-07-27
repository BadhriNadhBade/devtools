import { $, live, segment, status, clearStatus } from '../lib/ui.js'
import { diffTokens, splitLines, splitWords, countChanges } from '../lib/diff.js'

const original = $('#original')
const changed = $('#changed')
const ignoreCase = $('#ignore-case')
const ignoreWhitespace = $('#ignore-whitespace')
const diffOut = $('#diff')
const summary = $('#summary')

const SAMPLE_ORIGINAL = [
  'The quick brown fox',
  'jumps over the lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump!',
  'The five boxing wizards jump quickly.'
].join('\n')

const SAMPLE_CHANGED = [
  'The quick brown fox',
  'leaps over the lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'Sphinx of black quartz, judge my vow.',
  'How vexingly quick daft zebras jump!',
  'The five boxing wizards jump quickly.'
].join('\n')

const readGranularity = segment('granularity', run)

// What gets compared, as opposed to what gets displayed. The diff runs over
// these keys so "ignore case" can change the comparison without changing the
// text shown back to you.
function key(token) {
  let value = token
  if (ignoreWhitespace.checked) value = value.replace(/\s+/g, ' ').trim()
  if (ignoreCase.checked) value = value.toLowerCase()
  return value
}

// Two large unrelated inputs can diff into hundreds of thousands of parts, and
// one element each would lock the tab up for far longer than anyone would wait.
// The summary below the view still counts every change.
const RENDER_LIMIT = 20000

function render(parts, byWord) {
  diffOut.replaceChildren()
  // The two modes lay out differently enough — block rows versus reflowing
  // prose — that the stylesheet handles each on its own.
  diffOut.className = `tool-out tool-diff ${byWord ? 'tool-diff--words' : 'tool-diff--lines'}`

  const shown = parts.length > RENDER_LIMIT ? parts.slice(0, RENDER_LIMIT) : parts

  for (const part of shown) {
    const element = document.createElement(
      part.type === 'add' ? 'ins' : part.type === 'del' ? 'del' : 'span'
    )
    element.textContent = part.text
    diffOut.append(element)
  }

  return shown.length < parts.length
}

function run() {
  const byWord = readGranularity() === 'words'
  const split = byWord ? splitWords : splitLines

  const left = original.value
  const right = changed.value

  if (!left && !right) {
    diffOut.replaceChildren()
    summary.textContent = ''
    clearStatus()
    return
  }

  const a = split(left)
  const b = split(right)

  const parts = diffTokens(a.map(key), b.map(key))

  // Walk the result back over the untouched tokens so the display shows the
  // original text rather than the normalised comparison keys.
  let i = 0
  let j = 0
  const display = parts.map(part => {
    if (part.type === 'del') return { type: 'del', text: a[i++] }
    if (part.type === 'add') return { type: 'add', text: b[j++] }
    const text = a[i++]
    j++
    return { type: 'same', text }
  })

  const truncated = render(display, byWord)

  const { added, removed } = countChanges(parts)
  const unit = byWord ? 'word' : 'line'
  summary.textContent = added || removed
    ? `+${added} −${removed} ${unit}${added + removed === 1 ? '' : 's'}`
    : 'identical'

  if (truncated) status(`Showing the first ${RENDER_LIMIT.toLocaleString()} ${unit}s — the counts above cover all of it`, 'info')
  else if (!added && !removed) status('The two sides are identical', 'ok')
  else clearStatus()
}

$('#sample').addEventListener('click', () => {
  original.value = SAMPLE_ORIGINAL
  changed.value = SAMPLE_CHANGED
  run()
})

$('#swap').addEventListener('click', () => {
  const held = original.value
  original.value = changed.value
  changed.value = held
  run()
})

live([original, changed, ignoreCase, ignoreWhitespace], run)

run()
