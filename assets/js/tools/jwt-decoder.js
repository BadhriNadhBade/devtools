import {
  $, live, copyButton, pasteButton, clearButton, clearField, status, clearStatus, shortcuts, encoder, decoder
} from '../lib/ui.js'

const input = $('#input')
const keyInput = $('#key')
const keyKind = $('#key-kind')
const result = $('#result')
const headerOut = $('#header')
const payloadOut = $('#payload')
const claimsOut = $('#claims')
const algOut = $('#alg')
const verdict = $('#verdict')
const expectIss = $('#expect-iss')
const expectAud = $('#expect-aud')

// A real HS256 token, signed with the secret below, so the sample exercises
// the verifier rather than only the decoder.
const SAMPLE = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlbW8tMSJ9',
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkJhZGhyaSBOYWRoIiwiYWRtaW4iOnRydWUsImlhdCI6MTcxNjIzOTAyMiwiZXhwIjoyMDMxNTk5MDIyLCJpc3MiOiJodHRwczovL2JhZGhyaW5hZGguY29tIn0',
  ''
].join('.')

const SAMPLE_SECRET = 'devtools-demo-secret'

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

function base64UrlToBytes(part) {
  let normalized = part.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4) normalized += '='

  const binary = atob(normalized)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

const base64UrlDecode = part => decoder.decode(base64UrlToBytes(part))

const bytesToBase64Url = data =>
  btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// ---------------------------------------------------------------------------
// Verification. Everything below turns the header's `alg` and whatever is in
// the key box into a CryptoKey, then checks the signature over the first two
// parts of the token — which is all a JWS signature ever covers.
// ---------------------------------------------------------------------------

const HASHES = { 256: 'SHA-256', 384: 'SHA-384', 512: 'SHA-512' }

// ES512 is P-521, not P-512: the curve is named for its field size, and the
// two differ by one bit. Worth spelling out, because the mismatch looks like a
// typo in every table it appears in.
const CURVES = { 256: 'P-256', 384: 'P-384', 512: 'P-521' }

function algorithmFor(alg) {
  const size = Number(alg.slice(2))
  const hash = HASHES[size]
  if (!hash) return null

  if (alg.startsWith('HS')) return { name: 'HMAC', hash }
  if (alg.startsWith('RS')) return { name: 'RSASSA-PKCS1-v1_5', hash }
  // The salt is the hash length, which is what every JWS implementation uses.
  if (alg.startsWith('PS')) return { name: 'RSA-PSS', hash, saltLength: size / 8 }
  if (alg.startsWith('ES')) return { name: 'ECDSA', hash, namedCurve: CURVES[size] }

  return null
}

function pemToBytes(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return base64UrlToBytes(body)
}

// Says what the key box is holding, so the label above it can report it and
// importKey can be handed the right format.
function describeKey(text) {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{')) return { kind: 'jwk', label: 'JWK' }
  if (/-----BEGIN (RSA )?PUBLIC KEY-----/.test(trimmed)) return { kind: 'spki', label: 'PEM public key' }
  if (/-----BEGIN CERTIFICATE-----/.test(trimmed)) return { kind: 'certificate', label: 'certificate' }
  if (/-----BEGIN [^-]*PRIVATE KEY-----/.test(trimmed)) return { kind: 'private', label: 'private key' }
  return { kind: 'secret', label: 'shared secret' }
}

async function importVerificationKey(text, alg, algorithm) {
  const described = describeKey(text)

  if (described.kind === 'certificate') {
    throw new Error('That is an X.509 certificate. Extract the public key from it first — openssl x509 -pubkey -noout')
  }

  if (described.kind === 'private') {
    throw new Error('That is a private key. Verifying needs the public half of the pair')
  }

  const symmetric = alg.startsWith('HS')

  if (described.kind === 'secret') {
    if (!symmetric) throw new Error(`${alg} is signed with a key pair — this box needs a public key, not a secret`)
    return crypto.subtle.importKey('raw', encoder.encode(text.trim()), algorithm, false, ['verify'])
  }

  if (symmetric && described.kind === 'spki') {
    throw new Error(`${alg} is signed with a shared secret — a public key cannot verify it`)
  }

  if (described.kind === 'jwk') {
    const jwk = JSON.parse(text)
    return crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify'])
  }

  return crypto.subtle.importKey('spki', pemToBytes(text), algorithm, false, ['verify'])
}

async function verify(parts, header) {
  const alg = header.alg

  if (alg === 'none' || !alg) return { kind: 'err', text: 'alg none', detail: 'This token declares no algorithm, so there is nothing to verify' }

  const algorithm = algorithmFor(alg)
  if (!algorithm) return { kind: 'err', text: `${alg} unsupported`, detail: `${alg} is not an algorithm this page can check` }

  const key = await importVerificationKey(keyInput.value, alg, algorithm)
  const signed = encoder.encode(`${parts[0]}.${parts[1]}`)
  const signature = base64UrlToBytes(parts[2])

  const ok = await crypto.subtle.verify(algorithm, key, signature, signed)

  return ok
    ? { kind: 'ok', text: 'Signature valid', detail: `Verified against the key you supplied, using ${alg}` }
    : { kind: 'err', text: 'Signature invalid', detail: `The signature does not match this header and payload under ${alg}` }
}

// ---------------------------------------------------------------------------

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

// The claims a caller is entitled to care about beyond the signature: a token
// can be perfectly valid and still be the wrong token.
function claimProblem(payload) {
  const now = Date.now() / 1000

  if (typeof payload.exp === 'number' && payload.exp < now) return `expired ${relative(payload.exp - now)}`
  if (typeof payload.nbf === 'number' && payload.nbf > now) return `not valid until ${relative(payload.nbf - now)}`

  const issuer = expectIss.value.trim()
  if (issuer && payload.iss !== issuer) return `issued by ${payload.iss ?? 'nobody'}, not ${issuer}`

  const audience = expectAud.value.trim()
  if (audience) {
    const held = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!held.includes(audience)) return `not addressed to ${audience}`
  }

  return null
}

