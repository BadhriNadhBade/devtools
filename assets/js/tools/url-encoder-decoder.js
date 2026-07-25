import { $, live, segment, copyButton, status, clearStatus } from '../lib/ui.js'

const input = $('#input')
const output = $('#output')
const hint = $('#scope-hint')
const inputLabel = $('#input-label')
const outputLabel = $('#output-label')

const SAMPLE = 'https://badhrinadh.com/search?q=hello world&tag=c++ / c#&via=email@example.com'

const HINTS = {
  component: 'Escapes everything that is not safe inside a single query value or path segment, including / ? & = # and +.',
  full: 'Leaves the characters that give a URL its structure ( / ? & = # : ) alone, so an entire address stays usable.'
}

const readMode = segment('mode', run)
const readScope = segment('scope', run)

function run() {
  const encoding = readMode() === 'encode'
  const scope = readScope()

  hint.textContent = HINTS[scope]
  inputLabel.textContent = encoding ? 'Plain text' : 'Encoded'
  outputLabel.textContent = encoding ? 'Encoded' : 'Plain text'

  const text = input.value
  if (!text) {
    output.value = ''
    clearStatus()
    return
  }

  try {
    if (encoding) {
      output.value = scope === 'component' ? encodeURIComponent(text) : encodeURI(text)
    } else {
      output.value = scope === 'component' ? decodeURIComponent(text) : decodeURI(text)
    }
    clearStatus()
  } catch (err) {
    // decodeURIComponent throws URIError on a stray % or a truncated sequence.
    output.value = ''
    status('Malformed escape sequence — check for a lone % or an incomplete %XX', 'err')
  }
}

$('#sample').addEventListener('click', () => {
  input.value = readMode() === 'encode'
    ? SAMPLE
    : (readScope() === 'component' ? encodeURIComponent(SAMPLE) : encodeURI(SAMPLE))
  run()
})

live([input], run)
copyButton($('#copy'), () => output.value)

run()
