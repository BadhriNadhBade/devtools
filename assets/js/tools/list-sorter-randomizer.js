import {
  $, live, segment, copyButton, pasteButton, clearButton, clearField, setField,
  download, status, clearStatus, dropZone, filePicker, readFileText,
  remember, prefill, sendTo, receive, shortcuts
} from '../lib/ui.js'

const input = $('#input')
const output = $('#output')
const second = $('#second')
const secondPane = $('#second-pane')
const inputCount = $('#input-count')
const outputCount = $('#output-count')
const secondCount = $('#second-count')

const unique = $('#unique')
const trim = $('#trim')
const dropEmpty = $('#drop-empty')
const ignoreCase = $('#ignore-case')
const natural = $('#natural')

const field = $('#field')
const delimiter = $('#delimiter')
const delimiterField = $('#delimiter-field')
const column = $('#column')
const columnField = $('#column-field')
const filter = $('#filter')
const invert = $('#invert')
const compare = $('#compare')

const prefix = $('#prefix')
const suffix = $('#suffix')
const join = $('#join')
const number = $('#number')

const SAMPLE = [
  'banana', 'Apple', 'cherry', 'apple', 'item 10', 'item 9', 'item 100',
  'date', '', 'elderberry', 'Banana', 'fig'
].join('\n')

const SAMPLE_SECOND = ['apple', 'cherry', 'grape', 'fig'].join('\n')

const readOrder = segment('order', run)

