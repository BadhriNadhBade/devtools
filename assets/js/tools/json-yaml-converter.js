import { $, live, segment, copyButton, download, status, clearStatus } from '../lib/ui.js'
import { parse as parseYaml, stringify as stringifyYaml } from '../lib/yaml.js'

const input = $('#input')
const output = $('#output')
const indent = $('#indent')
const inputLabel = $('#input-label')
const outputLabel = $('#output-label')

// The same pair the Backstage toolbox uses for its own converters, so anyone
// arriving from there recognises what they are looking at.
const JSON_SAMPLE = JSON.stringify([
  { type: 'car', name: 'pedro', stars: 3 },
  { type: 'plant', name: 'samuel', stars: 2 }
], null, 2)

const YAML_SAMPLE = [
  '- type: car',
  '  name: pedro',
  '  stars: 3',
  '- type: plant',
  '  name: samuel',
  '  stars: 2',
  ''
].join('\n')

const readDirection = segment('direction', run)
const toYaml = () => readDirection() === 'to-yaml'

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

function run() {
  const yaml = toYaml()

  inputLabel.textContent = yaml ? 'JSON' : 'YAML'
  outputLabel.textContent = yaml ? 'YAML' : 'JSON'

  const text = input.value
  if (!text.trim()) {
    output.value = ''
    clearStatus()
    return
  }

  const spaces = Number(indent.value)

  try {
    if (yaml) {
      const { value, strict } = readJson(text)
      output.value = stringifyYaml(value, { indent: spaces })
      if (strict) clearStatus()
      else status('That is not strictly valid JSON — read as YAML instead', 'info')
    } else {
      output.value = `${JSON.stringify(parseYaml(text), null, spaces)}\n`
      clearStatus()
    }
  } catch (err) {
    output.value = ''
    status(err.message, 'err')
  }
}

$('#sample').addEventListener('click', () => {
  input.value = toYaml() ? JSON_SAMPLE : YAML_SAMPLE
  run()
})

// Reading the result back the other way is the usual next step, so the swap
// carries the output across rather than making you copy it by hand.
$('#swap').addEventListener('click', () => {
  const converted = output.value
  $(toYaml() ? '#direction-to-json' : '#direction-to-yaml').checked = true
  if (converted) input.value = converted
  run()
})

$('#download').addEventListener('click', () => {
  if (!output.value) return

  if (toYaml()) download('converted.yaml', output.value, 'application/yaml')
  else download('converted.json', output.value, 'application/json')
})

live([input, indent], run)
copyButton($('#copy'), () => output.value)

run()
