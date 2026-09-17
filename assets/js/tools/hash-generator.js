import {
  $, live, status, clearStatus, copyText, encoder, bytes,
  dropZone, filePicker, readFileBytes, pasteButton, clearButton, clearField, shortcuts
} from '../lib/ui.js'
import md5 from '../lib/md5.js'
import crc32 from '../lib/crc32.js'

const input = $('#input')
const uppercase = $('#uppercase')
const hmac = $('#hmac')
const keyField = $('#key-field')
const key = $('#key')
const digests = $('#digests')
const expected = $('#expected')
const verdict = $('#verdict')
const inputSize = $('#input-size')
const source = $('#source')
const sourceName = $('#source-name')
const dropHint = $('#drop-hint')

const SAMPLE = 'The quick brown fox jumps over the lazy dog'

// CRC32 and MD5 are ours; the rest come from Web Crypto. HMAC is only offered
// for the algorithms Web Crypto will key — writing an HMAC-MD5 by hand to
// round out a list would be offering a worse option for the sake of symmetry.
const ALGORITHMS = ['CRC32', 'MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']
const KEYED = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

const toHex = buffer =>
  [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')

async function digest(algorithm, data) {
  if (algorithm === 'CRC32') return crc32(data)
  if (algorithm === 'MD5') return md5(data)
  return toHex(await crypto.subtle.digest(algorithm, data))
}

async function keyedDigest(algorithm, data, secret) {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']
  )
  return toHex(await crypto.subtle.sign('HMAC', material, data))
}

// What is being hashed. A file is held as bytes; anything else comes out of
// the textarea.
let file = null

function showFile(loaded, data) {
  file = { name: loaded.name, data }
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

// Takes a bare digest, a `sha256sum` line ("<digest>  <filename>"), or a
// prefixed one ("sha256:..." / "SHA256-..."), because all three get copied out
// of the places these values come from.
function wanted() {
  const raw = expected.value.trim()
  if (!raw) return ''

  const first = raw.split(/\s+/)[0]
  return first.replace(/^[a-z0-9-]+[:=]/i, '').replace(/[^0-9a-f]/gi, '').toLowerCase()
}

function row(algorithm, value, matched) {
  const dt = document.createElement('dt')
  dt.textContent = algorithm

  const dd = document.createElement('dd')

  const text = document.createElement('span')
  text.textContent = value
  dd.append(text)

  if (matched) {
    const badge = document.createElement('span')
    badge.className = 'tool-badge'
    badge.dataset.kind = 'ok'
    badge.textContent = 'matches'
    dd.append(' ', badge)
  }

  // Per-row copy, because wanting one specific digest is the normal case.
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tool-button--ghost monospace tool-copy-inline'
  button.textContent = 'Copy'
  button.addEventListener('click', async () => {
    try {
      await copyText(value)
      status(`${algorithm} copied`, 'ok')
    } catch (err) {
      status('Could not copy — select the digest and copy manually', 'err')
    }
  })
  dd.append(button)

  return [dt, dd]
}

// The verdict is deliberately about the whole set rather than one algorithm:
// someone pasting a digest usually knows the value but not which function
// produced it, and saying which one matched answers both questions at once.
function show(values, algorithms) {
  const target = wanted()
  const hit = target ? algorithms.find((name, index) => values[index].toLowerCase() === target) : null

  digests.replaceChildren(
    ...algorithms.flatMap((algorithm, index) =>
      row(algorithm, uppercase.checked ? values[index].toUpperCase() : values[index], algorithm === hit)
    )
  )

  if (!target) {
    verdict.hidden = true
    return
  }

  verdict.hidden = false
  verdict.replaceChildren()

  const badge = document.createElement('span')
  badge.className = 'tool-badge'
  badge.dataset.kind = hit ? 'ok' : 'err'
  badge.textContent = hit ? 'Match' : 'No match'

  const detail = document.createElement('span')
  detail.textContent = hit
    ? `That is the ${hit} digest of this input.`
    : `No digest of this input equals that value${target.length % 2 || target.length < 8 ? ' — and it is not a whole number of bytes of hex, so check it copied cleanly' : ''}.`

  verdict.append(badge, detail)
  return hit
}

// Hashing is async, so a fast typist can have several runs in flight. Only the
// newest one is allowed to write to the page.
let latest = 0

async function run() {
  const generation = ++latest
  const keyed = hmac.checked

  keyField.hidden = !keyed

  const data = file ? file.data : encoder.encode(input.value)
  inputSize.textContent = data.length ? bytes(data.length) : ''

  const algorithms = keyed ? KEYED : ALGORITHMS

  if (keyed && !key.value) {
    digests.replaceChildren()
    verdict.hidden = true
    status('HMAC needs a key', 'info')
    return
  }

  try {
    const values = await Promise.all(algorithms.map(algorithm =>
      keyed ? keyedDigest(algorithm, data, key.value) : digest(algorithm, data)
    ))
    if (generation !== latest) return

    const hit = show(values, algorithms)

    if (wanted()) status(hit ? `Matches the ${hit} digest` : 'That digest does not match this input', hit ? 'ok' : 'err')
    else if (file) status(`Hashed ${file.name} — ${bytes(data.length)}`, 'ok')
    else clearStatus()
  } catch (err) {
    if (generation !== latest) return

    // SubtleCrypto is only exposed in a secure context, which leaves the two
    // algorithms this page implements itself.
    if (keyed) {
      digests.replaceChildren()
      status('HMAC needs a secure (https) connection', 'err')
      return
    }

    digests.replaceChildren(...row('CRC32', crc32(data)), ...row('MD5', md5(data)))
    status('Only CRC32 and MD5 are available — the SHA algorithms need a secure (https) connection', 'err')
  }
}

async function load(loaded) {
  showFile(loaded, await readFileBytes(loaded))
  run()
}

$('#sample').addEventListener('click', () => {
  forgetFile()
  input.value = SAMPLE
  run()
})

$('#source-clear').addEventListener('click', () => {
  forgetFile()
  run()
})

dropZone($('#input-pane'), load)
filePicker($('#open'), load)

pasteButton($('#paste'), input, run)
clearButton($('#clear'), input, () => { forgetFile(); run() })
shortcuts({ run, clear: () => { clearField(input); clearField(expected); forgetFile(); run() } })

live([input, uppercase, hmac, key, expected], run)

run()
