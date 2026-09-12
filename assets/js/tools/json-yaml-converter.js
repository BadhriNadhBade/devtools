import {
  $, live, copyButton, pasteButton, clearButton, clearField, download, status, clearStatus,
  dropZone, filePicker, readFileText, remember, shortcuts
} from '../lib/ui.js'
import { parse as parseYaml, stringify as stringifyYaml } from '../lib/yaml.js'
import {
  toCsv, fromCsv, toEnv, fromEnv, toQueryString, fromQueryString, toXml, toToml
} from '../lib/formats.js'

const input = $('#input')
const output = $('#output')
const indent = $('#indent')
const indentField = $('#indent-field')
const from = $('#from')
const to = $('#to')
const inputLabel = $('#input-label')
const outputLabel = $('#output-label')

// The same pair the Backstage toolbox uses for its own converters, so anyone
// arriving from there recognises what they are looking at.
const SAMPLES = {
  json: JSON.stringify([
    { type: 'car', name: 'pedro', stars: 3 },
    { type: 'plant', name: 'samuel', stars: 2 }
  ], null, 2),

  yaml: [
    '- type: car',
    '  name: pedro',
    '  stars: 3',
    '- type: plant',
    '  name: samuel',
    '  stars: 2',
    ''
  ].join('\n'),

  csv: ['type,name,stars', 'car,pedro,3', 'plant,samuel,2', ''].join('\n'),

  env: ['# a service', 'NAME=devtools', 'PORT=8080', 'DEBUG=false', 'GREETING="hello world"', ''].join('\n'),

  query: 'type=car&name=pedro&stars=3&tag=fast&tag=red'
}

const NAMES = {
  json: 'JSON', yaml: 'YAML', toml: 'TOML', xml: 'XML',
  csv: 'CSV', env: '.env', query: 'Query string'
}

const EXTENSIONS = {
  json: ['json', 'application/json'],
  yaml: ['yaml', 'application/yaml'],
  toml: ['toml', 'text/plain'],
  xml: ['xml', 'application/xml'],
  csv: ['csv', 'text/csv'],
  env: ['env', 'text/plain'],
  query: ['txt', 'text/plain']
}

// Only the nested formats are laid out, so the indent control is only offered
// when it would change anything.
const INDENTED = ['json', 'yaml']

// JSON is a subset of YAML, so the YAML reader doubles as the tolerant parser
// the Backstage toolbox reaches for JSON5 to get: comments, single quotes and
// trailing commas all still come through. It is only ever the fallback, since
// JSON.parse is both stricter about what it accepts and clearer about why.
//
// Falling back is worth saying out loud, though. YAML will happily find a
// meaning in text that is not valid JSON — `{"a": }` is a mapping with a null
// value — and quietly converting it would hide a typo rather than report it.
function readJson(text) {
  try {
    return { value: JSON.parse(text), strict: true }
  } catch (jsonError) {
    try {
      return { value: parseYaml(text), strict: false }
    } catch (ignored) {
      // The box was meant to hold JSON, so it is JSON's complaint that helps.
      throw jsonError
    }
  }
}

function read(text, format) {
  if (format === 'json') return readJson(text)
  if (format === 'yaml') return { value: parseYaml(text), strict: true }
  if (format === 'csv') return { value: fromCsv(text), strict: true }
  if (format === 'env') return { value: fromEnv(text), strict: true }
  return { value: fromQueryString(text), strict: true }
}

function write(value, format) {
  const spaces = Number(indent.value)

  switch (format) {
    case 'json': return `${JSON.stringify(value, null, spaces)}\n`
    case 'yaml': return stringifyYaml(value, { indent: spaces })
    case 'toml': return toToml(value)
    case 'xml': return toXml(value)
    case 'csv': return toCsv(value)
    case 'env': return toEnv(value)
    default: return toQueryString(value)
  }
}

function run() {
  inputLabel.textContent = NAMES[from.value]
  outputLabel.textContent = NAMES[to.value]
  indentField.hidden = !INDENTED.includes(to.value)

  const text = input.value
  if (!text.trim()) {
    output.value = ''
    clearStatus()
    return
  }

  try {
    const { value, strict } = read(text, from.value)
    output.value = write(value, to.value)

    if (from.value === to.value) status('Both sides are the same format — this is a reformat, not a conversion', 'info')
    else if (!strict) status('That is not strictly valid JSON — read as YAML instead', 'info')
    else clearStatus()
  } catch (err) {
    output.value = ''
    status(err.message, 'err')
  }
}

$('#sample').addEventListener('click', () => {
  // Every source format has a sample; the ones that are output-only fall back
  // to JSON, which converts to all of them.
  input.value = SAMPLES[from.value] || SAMPLES.json
  run()
})

// Reading the result back the other way is the usual next step, so the swap
// carries the output across rather than making you copy it by hand. Formats
// this tool cannot read stay where they are.
$('#swap').addEventListener('click', () => {
  const readable = [...from.options].map(option => option.value)

  if (!readable.includes(to.value)) {
    status(`${NAMES[to.value]} is something this page writes but does not read, so there is nothing to swap to`, 'info')
    return
  }

  const converted = output.value
  const held = from.value

  from.value = to.value
  to.value = held
  if (converted) input.value = converted

  run()
})

$('#download').addEventListener('click', () => {
  if (!output.value) return
  const [extension, type] = EXTENSIONS[to.value]
  download(`converted.${extension}`, output.value, type)
})

// The name is a better guess at the format than whatever was last selected.
const BY_EXTENSION = {
  json: 'json', yaml: 'yaml', yml: 'yaml', csv: 'csv', env: 'env'
}

async function load(file) {
  input.value = await readFileText(file)

  const extension = file.name.split('.').pop().toLowerCase()
  const guessed = file.name.startsWith('.env') ? 'env' : BY_EXTENSION[extension]
  if (guessed) from.value = guessed

  run()
}

dropZone($('#input-pane'), load)
filePicker($('#open'), load, '.json,.yaml,.yml,.csv,.env,.txt')

live([input, indent, from, to], run)
copyButton($('#copy'), () => output.value)
pasteButton($('#paste'), input, run)
clearButton($('#clear'), input, run)
shortcuts({ run, clear: () => { clearField(input); run() } })

remember('devtools.converter', [from, to, indent])

run()
