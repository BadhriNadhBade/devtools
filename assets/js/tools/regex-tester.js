import {
  $, $$, live, segment, status, clearStatus, copyButton, pasteButton, clearButton, clearField,
  dropZone, readFileText, remember, shortcuts
} from '../lib/ui.js'
import { run as runRegex } from '../lib/regex-match.js'

const patternInput = $('#pattern')
const input = $('#input')
const replacement = $('#replacement')
const replacementField = $('#replacement-field')
const highlight = $('#highlight')
const highlightPane = $('#highlight-pane')
const matchesOut = $('#matches')
const matchesPane = $('#matches-pane')
const resultPane = $('#result-pane')
const resultOut = $('#result')
const countOut = $('#count')
const library = $('#library')

const SAMPLE_PATTERN = '(\\w+)@(\\w+\\.\\w+)'
const SAMPLE_TEXT = [
  'Send the invoice to accounts@example.com and cc finance@example.org.',
  'Older addresses like billing@example.net are no longer monitored.',
  'Anything without an at sign — such as example.com — should not match.'
].join('\n')

// Patterns worth not writing from memory, each with something to try it on.
// Deliberately readable rather than exhaustive: a regex that matches every
// legal email address is famously unreadable and nobody wants it pasted into
// their code.
const LIBRARY = [
  {
    name: 'Email',
    pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+',
    text: 'accounts@example.com, first.last+tag@mail.example.co.uk, not-an-address@, plain text'
  },
  {
    name: 'URL',
    pattern: 'https?://[\\w.-]+(?:/[^\\s]*)?',
    text: 'See https://devtools.badhrinadh.com/regex-tester and http://example.com for more.'
  },
  {
    name: 'IPv4',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b',
    text: '10.0.0.1 routed via 192.168.1.254; 256.1.1.1 is not an address.'
  },
  {
    name: 'UUID',
    pattern: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\\b',
    text: '018f4d6c-1a2b-7c3d-8e4f-5a6b7c8d9e0f and 123e4567-e89b-12d3-a456-426614174000'
  },
  {
    name: 'ISO date',
    pattern: '\\b\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])\\b',
    text: 'Released 2024-01-31, superseded 2025-12-01. Not a date: 2024-13-40.'
  },
  {
    name: 'Hex colour',
    pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b',
    text: 'background: #fdfdfd; color: #303030; border: #ccc; not-a-colour: #12345'
  },
  {
    name: 'Duplicate word',
    pattern: '\\b(\\w+)\\s+\\1\\b',
    text: 'The the quick brown fox jumps over over the lazy dog.'
  },
  {
    name: 'Trailing space',
    pattern: '[ \\t]+$',
    text: 'one   \ntwo\nthree\t\n'
  },
  {
    name: 'Log line',
    pattern: '^(?<time>\\S+)\\s+(?<level>[A-Z]+)\\s+(?<message>.*)$',
    text: '2024-01-31T09:14:02Z WARN disk almost full\n2024-01-31T09:14:09Z INFO retry scheduled',
    flags: 'gm'
  }
]

// A runaway pattern on a long input can produce an unusable number of hits.
const MATCH_LIMIT = 5000

// How long a single pattern gets before we assume it is never coming back.
const TIMEOUT = 2000

const readOp = segment('op', run)
const flags = () => $$('.flag').filter(box => box.checked).map(box => box.value).join('')

// Matching runs in a worker so a pattern that backtracks forever can be killed
// off. Every request carries a generation number; replies for anything but the
// newest are dropped, which is what keeps a slow run from overwriting the
// results of a faster one that came after it.
let worker
let canUseWorker = typeof Worker === 'function'
let deadline
let generation = 0
let requestedText = ''
let requestedOp = 'match'

function ensureWorker() {
  if (worker) return worker

  worker = new Worker('/assets/js/lib/regex-worker.js', { type: 'module' })

  worker.addEventListener('message', ({ data }) => {
    if (data.id !== generation) return
    clearTimeout(deadline)

    if (data.error) showError(data.error)
    else show(data)
  })

  // The worker failing to start at all — a blocked module worker, say — is not
  // something to retry, so matching falls back to this thread from here on.
  worker.addEventListener('error', () => {
    worker.terminate()
    worker = null
    canUseWorker = false
    run()
  })

  return worker
}

function renderHighlight(text, found) {
  highlight.replaceChildren()

  let cursor = 0
  for (const match of found) {
    if (match.text === '') continue

    if (match.index > cursor) {
      highlight.append(document.createTextNode(text.slice(cursor, match.index)))
    }

    const mark = document.createElement('mark')
    mark.className = 'tool-match'
    mark.textContent = match.text
    highlight.append(mark)

    cursor = match.index + match.text.length
  }

  highlight.append(document.createTextNode(text.slice(cursor)))
}

function renderMatches(found) {
  matchesOut.replaceChildren()

  if (!found.length) return

  const hasGroups = found.some(match => match.groups.length > 0 || match.named)

  // Built with an explicit thead/tbody: appending <tr> straight to a <table>
  // leaves the DOM in a shape no parser would ever produce.
  const table = document.createElement('table')
  table.className = 'tool-table'

  const head = table.createTHead().insertRow()
  for (const label of ['#', 'Match', 'At', ...(hasGroups ? ['Groups'] : [])]) {
    const th = document.createElement('th')
    th.scope = 'col'
    th.textContent = label
    head.append(th)
  }

  // Showing every hit of a broad pattern makes the page unusable; the count
  // above the table still reports the true total.
  const body = table.createTBody()
  for (const [index, match] of found.slice(0, 200).entries()) {
    const cells = [
      String(index + 1),
      match.text === '' ? '(empty match)' : match.text,
      String(match.index)
    ]

    if (hasGroups) {
      const named = Object.entries(match.named || {})
        .map(([name, value]) => `${name}: ${value ?? '—'}`)
      const numbered = match.groups.map((value, position) => `${position + 1}: ${value ?? '—'}`)
      cells.push([...numbered, ...named].join('  ') || '—')
    }

    const row = body.insertRow()
    for (const value of cells) {
      row.insertCell().textContent = value
    }
  }

  matchesOut.append(table)
}

