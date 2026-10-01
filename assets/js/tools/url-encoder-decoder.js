import {
  $, live, segment, copyButton, pasteButton, clearButton, clearField, setField,
  status, clearStatus, remember, prefill, sendTo, receive, shortcuts
} from '../lib/ui.js'

const input = $('#input')
const output = $('#output')
const hint = $('#scope-hint')
const inputLabel = $('#input-label')
const outputLabel = $('#output-label')
const scope = $('#scope')
const plus = $('#plus')
const plusField = $('#plus-field')
const again = $('#again')
const inspect = $('#inspect')
const parts = $('#parts')
const params = $('#params')

const SAMPLE = 'https://badhrinadh.com/search?q=hello world&tag=c++ / c#&via=email@example.com'
const SAMPLE_URL = 'https://user@ünïcode.example.com:8443/a%20path/here?q=hello+world&tag=c%2B%2B&tag=rust&empty=#results'

const HINTS = {
  component: 'Escapes everything that is not safe inside a single query value or path segment, including / ? & = # and +.',
  full: 'Leaves the characters that give a URL its structure ( / ? & = # : ) alone, so an entire address stays usable.',
  inspect: 'Reads the address the way a browser would and lets you edit its query. Changes there rewrite the URL on the right.'
}

const readMode = segment('mode', run)
const readScope = segment('scope', run)

const mode = () => readMode()

// ---------------------------------------------------------------------------
// Inspect
// ---------------------------------------------------------------------------

const PART_NAMES = [
  ['protocol', 'Scheme'],
  ['username', 'User'],
  ['password', 'Password'],
  ['hostname', 'Host'],
  ['port', 'Port'],
  ['pathname', 'Path'],
  ['search', 'Query'],
  ['hash', 'Fragment']
]

function partRow(label, value, note) {
  const dt = document.createElement('dt')
  dt.textContent = label

  const dd = document.createElement('dd')
  dd.textContent = value

  if (note) {
    const aside = document.createElement('span')
    aside.className = 'tool-path'
    aside.textContent = ` — ${note}`
    dd.append(aside)
  }

  return [dt, dd]
}

// An internationalised host is stored punycoded, so the parsed hostname and
// the thing that was typed differ. Saying both is the point of a parser.
function hostNote(url, original) {
  if (!url.hostname.startsWith('xn--') && !url.hostname.includes('.xn--')) return ''

  const typed = original.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^:/?#]+)/i)
  return typed && typed[1] !== url.hostname ? `punycode for ${typed[1]}` : 'punycode'
}

function renderParts(url, original) {
  parts.replaceChildren()

  for (const [key, label] of PART_NAMES) {
    const value = url[key]
    if (!value) continue

    let shown = value
    let note = ''

    if (key === 'pathname') {
      const decoded = safeDecode(value)
      if (decoded !== value) note = decoded
    }

    if (key === 'hostname') note = hostNote(url, original)
    if (key === 'protocol') shown = value.replace(/:$/, '')

    parts.append(...partRow(label, shown, note))
  }

  parts.append(...partRow('Origin', url.origin))
}

// Rebuilds the URL from the table and writes it back out. Each row owns its
// own pair of fields, so reordering, renaming and emptying a value all work
// without the table having to be re-rendered as you type.
function rebuild(url, rows) {
  const search = new URLSearchParams()

  for (const { name, value } of rows) {
    if (!name.value) continue
    search.append(name.value, value.value)
  }

  url.search = search.toString()
  output.value = url.href
}

function paramRow(url, rows, name, value) {
  const row = document.createElement('div')
  row.className = 'tool-param'

  const nameField = document.createElement('input')
  nameField.type = 'text'
  nameField.className = 'tool-text tool-text--mono'
  nameField.value = name
  nameField.setAttribute('aria-label', 'Parameter name')

  const valueField = document.createElement('input')
  valueField.type = 'text'
  valueField.className = 'tool-text tool-text--mono'
  valueField.value = value
  valueField.setAttribute('aria-label', `Value of ${name || 'the parameter'}`)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'tool-button--ghost monospace'
  remove.textContent = 'Remove'
  remove.setAttribute('aria-label', `Remove ${name || 'the parameter'}`)

  const entry = { name: nameField, value: valueField }
  rows.push(entry)

  for (const field of [nameField, valueField]) {
    field.addEventListener('input', () => rebuild(url, rows))
  }

  remove.addEventListener('click', () => {
    rows.splice(rows.indexOf(entry), 1)
    row.remove()
    rebuild(url, rows)
  })

  row.append(nameField, valueField, remove)
  return row
}

// Held between runs so "Add parameter" has something to add to.
let current = null

