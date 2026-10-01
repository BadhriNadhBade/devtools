import {
  $, $$, live, segment, copyButton, pasteButton, clearButton, clearField, setField,
  download, status, clearStatus, bytes, encoder, dropZone, filePicker, readFileText,
  remember, prefill, sendTo, receive, shortcuts
} from '../lib/ui.js'
import { format as formatJson } from '../lib/json.js'
import { parse as parseYaml, stringify as stringifyYaml, hasComments } from '../lib/yaml.js'
import query from '../lib/jsonpath.js'

const input = $('#input')
const output = $('#output')
const indent = $('#indent')
const indentField = $('#indent-field')
const indentTab = $('#indent-tab')
const style = $('#style')
const sort = $('#sort')
const queryInput = $('#query')
const inputLabel = $('#input-label')
const inputSize = $('#input-size')
const outputSize = $('#output-size')
const outputLabel = $('#output-label')
const findings = $('#findings')
const findingsList = $('#findings-list')
const treePane = $('#tree-pane')
const tree = $('#tree')
const shape = $('#shape')
const goTo = $('#goto')

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

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

const typeOf = value => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

// What a collapsed container says about itself, so a closed row still tells
// you whether it is worth opening.
function summarize(value) {
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`
  const keys = Object.keys(value)
  return `{${keys.length} key${keys.length === 1 ? '' : 's'}}`
}

function leafText(value) {
  const type = typeOf(value)
  if (type === 'string') return JSON.stringify(value)
  return String(value)
}

function label(key, path) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'tool-tree-key'
  element.textContent = key
  element.title = path

  // The path is the thing worth taking away from a tree, and retyping it out
  // of a deep document is exactly the work this pane exists to save.
  element.addEventListener('click', event => {
    event.preventDefault()
    setField(queryInput, path)
    run()
  })

  return element
}

function node(key, value, path, depth) {
  const type = typeOf(value)

  if (type !== 'object' && type !== 'array') {
    const row = document.createElement('div')
    row.className = 'tool-tree-leaf'
    row.append(label(key, path))

    const colon = document.createElement('span')
    colon.className = 'tool-tree-meta'
    colon.textContent = ': '

    const shownValue = document.createElement('span')
    shownValue.className = `tool-tree-${type}`
    shownValue.textContent = leafText(value)

    row.append(colon, shownValue)
    return row
  }

  const details = document.createElement('details')
  // Two levels open is enough to see the shape of most documents without
  // drowning a large one in rows.
  details.open = depth < 2

  const summary = document.createElement('summary')
  summary.append(label(key, path))

  const count = document.createElement('span')
  count.className = 'tool-tree-meta'
  count.textContent = ` ${summarize(value)}`
  summary.append(count)

  const children = document.createElement('div')
  children.className = 'tool-tree-children'

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item, `${path}[${index}]`])
    : Object.entries(value).map(([name, item]) => [
      name,
      item,
      /^[\w$]+$/.test(name) ? `${path}.${name}` : `${path}[${JSON.stringify(name)}]`
    ])

  for (const [name, item, childPath] of entries) {
    children.append(node(name, item, childPath, depth + 1))
  }

  details.append(summary, children)
  return details
}

// Depth and node count, which is the pair that says whether a document is
// large or merely long.
function measure(value) {
  let nodes = 0
  let depth = 0

  const walk = (current, level) => {
    nodes++
    depth = Math.max(depth, level)
    if (current === null || typeof current !== 'object') return
    for (const child of Object.values(current)) walk(child, level + 1)
  }

  walk(value, 0)
  return { nodes, depth }
}

function renderTree(value) {
  if (value === undefined) {
    treePane.hidden = true
    return
  }

  treePane.hidden = false
  tree.replaceChildren(node('$', value, '$', 0))

  const { nodes, depth } = measure(value)
  shape.textContent = `${nodes.toLocaleString()} nodes · ${depth} deep`
}

// ---------------------------------------------------------------------------

function runQuery(value) {
  const expression = queryInput.value.trim()
  if (!expression) return null

  const found = query(value, expression)

  outputLabel.textContent = `Matched ${found.length}`

  if (!found.length) {
    output.value = ''
    status(`Nothing at ${expression}`, 'info')
    return { empty: true }
  }

  // One hit is the value itself; several are a list, because a caller asking
  // for `$..name` wants all of them and an arbitrary first one would be wrong.
  const result = found.length === 1 ? found[0].value : found.map(hit => hit.value)
  const spaces = indent.value === 'tab' ? '\t' : Number(indent.value)

  output.value = `${JSON.stringify(result, null, isPretty() ? spaces : 0)}\n`
  status(`${found.length} match${found.length === 1 ? '' : 'es'} — ${found.slice(0, 3).map(hit => hit.path).join(', ')}${found.length > 3 ? ' …' : ''}`, 'ok')

  return { found }
}

// The parsed document, kept so the tree and the path box do not each have to
// parse it again.
let parsed

function run() {
  const json = isJson()

  // Minified YAML is not a thing, and tabs cannot indent it at all.
  style.hidden = !json
  indentTab.disabled = !json
  if (!json && indent.value === 'tab') indent.value = '2'
  indentField.hidden = json && !isPretty() && !queryInput.value.trim()

  inputLabel.textContent = json ? 'JSON' : 'YAML'
  outputLabel.textContent = 'Formatted'
  goTo.hidden = true

  const text = input.value
  size(inputSize, text)

  if (!text.trim()) {
    output.value = ''
    size(outputSize, '')
    show([])
    renderTree(undefined)
    parsed = undefined
    clearStatus()
    return
  }

  try {
    const problems = json ? runJson(text) : runYaml(text)

    renderTree(parsed)

    // A path replaces the formatted output rather than sitting beside it: the
    // question being asked is about the value, not the document.
    const queried = queryInput.value.trim() ? runQuery(parsed) : null

    size(outputSize, output.value)
    show(problems)

    if (queried) return

    if (problems.length) {
      status(`Valid ${json ? 'JSON' : 'YAML'}, with ${problems.length} thing${problems.length === 1 ? '' : 's'} worth a look`, 'info')
    } else {
      status(`Valid ${json ? 'JSON' : 'YAML'}`, 'ok')
    }
  } catch (err) {
    output.value = ''
    size(outputSize, '')
    show([])

    // A path that does not parse is the path's fault, not the document's, and
    // the document is still worth showing as a tree.
    if (!parsed || !queryInput.value.trim()) {
      renderTree(undefined)
      parsed = undefined
    }

    goTo.hidden = !errorPosition(err.message)
    status(err.message, 'err')
  }
}

function runJson(text) {
  const result = formatJson(text, {
    indent: isPretty() ? step() : '',
    sort: sort.checked
  })

  output.value = `${result.text}\n`

  // Parsed separately for the tree and the path box. The formatter works on
  // the text so it can keep a number the parser would round; those two need a
  // value, and accept the rounding — which the note on the page says out loud.
  parsed = JSON.parse(text)

  return result.problems
}

function runYaml(text) {
  const value = parseYaml(text)
  parsed = value
  output.value = stringifyYaml(sort.checked ? sortValue(value) : value, { indent: step().length })

  // Said once, up front, rather than left for someone to notice afterwards.
  return hasComments(text)
    ? [{ line: 1, message: 'Comments are dropped — a YAML document has to be rebuilt from its structure, and comments are not part of it.' }]
    : []
}

// Both parsers report "Line N" or "Line N, column M", so the message itself is
// enough to put the cursor where the problem is.
function errorPosition(message) {
  const found = message.match(/^Line (\d+)(?:, column (\d+))?/)
  return found ? { line: Number(found[1]), column: Number(found[2] || 1) } : null
}

goTo.addEventListener('click', () => {
  const where = errorPosition($('#status').textContent)
  if (!where) return

  const lines = input.value.split('\n')
  const offset = lines.slice(0, where.line - 1).reduce((sum, line) => sum + line.length + 1, 0)
  const start = offset + where.column - 1

  input.focus()
  // Selecting to the end of the line rather than placing a bare caret: a
  // highlighted run is visible after the scroll, a caret often is not.
  input.setSelectionRange(start, offset + (lines[where.line - 1]?.length ?? 0))
})

$('#sample').addEventListener('click', () => {
  setField(input, isJson() ? JSON_SAMPLE : YAML_SAMPLE)
  run()
})

$('#download').addEventListener('click', () => {
  if (!output.value) return

  if (queryInput.value.trim()) download('result.json', output.value, 'application/json')
  else if (isJson()) download('formatted.json', output.value, 'application/json')
  else download('formatted.yaml', output.value, 'application/yaml')
})

$('#expand-all').addEventListener('click', () => {
  for (const details of $$('details', tree)) details.open = true
})

$('#collapse-all').addEventListener('click', () => {
  for (const details of $$('details', tree)) details.open = false
})

async function load(file) {
  setField(input, await readFileText(file))
  // The extension is a better guess at the format than whatever was last
  // selected, and getting it wrong here means an error message about the
  // wrong language.
  if (/\.ya?ml$/i.test(file.name)) $('#format-yaml').checked = true
  if (/\.json$/i.test(file.name)) $('#format-json').checked = true
  run()
}

dropZone($('#input-pane'), load)
filePicker($('#open'), load, '.json,.yaml,.yml,.txt,application/json')

live([input, indent, sort, queryInput], run)
copyButton($('#copy'), () => output.value)
pasteButton($('#paste'), input, run)
clearButton($('#clear'), input, run)
shortcuts({ run, clear: () => { clearField(input); clearField(queryInput); run() } })

// A formatted document is most often on its way to another format, to a
// comparison, or — once a path has pulled one value out of it — to whatever
// reads that value next.
sendTo($('#send'), [
  'json-yaml-converter',
  'text-diff-checker',
  'base64-encoder-decoder',
  'hash-generator'
], () => output.value, 'formatter')

remember('devtools.formatter', [
  indent, sort, $('#format-json'), $('#format-yaml'), $('#style-pretty'), $('#style-minify')
])

// After `remember`, so a link that names a format beats the one left selected
// last time. The path travels too: linking someone straight to the value you
// are talking about is most of the point of having a path box.
prefill([
  input, queryInput, indent, sort,
  $('#format-json'), $('#format-yaml'), $('#style-pretty'), $('#style-minify')
])

run()

receive(input, run)
