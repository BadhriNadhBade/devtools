import { $, $$, live, status, clearStatus } from '../lib/ui.js'
import matchAll from '../lib/regex-match.js'

const patternInput = $('#pattern')
const input = $('#input')
const highlight = $('#highlight')
const matchesOut = $('#matches')
const countOut = $('#count')

const SAMPLE_PATTERN = '(\\w+)@(\\w+\\.\\w+)'
const SAMPLE_TEXT = [
  'Send the invoice to accounts@example.com and cc finance@example.org.',
  'Older addresses like billing@example.net are no longer monitored.',
  'Anything without an at sign — such as example.com — should not match.'
].join('\n')

// A runaway pattern on a long input can produce an unusable number of hits.
const MATCH_LIMIT = 5000

// How long a single pattern gets before we assume it is never coming back.
const TIMEOUT = 2000

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

function ensureWorker() {
  if (worker) return worker

  worker = new Worker('/assets/js/lib/regex-worker.js', { type: 'module' })

  worker.addEventListener('message', ({ data }) => {
    if (data.id !== generation) return
    clearTimeout(deadline)

    if (data.error) showError(data.error)
    else showMatches(data.matches)
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

function showMatches(found) {
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
  countOut.textContent = ''
  status(message, 'err')
}

function run() {
  const pattern = patternInput.value
  const text = input.value

  if (!pattern) {
    highlight.textContent = text
    matchesOut.replaceChildren()
    countOut.textContent = ''
    clearStatus()
    return
  }

  generation++
  requestedText = text

  if (!canUseWorker) {
    try {
      showMatches(matchAll(pattern, flags(), text, MATCH_LIMIT))
    } catch (error) {
      showError(error.message)
    }
    return
  }

  const id = generation
  clearTimeout(deadline)
  deadline = setTimeout(() => {
    // Terminating is the only way to stop runaway backtracking; the next run
    // starts a fresh worker.
    if (worker) worker.terminate()
    worker = null

    if (id !== generation) return
    showError(`That pattern didn't finish in ${TIMEOUT / 1000}s — it is probably backtracking. Try making it less ambiguous.`)
  }, TIMEOUT)

  ensureWorker().postMessage({ id, pattern, flags: flags(), text, limit: MATCH_LIMIT })
}

$('#sample').addEventListener('click', () => {
  patternInput.value = SAMPLE_PATTERN
  input.value = SAMPLE_TEXT
  run()
})

live([patternInput, input, ...$$('.flag')], run)

// Seed the box on a first visit, but leave whatever the browser restored on a
// back navigation alone.
if (!input.value) input.value = SAMPLE_TEXT
run()