// Fisher-Yates, drawing each index from the cryptographic source with
// rejection sampling so every permutation stays equally likely.
function shuffle(items) {
  const shuffled = [...items]
  const buffer = new Uint32Array(1)

  for (let i = shuffled.length - 1; i > 0; i--) {
    const bound = i + 1
    const ceiling = Math.floor(4294967296 / bound) * bound

    let value
    do {
      crypto.getRandomValues(buffer)
      value = buffer[0]
    } while (value >= ceiling)

    const j = value % bound
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

// "".split("\n") is [""], so an untouched box would otherwise report one line.
const countLabel = count => `${count} line${count === 1 ? '' : 's'}`

// The part of a line the sort and the comparison look at. Sorting a CSV on its
// third column is the common case, and doing it by hand means cutting the file
// apart and putting it back together.
function sortable(line) {
  if (field.value !== 'column') return line

  const separator = delimiter.value === '\\t' ? '\t' : delimiter.value
  const index = Math.max(1, parseInt(column.value, 10) || 1) - 1
  return line.split(separator)[index] ?? ''
}

// A filter is text unless it is wrapped in slashes, in which case it is a
// regex — the same convention every editor's search box uses. A regex that does
// not compile filters nothing rather than emptying the list.
function matcher() {
  const pattern = filter.value
  if (!pattern) return null

  const regex = pattern.match(/^\/(.*)\/([gimsuy]*)$/)
  if (regex) {
    try {
      const compiled = new RegExp(regex[1], regex[2].replace(/g/g, ''))
      return line => compiled.test(line)
    } catch (err) {
      return { error: err.message }
    }
  }

  const needle = ignoreCase.checked ? pattern.toLowerCase() : pattern
  return line => (ignoreCase.checked ? line.toLowerCase() : line).includes(needle)
}

// What two lines have to share to count as the same line, for both the
// duplicate check and the comparison against the second list.
const identity = line => (ignoreCase.checked ? line.toLowerCase() : line)

function normalize(text) {
  let lines = text ? text.split(/\r?\n/) : []
  if (trim.checked) lines = lines.map(line => line.trim())
  if (dropEmpty.checked) lines = lines.filter(line => line.trim())
  return lines
}

function applyCompare(lines, other) {
  const mine = new Set(lines.map(identity))
  const theirs = new Set(other.map(identity))

  switch (compare.value) {
    case 'union': {
      // Order matters here: the first list keeps its place and the second
      // list's additions follow, rather than the pair being merged and resorted
      // out of recognition.
      const extra = other.filter(line => !mine.has(identity(line)))
      return [...lines, ...extra]
    }
    case 'both':
      return lines.filter(line => theirs.has(identity(line)))
    case 'first':
      return lines.filter(line => !theirs.has(identity(line)))
    case 'second':
      return other.filter(line => !mine.has(identity(line)))
    default:
      return lines
  }
}

function sort(lines) {
  const collator = new Intl.Collator(undefined, {
    numeric: natural.checked,
    sensitivity: ignoreCase.checked ? 'base' : 'variant'
  })

  const by = (a, b) => collator.compare(sortable(a), sortable(b))

  switch (readOrder()) {
    case 'ascending':
      return [...lines].sort(by)
    case 'descending':
      return [...lines].sort((a, b) => by(b, a))
    case 'numeric': {
      // Lines with no number in them sort to the end rather than being read as
      // zero, which would bury them in the middle of the numbers.
      const value = line => {
        const found = sortable(line).match(/-?\d+(\.\d+)?/)
        return found ? Number(found[0]) : Number.POSITIVE_INFINITY
      }
      return [...lines].sort((a, b) => value(a) - value(b) || by(a, b))
    }
    case 'length':
      return [...lines].sort((a, b) => sortable(a).length - sortable(b).length || by(a, b))
    case 'reversed':
      return [...lines].reverse()
    case 'random':
      return shuffle(lines)
    default:
      return lines
  }
}

function decorate(lines) {
  const width = String(lines.length).length

  return lines.map((line, index) => {
    const wrapped = `${prefix.value}${line}${suffix.value}`
    return number.checked ? `${String(index + 1).padStart(width, ' ')}. ${wrapped}` : wrapped
  })
}

function run() {
  const comparing = compare.value !== 'none'
  secondPane.hidden = !comparing
  delimiterField.hidden = field.value !== 'column'
  columnField.hidden = field.value !== 'column'

  let lines = normalize(input.value)
  inputCount.textContent = countLabel(lines.length)

  const other = normalize(second.value)
  secondCount.textContent = countLabel(other.length)

  const keep = matcher()
  if (keep && keep.error) {
    output.value = ''
    outputCount.textContent = ''
    status(`That filter is not a valid regex — ${keep.error}`, 'err')
    return
  }

  if (keep) lines = lines.filter(line => keep(line) !== invert.checked)

  if (unique.checked) {
    const seen = new Set()
    lines = lines.filter(line => {
      const key = identity(line)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const before = lines.length
  if (comparing) lines = applyCompare(lines, other)

  lines = decorate(sort(lines))

  output.value = join.value ? lines.join(join.value) : lines.join('\n')
  outputCount.textContent = countLabel(lines.length)

  if (comparing) {
    status(`${lines.length} of ${before} kept after comparing against ${other.length} line${other.length === 1 ? '' : 's'}`, 'ok')
  } else {
    clearStatus()
  }
}

$('#sample').addEventListener('click', () => {
  setField(input, SAMPLE)
  setField(second, SAMPLE_SECOND)
  run()
})

$('#download').addEventListener('click', () => {
  if (!output.value) return
  download('list.txt', output.value)
})

async function load(file) {
  setField(input, await readFileText(file))
  run()
}

// Drop and picker both, because a drop is not something a phone or a tablet can
// do at all — without the button the file route simply is not there on a touch
// screen.
dropZone($('#input-pane'), load)
filePicker($('#open'), load, '.txt,.csv,.log,text/plain')

live([
  input, second, unique, trim, dropEmpty, ignoreCase, natural,
  field, delimiter, column, filter, invert, compare,
  prefix, suffix, join, number
], run)

copyButton($('#copy'), () => output.value)
pasteButton($('#paste'), input, run)
clearButton($('#clear'), [input, second], run)
shortcuts({ run, clear: () => { clearField(input); clearField(second); run() } })

// A sorted, deduplicated list is usually on its way into a comparison or into
// a pattern that has to match every line of it.
sendTo($('#send'), [
  'text-diff-checker',
  'regex-tester',
  'json-yaml-converter',
  'word-counter'
], () => output.value, 'list sorter')

remember('devtools.list', [
  unique, trim, dropEmpty, ignoreCase, natural, field, delimiter, column,
  invert, compare, prefix, suffix, join, number,
  $('#order-ascending'), $('#order-descending'), $('#order-numeric'),
  $('#order-length'), $('#order-reversed'), $('#order-random'), $('#order-none')
])

// After `remember`, so a link naming an order beats the one left selected last
// time. The filter travels with it: half of what this tool does is in that box.
prefill([
  input, second, unique, trim, dropEmpty, ignoreCase, natural,
  field, delimiter, column, filter, invert, compare, prefix, suffix, join, number,
  $('#order-ascending'), $('#order-descending'), $('#order-numeric'),
  $('#order-length'), $('#order-reversed'), $('#order-random'), $('#order-none')
])

run()

receive(input, run)
