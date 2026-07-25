import { $, live, status, clearStatus, copyText, encoder } from '../lib/ui.js'
import md5 from '../lib/md5.js'

const input = $('#input')
const uppercase = $('#uppercase')
const digests = $('#digests')

const SAMPLE = 'The quick brown fox jumps over the lazy dog'

// MD5 is ours; the rest come from Web Crypto.
const ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

const toHex = buffer =>
  [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')

async function digest(algorithm, bytes) {
  if (algorithm === 'MD5') return md5(bytes)
  return toHex(await crypto.subtle.digest(algorithm, bytes))
}

function row(algorithm, value) {
  const dt = document.createElement('dt')
  dt.textContent = algorithm

  const dd = document.createElement('dd')

  const text = document.createElement('span')
  text.textContent = value
  dd.append(text)

  // Per-row copy, because wanting one specific digest is the normal case.
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tool-button--ghost monospace'
  button.textContent = 'Copy'
  button.style.marginLeft = '.8em'
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

// Hashing is async, so a fast typist can have several runs in flight. Only the
// newest one is allowed to write to the page.
let latest = 0

async function run() {
  const generation = ++latest
  const bytes = encoder.encode(input.value)

  try {
    const values = await Promise.all(ALGORITHMS.map(algorithm => digest(algorithm, bytes)))
    if (generation !== latest) return

    digests.replaceChildren(
      ...ALGORITHMS.flatMap((algorithm, index) =>
        row(algorithm, uppercase.checked ? values[index].toUpperCase() : values[index])
      )
    )
    clearStatus()
  } catch (err) {
    if (generation !== latest) return
    // SubtleCrypto is only exposed in a secure context.
    digests.replaceChildren(...row('MD5', md5(bytes)))
    status('Only MD5 is available — the SHA algorithms need a secure (https) connection', 'err')
  }
}

$('#sample').addEventListener('click', () => {
  input.value = SAMPLE
  run()
})

live([input, uppercase], run)

run()