function renderParams(url) {
  const rows = []
  params.replaceChildren()

  // URLSearchParams decodes for us, including `+` as a space, which is what
  // the query string's own encoding says it means.
  for (const [name, value] of url.searchParams) {
    params.append(paramRow(url, rows, name, value))
  }

  if (!rows.length) {
    const empty = document.createElement('p')
    empty.className = 'desc'
    empty.textContent = 'No query parameters.'
    params.append(empty)
  }

  current = { url, rows }
}

function runInspect(text) {
  let url
  try {
    url = new URL(text)
  } catch (err) {
    inspect.hidden = true
    output.value = ''
    status('That is not an absolute URL — it needs a scheme, like https://', 'err')
    return
  }

  inspect.hidden = false
  output.value = url.href
  renderParts(url, text)
  renderParams(url)

  status(`${url.protocol.replace(/:$/, '')} · ${url.hostname}${url.port ? `:${url.port}` : ''} · ${[...url.searchParams].length} parameter${[...url.searchParams].length === 1 ? '' : 's'}`, 'ok')
}

// ---------------------------------------------------------------------------

const safeDecode = text => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function run() {
  const kind = mode()
  const encoding = kind === 'encode'
  const inspecting = kind === 'inspect'

  scope.hidden = inspecting
  plusField.hidden = kind !== 'decode'
  inspect.hidden = !inspecting
  again.hidden = true

  hint.textContent = inspecting ? HINTS.inspect : HINTS[readScope()]
  inputLabel.textContent = inspecting ? 'URL' : encoding ? 'Plain text' : 'Encoded'
  outputLabel.textContent = inspecting ? 'Rebuilt URL' : encoding ? 'Encoded' : 'Plain text'

  const text = input.value
  if (!text.trim()) {
    output.value = ''
    inspect.hidden = true
    clearStatus()
    return
  }

  if (inspecting) {
    runInspect(text.trim())
    return
  }

  try {
    const component = readScope() === 'component'

    if (encoding) {
      output.value = component ? encodeURIComponent(text) : encodeURI(text)
      clearStatus()
      return
    }

    // `+` only means a space in form encoding, so it is opt-in; elsewhere a
    // plus is a plus and rewriting it would corrupt the value.
    const source = plus.checked ? text.replace(/\+/g, ' ') : text
    output.value = component ? decodeURIComponent(source) : decodeURI(source)

    // Something encoded twice decodes to text that still has escapes in it —
    // a common enough state for a URL that has been through a redirector.
    if (/%[0-9a-f]{2}/i.test(output.value)) {
      again.hidden = false
      status('That still contains escapes — it looks like it was encoded more than once', 'info')
    } else {
      clearStatus()
    }
  } catch (err) {
    // decodeURIComponent throws URIError on a stray % or a truncated sequence.
    output.value = ''
    status('Malformed escape sequence — check for a lone % or an incomplete %XX', 'err')
  }
}

$('#sample').addEventListener('click', () => {
  if (mode() === 'inspect') {
    setField(input, SAMPLE_URL)
  } else if (mode() === 'encode') {
    setField(input, SAMPLE)
  } else {
    setField(input, readScope() === 'component' ? encodeURIComponent(SAMPLE) : encodeURI(SAMPLE))
  }
  run()
})

// Feeds the result back through, for the layers a redirector or a logger added.
$('#again').addEventListener('click', () => {
  setField(input, output.value)
  run()
})

$('#add').addEventListener('click', () => {
  if (!current) return

  const empty = params.querySelector('.desc')
  if (empty) empty.remove()

  const row = paramRow(current.url, current.rows, '', '')
  params.append(row)
  row.querySelector('input').focus()
})

live([input, plus], run)
copyButton($('#copy'), () => output.value)
pasteButton($('#paste'), input, run)
clearButton($('#clear'), input, run)
shortcuts({ run, clear: () => { clearField(input); run() } })

// A decoded parameter is very often one of these three wearing a percent
// encoding: a JSON blob, a Base64 payload, or a token.
sendTo($('#send'), [
  'json-yaml-formatter',
  'base64-encoder-decoder',
  'hash-generator'
], () => output.value, 'URL tools')

remember('devtools.url', [plus, $('#mode-encode'), $('#mode-decode'), $('#mode-inspect'), $('#scope-component'), $('#scope-full')])

// After `remember`, so a link naming a mode beats the one left selected last
// time. Note that the address being inspected is itself a query parameter here,
// so it arrives percent-encoded and `URLSearchParams` hands it back decoded —
// which is exactly the round trip this page is about.
prefill([input, plus, $('#mode-encode'), $('#mode-decode'), $('#mode-inspect'), $('#scope-component'), $('#scope-full')])

run()

receive(input, run)
