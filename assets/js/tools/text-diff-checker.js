import {
  $, live, segment, status, clearStatus, copyButton, download, clearButton, clearField,
  setField, dropZone, filePicker, pasteButton, readFileText,
  remember, prefill, receive, shortcuts
} from '../lib/ui.js'
import { diffTokens, splitLines, splitWords, countChanges, alignRows, toUnifiedPatch } from '../lib/diff.js'

const original = $('#original')
const changed = $('#changed')
const ignoreCase = $('#ignore-case')
const ignoreWhitespace = $('#ignore-whitespace')
const view = $('#view')
const context = $('#context')
const contextField = $('#context-field')
const diffOut = $('#diff')
const summary = $('#summary')
const patchButton = $('#patch')

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
const readView = segment('view', run)

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

// A paired row shows which words moved as well as which lines did. Past this
// many words on a side the second diff stops earning its cost, and the line
// tint alone carries the change.
const INLINE_LIMIT = 400

// Which folded runs have been opened by hand. Keyed by where the run starts,
// which is stable for as long as the inputs are.
let expanded = new Set()

function mark(type, text) {
  const element = document.createElement(type === 'del' ? 'del' : 'ins')
  element.className = 'tool-diff-word'
  element.textContent = text
  return element
}

// Diffs the two halves of a changed row against each other and returns both
// cells' contents, with only the words that actually moved marked up. One diff
// serves both sides: its deletions belong to the left cell, its additions to
// the right, and the parts they share are the text around them.
function inlinePair(left, right) {
  const a = splitWords(left)
  const b = splitWords(right)

  if (a.length > INLINE_LIMIT || b.length > INLINE_LIMIT) return [left, right]

  const parts = diffTokens(a.map(key), b.map(key))

  // Two lines with nothing in common at all diff into one solid block of
  // highlight, which says no more than the line tint already does.
  if (!parts.some(part => part.type === 'same')) return [left, right]

  const leftCell = document.createDocumentFragment()
  const rightCell = document.createDocumentFragment()
  let i = 0
  let j = 0

  for (const part of parts) {
    if (part.type === 'del') leftCell.append(mark('del', a[i++]))
    else if (part.type === 'add') rightCell.append(mark('add', b[j++]))
    else {
      leftCell.append(a[i++])
      rightCell.append(b[j++])
    }
  }

  return [leftCell, rightCell]
}

function gutter(number, side, kind) {
  const element = document.createElement('span')
  element.className = `tool-diff-num tool-diff-num--${side} tool-diff-num--${kind}`
  // The numbers orient the eye; read aloud in sequence they only get in the
  // way of the text they are numbering.
  element.setAttribute('aria-hidden', 'true')
  if (number !== null) element.textContent = number
  return element
}

function cell(content, side, kind) {
  const element = document.createElement('span')
  element.className = `tool-diff-cell tool-diff-cell--${side} tool-diff-cell--${kind}`
  if (content !== null) element.append(content)
  return element
}

// One row standing in for a run of lines that did not change. Clicking it puts
// the run back; nothing is lost, only deferred.
function fold(at, count) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tool-diff-fold'
  button.textContent = `⋯ ${count} unchanged line${count === 1 ? '' : 's'}`
  button.setAttribute('aria-expanded', 'false')

  button.addEventListener('click', () => {
    expanded.add(at)
    run()
  })

  return button
}

// Walks a list of unchanged/changed items and returns what to draw: the items
// near a change, and a fold in place of every long run between them.
//
// Deliberately generic over what an item is — the side-by-side view passes
// rows, the unified view passes parts — because the rule is the same either
// way and only the rendering differs.
function withFolds(items, isSame, lines) {
  if (!lines) return items.map(item => ({ item }))

  const out = []
  let i = 0

  while (i < items.length) {
    if (!isSame(items[i])) {
      out.push({ item: items[i] })
      i++
      continue
    }

    let end = i
    while (end < items.length && isSame(items[end])) end++

    const length = end - i
    const first = i === 0
    const last = end === items.length

    // A run is only worth folding if hiding its middle saves more than the
    // fold row costs. The head and tail of the file keep no context on the
    // outside, so they can be folded closer to the edge.
    const keepBefore = first ? 0 : lines
    const keepAfter = last ? 0 : lines

    if (length <= keepBefore + keepAfter + 1 || expanded.has(i)) {
      for (let k = i; k < end; k++) out.push({ item: items[k] })
      i = end
      continue
    }

    for (let k = i; k < i + keepBefore; k++) out.push({ item: items[k] })
    out.push({ fold: { at: i, count: length - keepBefore - keepAfter } })
    for (let k = end - keepAfter; k < end; k++) out.push({ item: items[k] })

    i = end
  }

  return out
}

// Side-by-side: each text keeps its own column and its own line numbers, and a
// row's two halves always sit level because they are cells of one grid row.
function renderSplit(rows, lines) {
  diffOut.className = 'tool-out tool-diff tool-diff--split'

  const shown = rows.length > RENDER_LIMIT ? rows.slice(0, RENDER_LIMIT) : rows
  const out = document.createDocumentFragment()

  for (const entry of withFolds(shown, row => row.kind === 'same', lines)) {
    if (entry.fold) {
      out.append(fold(entry.fold.at, entry.fold.count))
      continue
    }

    const row = entry.item
    const paired = row.kind === 'change'
    const [left, right] = paired ? inlinePair(row.left, row.right) : [row.left, row.right]

    const leftKind = row.left === null ? 'empty' : row.kind === 'same' ? 'same' : 'del'
    const rightKind = row.right === null ? 'empty' : row.kind === 'same' ? 'same' : 'add'

    out.append(
      gutter(row.leftNo, 'l', leftKind),
      cell(left, 'l', leftKind),
      gutter(row.rightNo, 'r', rightKind),
      cell(right, 'r', rightKind)
    )
  }

  diffOut.replaceChildren(out)
  return shown.length < rows.length
}