function renderPieces(pieces, total) {
  matchesOut.replaceChildren()

  const table = document.createElement('table')
  table.className = 'tool-table'

  const head = table.createTHead().insertRow()
  for (const label of ['#', 'Piece']) {
    const th = document.createElement('th')
    th.scope = 'col'
    th.textContent = label
    head.append(th)
  }

  const body = table.createTBody()
  for (const [index, piece] of pieces.slice(0, 200).entries()) {
    const row = body.insertRow()
    row.insertCell().textContent = String(index + 1)
    // A split can legitimately produce an empty piece — two delimiters in a
    // row — and an empty cell would read as a rendering failure.
    row.insertCell().textContent = piece === '' ? '(empty)' : piece === undefined ? '(no match)' : piece
  }

  matchesOut.append(table)
  countOut.textContent = `${total} piece${total === 1 ? '' : 's'}`
}

function show(data) {
  if (requestedOp === 'replace') {
    resultOut.value = data.text
    renderHighlight(requestedText, [])
    matchesOut.replaceChildren()
    countOut.textContent = data.count
      ? `${data.count} replacement${data.count === 1 ? '' : 's'}`
      : 'no matches'

    if (!data.count) status('Nothing matched, so nothing was replaced', 'info')
    else clearStatus()
    return
  }

  if (requestedOp === 'split') {
    resultOut.value = data.pieces.join('\n')
    renderPieces(data.pieces, data.total)
    clearStatus()
    return
  }

  const found = data.matches
  renderHighlight(requestedText, found)
  renderMatches(found)

  const capped = found.length >= MATCH_LIMIT
  countOut.textContent = found.length
    ? `${found.length}${capped ? '+' : ''} match${found.length === 1 ? '' : 'es'}`
    : 'no matches'

  if (capped) status(`Stopped after ${MATCH_LIMIT} matches`, 'info')
  else if (found.length > 200) status('Showing the first 200 in the table', 'info')
  else clearStatus()
}

function showError(message) {
  highlight.textContent = requestedText
  matchesOut.replaceChildren()
  resultOut.value = ''
  countOut.textContent = ''
  status(message, 'err')
}

function run() {
  const op = readOp()
  const pattern = patternInput.value
  const text = input.value

  replacementField.hidden = op !== 'replace'
  resultPane.hidden = op === 'match'
  highlightPane.hidden = op !== 'match'
  matchesPane.hidden = op === 'replace'

  if (!pattern) {
    highlight.textContent = text
    matchesOut.replaceChildren()
    resultOut.value = op === 'match' ? '' : text
    countOut.textContent = ''
    clearStatus()
    return
  }

  generation++
  requestedText = text
  requestedOp = op

  const request = {
    id: generation,
    op,
    pattern,
    flags: flags(),
    text,
    limit: MATCH_LIMIT,
    replacement: replacement.value
  }

  if (!canUseWorker) {
    try {
      show(runRegex(request))
    } catch (error) {
      showError(error.message)
    }
    return
  }

  clearTimeout(deadline)
  const id = generation
  deadline = setTimeout(() => {
    // Terminating is the only way to stop runaway backtracking; the next run
    // starts a fresh worker.
    if (worker) worker.terminate()
    worker = null

    if (id !== generation) return
    showError(`That pattern didn't finish in ${TIMEOUT / 1000}s — it is probably backtracking. Try making it less ambiguous.`)
  }, TIMEOUT)

  ensureWorker().postMessage(request)
}

// Each entry brings its own text, so picking one shows a result rather than
// leaving the pattern to be tried against whatever happened to be there.
for (const entry of LIBRARY) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tool-button--ghost monospace'
  button.textContent = entry.name

  button.addEventListener('click', () => {
    patternInput.value = entry.pattern
    input.value = entry.text

    if (entry.flags) {
      for (const box of $$('.flag')) box.checked = entry.flags.includes(box.value)
    }

    run()
  })

  library.append(button)
}

$('#sample').addEventListener('click', () => {
  patternInput.value = SAMPLE_PATTERN
  input.value = SAMPLE_TEXT
  run()
})

// Chaining substitutions is the usual way a messy paste gets cleaned up.
$('#apply').addEventListener('click', () => {
  if (!resultOut.value) return
  input.value = resultOut.value
  run()
})

dropZone($('#input-pane'), async file => {
  input.value = await readFileText(file)
  run()
})

live([patternInput, input, replacement, ...$$('.flag')], run)
copyButton($('#copy'), () => resultOut.value)
pasteButton($('#paste'), input, run)
clearButton($('#clear'), input, run)
shortcuts({ run, clear: () => { clearField(input); run() } })

remember('devtools.regex', [
  patternInput, replacement, ...$$('.flag'),
  $('#op-match'), $('#op-replace'), $('#op-split')
])

// Seed the box on a first visit, but leave whatever was restored — by the
// browser on a back navigation, or from storage — alone.
if (!input.value) input.value = SAMPLE_TEXT
run()
