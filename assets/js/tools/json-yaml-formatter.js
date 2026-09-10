import { $, live, segment, copyButton, download, status, clearStatus, bytes, encoder } from '../lib/ui.js'
import { format as formatJson } from '../lib/json.js'
import { parse as parseYaml, stringify as stringifyYaml, hasComments } from '../lib/yaml.js'

const input = $('#input')
const output = $('#output')
const indent = $('#indent')
const indentField = $('#indent-field')
const indentTab = $('#indent-tab')
const style = $('#style')
const sort = $('#sort')
const inputLabel = $('#input-label')
const inputSize = $('#input-size')
const outputSize = $('#output-size')
const findings = $('#findings')
const findingsList = $('#findings-list')

// Deliberately messy, and carrying one of everything the findings list exists
// to report: a duplicate key, an integer past 2^53, and keys out of order.
const JSON_SAMPLE = '{"name":"devtools", "tags":["json","yaml"],\n  "id": 12345678901234567890,\n "active":true, "meta":{"stars":3,"fork":false}, "name":"devtools.badhrinadh.com"}'

const YAML_SAMPLE = [
  '# a service, written the way people write them',
  'name:    devtools',
  'tags: [json, yaml]',
  'active: true',
  'meta:',
  '     stars: 3',
  '     fork: false',
  ''
].join('\n')

const readFormat = segment('format', run)
const readStyle = segment('style', run)
const isJson = () => readFormat() === 'json'
const isPretty = () => readStyle() === 'pretty'

// YAML keeps its keys in whatever order the parsed object holds them, so
// sorting has to happen to the document rather than on the way out.
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== 'object') return value

  const sorted = {}
  for (const key of Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    sorted[key] = sortValue(value[key])
  }
  return sorted
}

function step() {
  if (indent.value === 'tab') return '\t'
  return ' '.repeat(Number(indent.value))
}

function show(problems) {
  findings.hidden = problems.length === 0
  findingsList.replaceChildren()

  for (const problem of problems) {
    const where = document.createElement('dt')
    where.textContent = problem.column ? `Line ${problem.line}:${problem.column}` : `Line ${problem.line}`

    const what = document.createElement('dd')
    what.textContent = problem.message

    findingsList.append(where, what)
  }
}

function size(el, text) {
  el.textContent = text ? bytes(encoder.encode(text).length) : ''
}

function run() {
  const json = isJson()

  // Minified YAML is not a thing, and tabs cannot indent it at all.
  style.hidden = !json
  indentTab.disabled = !json
  if (!json && indent.value === 'tab') indent.value = '2'
  indentField.hidden = json && !isPretty()

  inputLabel.textContent = json ? 'JSON' : 'YAML'

  const text = input.value
  size(inputSize, text)

  if (!text.trim()) {
    output.value = ''
    size(outputSize, '')
    show([])
    clearStatus()
    return
  }

  try {
    const problems = json ? runJson(text) : runYaml(text)

    size(outputSize, output.value)
    show(problems)

    if (problems.length) {
      status(`Valid ${json ? 'JSON' : 'YAML'}, with ${problems.length} thing${problems.length === 1 ? '' : 's'} worth a look`, 'info')
    } else {
      status(`Valid ${json ? 'JSON' : 'YAML'}`, 'ok')
    }
  } catch (err) {
    output.value = ''
    size(outputSize, '')
    show([])
    status(err.message, 'err')
  }
}

function runJson(text) {
  const result = formatJson(text, {
    indent: isPretty() ? step() : '',
    sort: sort.checked
  })

  output.value = `${result.text}\n`
  return result.problems
}

function runYaml(text) {
  const value = parseYaml(text)
  output.value = stringifyYaml(sort.checked ? sortValue(value) : value, { indent: step().length })

  // Said once, up front, rather than left for someone to notice afterwards.
  return hasComments(text)
    ? [{ line: 1, message: 'Comments are dropped — a YAML document has to be rebuilt from its structure, and comments are not part of it.' }]
    : []
}

$('#sample').addEventListener('click', () => {
  input.value = isJson() ? JSON_SAMPLE : YAML_SAMPLE
  run()
})

$('#download').addEventListener('click', () => {
  if (!output.value) return

  if (isJson()) download('formatted.json', output.value, 'application/json')
  else download('formatted.yaml', output.value, 'application/yaml')
})

live([input, indent, sort], run)
copyButton($('#copy'), () => output.value)

run()
