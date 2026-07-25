import { $, live, segment, copyButton, status, clearStatus, encoder, decoder } from '../lib/ui.js'

const input = $('#input')
const output = $('#output')
const urlSafe = $('#urlsafe')
const inputLabel = $('#input-label')
const outputLabel = $('#output-label')

const SAMPLE = 'The quick brown fox jumps over the lazy dog — 0123456789 — ünïcode ✓'

// btoa only speaks latin-1, so text goes through TextEncoder first and the
// bytes are handed over one chunk at a time (spreading a whole large array
// into fromCharCode blows the argument limit).
function encode(text, safe) {
  const bytes = encoder.encode(text)

  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }

  const encoded = btoa(binary)
  return safe
    ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : encoded
}

// Accepts either alphabet, with or without padding, and ignores whitespace —
// Base64 copied out of a terminal is usually wrapped.
function decode(text) {
  let normalized = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')

  // A remainder of one is impossible: no whole number of bytes encodes to it.
  if (normalized.length % 4 === 1) throw new Error('truncated')
  while (normalized.length % 4) normalized += '='

  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return decoder.decode(bytes)
}

const readMode = segment('mode', run)

function run() {
  const encoding = readMode() === 'encode'

  inputLabel.textContent = encoding ? 'Plain text' : 'Base64'
  outputLabel.textContent = encoding ? 'Base64' : 'Plain text'

  // Only a genuinely empty box clears the output. Whitespace is real input —
  // a run of spaces has a perfectly good Base64 encoding, and trimming here
  // would refuse to produce it.
  const text = input.value
  if (!text) {
    output.value = ''
    clearStatus()
    return
  }

  try {
    output.value = encoding ? encode(text, urlSafe.checked) : decode(text)

    // U+FFFD means the bytes decoded fine but aren't UTF-8 text — most often
    // someone has pasted an encoded image or archive.
    if (!encoding && output.value.includes('�')) {
      status('Decoded, but those bytes are not UTF-8 text', 'info')
    } else {
      clearStatus()
    }
  } catch (err) {
    output.value = ''
    status(encoding ? 'Could not encode that input' : 'That is not valid Base64', 'err')
  }
}

$('#sample').addEventListener('click', () => {
  input.value = readMode() === 'encode' ? SAMPLE : encode(SAMPLE, urlSafe.checked)
  run()
})

live([input, urlSafe], run)
copyButton($('#copy'), () => output.value)

run()
