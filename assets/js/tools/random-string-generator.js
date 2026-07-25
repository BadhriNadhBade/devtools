import { $, $$, live, copyButton, status } from '../lib/ui.js'

const output = $('#output')
const lengthInput = $('#length')
const quantityInput = $('#quantity')
const unambiguous = $('#unambiguous')
const entropyOut = $('#entropy')

const SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!#$%&()*+,-.:;<=>?@[]^_{|}~'
}

// Characters that are easy to confuse when a secret is read aloud or copied
// off a screen.
const LOOKALIKES = new Set('O0oIl1|`\'"'.split(''))

function alphabet() {
  let characters = $$('.charset')
    .filter(box => box.checked)
    .map(box => SETS[box.value])
    .join('')

  if (unambiguous.checked) {
    characters = [...characters].filter(character => !LOOKALIKES.has(character)).join('')
  }

  return characters
}

// Rejection sampling. Bytes at or above the largest exact multiple of the
// alphabet size are thrown away, so no character is more likely than another.
function randomString(characters, length) {
  const size = characters.length
  const ceiling = Math.floor(256 / size) * size

  const out = []
  const buffer = new Uint8Array(Math.max(64, length * 2))

  while (out.length < length) {
    crypto.getRandomValues(buffer)
    for (const byte of buffer) {
      if (byte < ceiling) {
        out.push(characters[byte % size])
        if (out.length === length) break
      }
    }
  }

  return out.join('')
}

function generate() {
  const characters = alphabet()

  if (!characters) {
    output.value = ''
    entropyOut.textContent = ''
    status('Pick at least one character set', 'err')
    return
  }

  const length = Math.min(4096, Math.max(1, parseInt(lengthInput.value, 10) || 1))
  const quantity = Math.min(500, Math.max(1, parseInt(quantityInput.value, 10) || 1))

  output.value = Array.from({ length: quantity }, () => randomString(characters, length)).join('\n')

  const bits = Math.floor(length * Math.log2(characters.length))
  entropyOut.textContent = `${characters.length} chars · ~${bits} bits`
  status(`Generated ${quantity} string${quantity === 1 ? '' : 's'}`, 'ok')
}

$('#generate').addEventListener('click', generate)
live([lengthInput, quantityInput, unambiguous, ...$$('.charset')], generate)
copyButton($('#copy'), () => output.value)

generate()
