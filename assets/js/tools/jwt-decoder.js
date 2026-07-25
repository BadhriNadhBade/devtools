import { $, live, copyButton, status, clearStatus, decoder } from '../lib/ui.js'

const input = $('#input')
const result = $('#result')
const headerOut = $('#header')
const payloadOut = $('#payload')
const claimsOut = $('#claims')

// The signature is filler — this tool never checks one, and shipping a real
// one would only suggest otherwise. The header and payload are genuine.
const SAMPLE = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkJhZGhyaSBOYWRoIiwiYWRtaW4iOnRydWUsImlhdCI6MTcxNjIzOTAyMiwiZXhwIjoyMDMxNTk5MDIyLCJpc3MiOiJodHRwczovL2JhZGhyaW5hZGguY29tIn0',
  'KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30'
].join('.')

const NAMES = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires',
  nbf: 'Not before',
  iat: 'Issued at',
  jti: 'Token ID'
}

const TIME_CLAIMS = ['exp', 'nbf', 'iat']

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

function base64UrlDecode(part) {
  let normalized = part.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4) normalized += '='

  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return decoder.decode(bytes)
}

const relative = seconds => {
  const units = [
    ['year', 31536000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ]

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        .format(Math.round(seconds / size), unit)
    }
  }
}

function describeTime(value) {
  if (typeof value !== 'number') return `${value} (not a number — should be seconds since the epoch)`

  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return `${value} (not a valid time)`

  return `${date.toISOString()} — ${relative(value - Date.now() / 1000)}`
}

function renderClaims(payload) {
  claimsOut.replaceChildren()

  const present = Object.keys(NAMES).filter(claim => claim in payload)
  if (!present.length) {
    const dt = document.createElement('dt')
    dt.textContent = '—'
    const dd = document.createElement('dd')
    dd.textContent = 'No registered claims in this token'
    claimsOut.append(dt, dd)
    return
  }

  for (const claim of present) {
    const dt = document.createElement('dt')
    dt.textContent = `${claim} · ${NAMES[claim]}`

    const dd = document.createElement('dd')
    const value = payload[claim]
    dd.textContent = TIME_CLAIMS.includes(claim)
      ? describeTime(value)
      : (typeof value === 'object' ? JSON.stringify(value) : String(value))

    claimsOut.append(dt, dd)
  }
}

// Reports the first thing that is actually wrong with the token, rather than
// a generic failure.
function expiryWarning(payload, header) {
  const now = Date.now() / 1000

  if (header.alg === 'none') return ['This token declares alg "none" — it carries no signature at all', 'err']
  if (typeof payload.exp === 'number' && payload.exp < now) return ['Decoded. This token expired ' + relative(payload.exp - now), 'err']
  if (typeof payload.nbf === 'number' && payload.nbf > now) return ['Decoded. This token is not valid until ' + relative(payload.nbf - now), 'info']

  return ['Decoded', 'ok']
}

function run() {
  const token = input.value.trim().replace(/^Bearer\s+/i, '')

  if (!token) {
    result.hidden = true
    clearStatus()
    return
  }

  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    result.hidden = true
    status('A JWT is three dot-separated parts — header.payload.signature', 'err')
    return
  }

  let header
  let payload
  try {
    header = JSON.parse(base64UrlDecode(parts[0]))
    payload = JSON.parse(base64UrlDecode(parts[1]))
  } catch (err) {
    result.hidden = true
    status('Could not decode that token — the header or payload is not valid Base64url JSON', 'err')
    return
  }

  // Both halves must be JSON objects. A token carrying a bare scalar — say a
  // payload of `123` — parses without complaint, and everything downstream
  // that treats it as an object would then throw.
  if (!isObject(header) || !isObject(payload)) {
    result.hidden = true
    status('Decoded, but the header and payload must each be a JSON object', 'err')
    return
  }

  headerOut.textContent = JSON.stringify(header, null, 2)
  payloadOut.textContent = JSON.stringify(payload, null, 2)
  renderClaims(payload)
  result.hidden = false

  status(...expiryWarning(payload, header))
}

$('#sample').addEventListener('click', () => {
  input.value = SAMPLE
  run()
})

live([input], run)
copyButton($('#copy'), () => payloadOut.textContent)

run()
