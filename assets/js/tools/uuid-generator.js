import { $, live, segment, copyButton, download, status } from '../lib/ui.js'

const output = $('#output')
const quantity = $('#quantity')
const uppercase = $('#uppercase')
const noHyphens = $('#no-hyphens')
const braces = $('#braces')
const hint = $('#version-hint')

const NIL = '00000000-0000-0000-0000-000000000000'

const HINTS = {
  4: 'Version 4 is 122 random bits. Use it when you just need something unique and unguessable.',
  7: 'Version 7 puts a millisecond timestamp in the leading bits, so UUIDs sort in the order they were created — kinder to database indexes than v4.',
  nil: 'The nil UUID is all zeroes. It stands in for “no value” where a UUID is required.'
}

const HYPHENS = [4, 6, 8, 10]

function format(bytes) {
  let out = ''
  for (let i = 0; i < 16; i++) {
    if (HYPHENS.includes(i)) out += '-'
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

// The version nibble goes in the high half of byte 6; the variant bits are
// the top two of byte 8. Everything else stays as it was generated.
function stamp(bytes, version) {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4)
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytes
}

const v4 = () => format(stamp(crypto.getRandomValues(new Uint8Array(16)), 4))

function v7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const milliseconds = Date.now()

  // 48-bit big-endian timestamp across the first six bytes.
  for (let i = 0; i < 6; i++) {
    bytes[i] = Math.floor(milliseconds / 2 ** (8 * (5 - i))) & 0xff
  }

  return format(stamp(bytes, 7))
}

const readVersion = segment('version', () => {
  hint.textContent = HINTS[readVersion()]
  generate()
})

function generate() {
  const version = readVersion()
  const count = Math.min(500, Math.max(1, parseInt(quantity.value, 10) || 1))

  let values
  if (version === 'nil') {
    values = Array.from({ length: count }, () => NIL)
  } else {
    const make = version === '7' ? v7 : v4
    values = Array.from({ length: count }, make)
  }

  if (noHyphens.checked) values = values.map(value => value.replace(/-/g, ''))
  if (uppercase.checked) values = values.map(value => value.toUpperCase())
  if (braces.checked) values = values.map(value => `{${value}}`)

  output.value = values.join('\n')
  status(`Generated ${count} UUID${count === 1 ? '' : 's'}`, 'ok')
}

$('#generate').addEventListener('click', generate)
$('#download').addEventListener('click', () => {
  if (!output.value) return
  download('uuids.txt', output.value)
})

live([quantity, noHyphens, uppercase, braces], generate)
copyButton($('#copy'), () => output.value)

hint.textContent = HINTS[readVersion()]
generate()
