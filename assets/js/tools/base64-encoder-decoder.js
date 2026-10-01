import {
  $, live, segment, copyButton, pasteButton, clearButton, clearField, setField,
  status, clearStatus, dropZone, filePicker, readFileBytes, download, bytes,
  remember, prefill, sendTo, receive, shortcuts, encoder, decoder
} from '../lib/ui.js'

const input = $('#input')
const output = $('#output')
const urlSafe = $('#urlsafe')
const wrap = $('#wrap')
const dataUri = $('#datauri')
const inputLabel = $('#input-label')
const outputLabel = $('#output-label')
const outputSize = $('#output-size')
const source = $('#source')
const sourceName = $('#source-name')
const dropHint = $('#drop-hint')
const detect = $('#detect')
const detectText = $('#detect-text')
const preview = $('#preview')
const previewImage = $('#preview-image')
const previewCaption = $('#preview-caption')
const save = $('#save')

const SAMPLE = 'The quick brown fox jumps over the lazy dog — 0123456789 — ünïcode ✓'

// MIME's line length. Base64 copied out of a certificate, a mail header or an
// SSH key is wrapped at 76 characters, and some readers insist on it.
const WRAP_AT = 76

// Enough of a file's leading bytes to name it. Only the types worth previewing
// or worth suggesting an extension for — anything else is saved as .bin, which
// is honest about not knowing.
const SIGNATURES = [
  { type: 'image/png', extension: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', extension: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', extension: 'gif', magic: [0x47, 0x49, 0x46, 0x38] },
  { type: 'application/pdf', extension: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { type: 'application/zip', extension: 'zip', magic: [0x50, 0x4b, 0x03, 0x04] },
  { type: 'application/gzip', extension: 'gz', magic: [0x1f, 0x8b] },
  { type: 'image/x-icon', extension: 'ico', magic: [0x00, 0x00, 0x01, 0x00] }
]

function sniff(data) {
  for (const signature of SIGNATURES) {
    if (signature.magic.every((byte, index) => data[index] === byte)) return signature
  }

  // RIFF....WEBP — the four bytes that say which kind of RIFF it is sit after
  // the length, so this one cannot be a plain prefix match.
  const riff = [0x52, 0x49, 0x46, 0x46]
  if (riff.every((byte, index) => data[index] === byte) &&
      [0x57, 0x45, 0x42, 0x50].every((byte, index) => data[index + 8] === byte)) {
    return { type: 'image/webp', extension: 'webp' }
  }

  return null
}

// btoa only speaks latin-1, so bytes are handed over one chunk at a time —
// spreading a whole large array into fromCharCode blows the argument limit.
function toBase64(data, safe) {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < data.length; i += CHUNK) {
    binary += String.fromCharCode(...data.subarray(i, i + CHUNK))
  }

  const encoded = btoa(binary)
  return safe
    ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : encoded
}

// Accepts either alphabet, with or without padding, and ignores whitespace —
// Base64 copied out of a terminal is usually wrapped. A data URI is unwrapped
// first, and its media type handed back so the result can be named and shown.
function fromBase64(text) {
  let body = text.trim()
  let type = ''

  const uri = body.match(/^data:([^;,]*)(;[^,]*)?,/i)
  if (uri) {
    if (!/;base64/i.test(uri[2] || '')) throw new Error('not base64')
    type = uri[1]
    body = body.slice(uri[0].length)
  }

  let normalized = body.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')

  // A remainder of one is impossible: no whole number of bytes encodes to it.
  if (normalized.length % 4 === 1) throw new Error('truncated')
  while (normalized.length % 4) normalized += '='

  const binary = atob(normalized)
  return { data: Uint8Array.from(binary, character => character.charCodeAt(0)), type }
}

const wrapped = text =>
  wrap.checked ? (text.match(new RegExp(`.{1,${WRAP_AT}}`, 'g')) || []).join('\n') : text

// What the tool is currently holding. `file` is set only while a real file is
// loaded; everything else works off the textarea. `decoded` is whatever the
// last decode produced, kept so Save can write the bytes rather than a
// re-encoding of the text shown.
let file = null
let decoded = null

const isEncoding = () => readMode() === 'encode'

function showFile(loaded, data) {
  file = { name: loaded.name, type: loaded.type, data }
  sourceName.textContent = `${loaded.name} · ${bytes(data.length)}`
  source.hidden = false
  input.hidden = true
  dropHint.hidden = true
}

function forgetFile() {
  file = null
  source.hidden = true
  input.hidden = false
  dropHint.hidden = false
}

// Only offered when there is something a file could sensibly be made of: the
// decoded bytes, or the Base64 itself when it is long enough to be worth a
// file rather than a selection.
function showSave(label) {
  save.hidden = !label
  save.textContent = label || 'Save'
}

// Shown as a data URI rather than an object URL: the page's own
// Content-Security-Policy allows `data:` images and nothing else, and widening
// it to `blob:` for a preview would be a poor trade.
function showPreview(data, type) {
  if (!type.startsWith('image/')) {
    preview.hidden = true
    previewImage.removeAttribute('src')
    return
  }

  previewImage.src = `data:${type};base64,${toBase64(data, false)}`
  previewCaption.textContent = `${type} · ${bytes(data.length)}`
  preview.hidden = false
}