function showVerdict(state) {
  verdict.hidden = !state
  if (!state) return

  if (state.kind) verdict.dataset.kind = state.kind
  else verdict.removeAttribute('data-kind')

  verdict.textContent = state.text
}

function fail(message) {
  result.hidden = true
  algOut.textContent = ''
  showVerdict(null)
  status(message, 'err')
}

// Verification is async, so a fast typist can have several runs in flight.
// Only the newest is allowed to write to the page.
let latest = 0

async function run() {
  const generation = ++latest
  const token = input.value.trim().replace(/^Bearer\s+/i, '')

  const described = describeKey(keyInput.value)
  keyKind.textContent = described ? described.label : ''

  if (!token) {
    result.hidden = true
    algOut.textContent = ''
    showVerdict(null)
    clearStatus()
    return
  }

  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    fail('A JWT is three dot-separated parts — header.payload.signature')
    return
  }

  let header
  let payload
  try {
    header = JSON.parse(base64UrlDecode(parts[0]))
    payload = JSON.parse(base64UrlDecode(parts[1]))
  } catch (err) {
    fail('Could not decode that token — the header or payload is not valid Base64url JSON')
    return
  }

  // Both halves must be JSON objects. A token carrying a bare scalar — say a
  // payload of `123` — parses without complaint, and everything downstream that
  // treats it as an object would then throw.
  if (!isObject(header) || !isObject(payload)) {
    fail('Decoded, but the header and payload must each be a JSON object')
    return
  }

  headerOut.textContent = JSON.stringify(header, null, 2)
  payloadOut.textContent = JSON.stringify(payload, null, 2)
  renderClaims(payload)
  result.hidden = false

  algOut.textContent = [header.alg, header.kid && `kid ${header.kid}`].filter(Boolean).join(' · ')

  const problem = claimProblem(payload)

  // alg "none" is worth shouting about whether or not a key was offered: it is
  // the shape every JWT forgery takes.
  if (header.alg === 'none') {
    showVerdict({ kind: 'err', text: 'alg none' })
    status('This token declares alg "none" — it carries no signature at all', 'err')
    return
  }

  if (!keyInput.value.trim() || !parts[2]) {
    showVerdict({ kind: null, text: 'Not verified' })
    status(problem ? `Decoded, not verified. This token is ${problem}` : 'Decoded. No key given, so the signature is unchecked', problem ? 'err' : 'info')
    return
  }

  try {
    const state = await verify(parts, header)
    if (generation !== latest) return

    showVerdict(state)

    if (state.kind === 'ok' && problem) {
      status(`Signature valid, but this token is ${problem}`, 'err')
    } else {
      status(state.detail, state.kind)
    }
  } catch (err) {
    if (generation !== latest) return
    showVerdict({ kind: 'err', text: 'Key rejected' })
    status(err.message || 'That key could not be used to verify this token', 'err')
  }
}

// Signing the sample here rather than pasting a fixed signature keeps the
// secret and the token honest about each other: change one and the page stops
// claiming the other is valid.
async function sample() {
  input.value = SAMPLE
  keyInput.value = SAMPLE_SECRET

  try {
    const parts = SAMPLE.split('.')
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(SAMPLE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${parts[0]}.${parts[1]}`))
    input.value = `${parts[0]}.${parts[1]}.${bytesToBase64Url(new Uint8Array(signature))}`
  } catch (err) {
    // No Web Crypto: the sample still decodes, it just cannot be verified.
    keyInput.value = ''
  }

  run()
}

$('#sample').addEventListener('click', sample)

live([input, keyInput, expectIss, expectAud], run)
copyButton($('#copy'), () => payloadOut.textContent)
copyButton($('#copy-header'), () => headerOut.textContent)
pasteButton($('#paste'), input, run)
clearButton($('#clear'), [input, keyInput], run)
shortcuts({ run, clear: () => { clearField(input); clearField(keyInput); run() } })

run()