// Unified: one stream of parts, the way `diff` prints it.
function renderInline(parts, byWord, lines) {
  // The two modes lay out differently enough — block rows versus reflowing
  // prose — that the stylesheet handles each on its own.
  diffOut.className = `tool-out tool-diff ${byWord ? 'tool-diff--words' : 'tool-diff--lines'}`

  const shown = parts.length > RENDER_LIMIT ? parts.slice(0, RENDER_LIMIT) : parts
  const out = document.createDocumentFragment()

  // Prose reflows rather than sitting in rows, so there is nothing there a
  // fold could stand in for.
  for (const entry of withFolds(shown, part => part.type === 'same', byWord ? 0 : lines)) {
    if (entry.fold) {
      out.append(fold(entry.fold.at, entry.fold.count))
      continue
    }

    const part = entry.item
    const element = document.createElement(
      part.type === 'add' ? 'ins' : part.type === 'del' ? 'del' : 'span'
    )
    element.textContent = part.text
    out.append(element)
  }

  diffOut.replaceChildren(out)
  return shown.length < parts.length
}

// The diff as it was last computed, so the copy and patch buttons do not have
// to run it again.
let last = { parts: [], byWord: true }

function run() {
  const byWord = readGranularity() === 'words'
  // Word mode reflows as prose rather than laying out in rows, so there is
  // nothing for two columns to line up against, and nothing to fold.
  view.hidden = byWord
  contextField.hidden = byWord
  patchButton.hidden = byWord

  const sideBySide = !byWord && readView() === 'split'
  const lines = Number(context.value)

  const split = byWord ? splitWords : splitLines

  const left = original.value
  const right = changed.value

  if (!left && !right) {
    diffOut.replaceChildren()
    summary.textContent = ''
    last = { parts: [], byWord }
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
    // Both sides are kept for an unchanged part. The single-column views show
    // the first; side by side shows each column its own, which is what makes
    // "ignore case" honest about what each text actually says.
    return { type: 'same', text: a[i++], right: b[j++] }
  })

  last = { parts: display, byWord }

  const truncated = sideBySide
    ? renderSplit(alignRows(display), lines)
    : renderInline(display, byWord, lines)

  const { added, removed } = countChanges(parts)
  const unit = byWord ? 'word' : 'line'
  summary.textContent = added || removed
    ? `+${added} −${removed} ${unit}${added + removed === 1 ? '' : 's'}`
    : 'identical'

  if (truncated) status(`Showing the first ${RENDER_LIMIT.toLocaleString()} ${sideBySide ? 'rows' : `${unit}s`} — the counts above cover all of it`, 'info')
  else if (!added && !removed) status('The two sides are identical', 'ok')
  else clearStatus()
}

// Editing either side invalidates which runs were opened: the run that was at
// row 40 is not the run that is there now.
function reset() {
  expanded = new Set()
  run()
}

const patch = () => last.byWord
  ? ''
  : toUnifiedPatch(last.parts, { context: Number(context.value) || 3 })

$('#sample').addEventListener('click', () => {
  setField(original, SAMPLE_ORIGINAL)
  setField(changed, SAMPLE_CHANGED)
  reset()
})

$('#swap').addEventListener('click', () => {
  const held = original.value
  setField(original, changed.value)
  setField(changed, held)
  reset()
})

patchButton.addEventListener('click', () => {
  const text = patch()
  if (!text) {
    status('Nothing to write a patch from — the two sides are identical', 'info')
    return
  }
  download('changes.patch', text, 'text/x-patch')
})

// A side per pane, each with all three routes in. The buttons matter most on a
// touch screen, where a drop is not something the device can do at all and the
// two boxes were otherwise unreachable by file.
function side(field, pane, open, paste) {
  const load = async file => {
    setField(field, await readFileText(file))
    reset()
  }

  dropZone($(pane), load)
  filePicker($(open), load)
  pasteButton($(paste), field, reset)
}

side(original, '#original-pane', '#open-original', '#paste-original')
side(changed, '#changed-pane', '#open-changed', '#paste-changed')

// Copying the diff means copying a patch — the rendered view carries colour
// and line numbers that would paste as noise.
copyButton($('#copy'), patch)

clearButton($('#clear'), [original, changed], reset)
shortcuts({ run: reset, clear: () => { clearField(original); clearField(changed); reset() } })

live([original, changed, ignoreCase, ignoreWhitespace, context], reset)

remember('devtools.diff', [
  ignoreCase, ignoreWhitespace, context,
  $('#granularity-lines'), $('#granularity-words'),
  $('#view-split'), $('#view-unified')
])

// After `remember`, so a link naming a view beats the one left selected last
// time.
prefill([
  original, changed, ignoreCase, ignoreWhitespace, context,
  $('#granularity-lines'), $('#granularity-words'),
  $('#view-split'), $('#view-unified')
])

run()

// Whatever was sent over is the thing being compared against: it lands on the
// left, leaving the right-hand box for what it is being compared to.
receive(original, reset)