// A gentle nudge rather than a mode switch. Guessing wrong and silently
// re-reading someone's input would be worse than saying nothing.
function suggest(text) {
  detect.hidden = true
  if (!text || file) return

  const trimmed = text.trim()

  if (isEncoding()) {
    const looksEncoded = trimmed.length > 16 &&
      /^(data:[^,]*,)?[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed.replace(/\s+/g, ''))
    if (!looksEncoded) return

    detectText.textContent = 'That already looks like Base64.'
  } else {
    // Text that is plainly not Base64: something outside the alphabet, and not
    // merely whitespace or padding.
    if (!/[^A-Za-z0-9+/=\s_-]/.test(trimmed)) return
    detectText.textContent = 'That is not Base64 — did you mean to encode it?'
  }

  detect.hidden = false
}

function run() {
  const encoding = isEncoding()

  inputLabel.textContent = encoding ? 'Plain text' : 'Base64'
  outputLabel.textContent = encoding ? 'Base64' : 'Plain text'
  dataUri.parentElement.hidden = !encoding
  wrap.parentElement.hidden = !encoding
  decoded = null

  // A loaded file only makes sense as something to encode; switching to decode
  // puts the textarea back rather than pretending the file is still in play.
  if (!encoding && file) forgetFile()

  const text = file ? '' : input.value

  // Only a genuinely empty box clears the output. Whitespace is real input — a
  // run of spaces has a perfectly good Base64 encoding, and trimming here would
  // refuse to produce it.
  if (!file && !text) {
    output.value = ''
    outputSize.textContent = ''
    showSave(null)
    showPreview(new Uint8Array(), '')
    detect.hidden = true
    clearStatus()
    return
  }

  suggest(text)

  try {
    if (encoding) {
      const data = file ? file.data : encoder.encode(text)
      const encoded = toBase64(data, urlSafe.checked)
      const type = file ? (file.type || sniff(data)?.type || 'application/octet-stream') : 'text/plain'

      output.value = wrapped(dataUri.checked ? `data:${type};base64,${encoded}` : encoded)
      outputSize.textContent = `${bytes(data.length)} → ${bytes(output.value.length)}`
      showPreview(new Uint8Array(), '')
      showSave(output.value.length > 512 ? 'Save' : null)

      if (file) status(`Encoded ${file.name}`, 'ok')
      else clearStatus()
      return
    }

    const { data, type } = fromBase64(text)
    const signature = sniff(data)

    const asText = decoder.decode(data)
    const binary = asText.includes('�')

    decoded = {
      data,
      type: type || signature?.type || (binary ? '' : 'text/plain'),
      extension: signature?.extension || (binary ? 'bin' : 'txt')
    }

    output.value = binary ? '' : asText
    outputSize.textContent = bytes(data.length)
    showPreview(data, decoded.type)
    showSave('Save')

    // U+FFFD means the bytes decoded fine but are not UTF-8 text — most often
    // someone has pasted an encoded image or archive, which is exactly the case
    // Save and the preview exist for.
    if (binary) {
      status(decoded.type
        ? `Decoded ${bytes(data.length)} of ${decoded.type} — not text, so save it as a file`
        : `Decoded ${bytes(data.length)} of binary — not text, so save it as a file`, 'info')
    } else {
      clearStatus()
    }
  } catch (err) {
    output.value = ''
    outputSize.textContent = ''
    showSave(null)
    showPreview(new Uint8Array(), '')
    status(encoding ? 'Could not encode that input' : 'That is not valid Base64', 'err')
  }
}

const readMode = segment('mode', run)

async function load(loaded) {
  showFile(loaded, await readFileBytes(loaded))
  $('#mode-encode').checked = true
  run()
}

$('#sample').addEventListener('click', () => {
  forgetFile()
  setField(input, isEncoding() ? SAMPLE : toBase64(encoder.encode(SAMPLE), urlSafe.checked))
  run()
})

$('#source-clear').addEventListener('click', () => {
  forgetFile()
  run()
})

$('#detect-switch').addEventListener('click', () => {
  $(isEncoding() ? '#mode-decode' : '#mode-encode').checked = true
  run()
})

save.addEventListener('click', () => {
  if (decoded) {
    download(`decoded.${decoded.extension}`, decoded.data, decoded.type || 'application/octet-stream')
    return
  }
  if (output.value) download('encoded.txt', output.value)
})

dropZone($('#input-pane'), load)
filePicker($('#open'), load)

live([input, urlSafe, wrap, dataUri], run)
copyButton($('#copy'), () => output.value)
pasteButton($('#paste'), input, run)
clearButton($('#clear'), input, () => { forgetFile(); run() })
shortcuts({ run, clear: () => { clearField(input); forgetFile(); run() } })

// What a decoded payload usually turns out to be. Nothing binary is offered a
// destination — `decoded` already has Save for that, and no tool here reads
// bytes out of a textarea.
sendTo($('#send'), [
  'json-yaml-formatter',
  'url-encoder-decoder',
  'json-yaml-converter',
  'hash-generator'
], () => output.value, 'Base64 encoder')

remember('devtools.base64', [urlSafe, wrap, dataUri, $('#mode-encode'), $('#mode-decode')])

// After `remember`, so a link that names a mode beats whichever one was left
// selected last time.
prefill([input, urlSafe, wrap, dataUri, $('#mode-encode'), $('#mode-decode')])

run()

receive(input, () => { forgetFile(); run() })
