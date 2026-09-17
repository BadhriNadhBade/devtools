import {
  $, live, segment, copyButton, download, status, clearStatus, remember, clearField, shortcuts, encoder
} from '../lib/ui.js'

const output = $('#output')
const quantity = $('#quantity')
const uppercase = $('#uppercase')
const noHyphens = $('#no-hyphens')
const braces = $('#braces')
const hint = $('#version-hint')
const nameFields = $('#name-fields')
const namespace = $('#namespace')
const customNamespace = $('#custom-namespace')
const name = $('#name')
const inspectInput = $('#inspect')
const inspection = $('#inspection')

const NIL = '00000000-0000-0000-0000-000000000000'

const HINTS = {
  4: 'Version 4 is 122 random bits. Use it when you just need something unique and unguessable.',
  7: 'Version 7 puts a millisecond timestamp in the leading bits, so UUIDs sort in the order they were created — kinder to database indexes than v4.',
  5: 'Version 5 hashes a namespace and a name, so the same pair always gives the same UUID. Use it when the identifier has to be derivable rather than remembered.',
  ulid: 'A ULID is not a UUID: 48 bits of timestamp and 80 random, written in Crockford base32. Sorts by time, 26 characters, no hyphens.',
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

// The version nibble goes in the high half of byte 6; the variant bits are the
// top two of byte 8. Everything else stays as it was generated.
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

const HEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

function uuidToBytes(text) {
  const hex = text.replace(/[{}-]/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// v5 is SHA-1 over the namespace's raw bytes followed by the name's, truncated
// to 16 and stamped. The hash is what makes it reproducible; the stamping is
// what makes the result a UUID rather than a digest.
async function v5(namespaceUuid, text) {
  const nameBytes = encoder.encode(text)
  const joined = new Uint8Array(16 + nameBytes.length)
  joined.set(uuidToBytes(namespaceUuid))
  joined.set(nameBytes, 16)

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', joined))
  return format(stamp(digest.slice(0, 16), 5))
}

// Crockford's base32: no I, L, O or U, so nothing in a ULID can be misread as
// something else when it is written down.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function ulid() {
  const time = Date.now()
  let out = ''

  // 48 bits of time, ten characters of five bits each.
  for (let i = 9; i >= 0; i--) {
    out += CROCKFORD[Math.floor(time / 32 ** i) % 32]
  }

  // 80 bits of randomness, sixteen more characters. Drawn a byte at a time and
  // masked rather than taken modulo, so every symbol stays equally likely.
  const random = crypto.getRandomValues(new Uint8Array(16))
  for (const byte of random) out += CROCKFORD[byte & 0x1f]

  return out
}

// ---------------------------------------------------------------------------
// Inspect
// ---------------------------------------------------------------------------

const VARIANTS = [
  { mask: 0x80, value: 0x00, label: 'NCS (reserved, pre-standard)' },
  { mask: 0xc0, value: 0x80, label: 'RFC 4122' },
  { mask: 0xe0, value: 0xc0, label: 'Microsoft (reserved)' },
  { mask: 0xe0, value: 0xe0, label: 'reserved for the future' }
]

const VERSION_NAMES = {
  1: 'v1 — time and MAC address',
  2: 'v2 — DCE security',
  3: 'v3 — MD5 of a namespace and name',
  4: 'v4 — random',
  5: 'v5 — SHA-1 of a namespace and name',
  6: 'v6 — reordered time',
  7: 'v7 — Unix time and random',
  8: 'v8 — custom'
}

// v1 and v6 count 100-nanosecond intervals from the Gregorian epoch, which is
// 1582 — the offset below is how many of them there are before 1970.
const GREGORIAN_OFFSET = 12219292800000n

function describeRow(label, value) {
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  return [dt, dd]
}

function inspectUuid(text) {
  const bytes = uuidToBytes(text)
  const rows = []

  if (bytes.every(byte => byte === 0)) {
    rows.push(['Kind', 'The nil UUID — all zeroes, meaning “no value”'])
    return rows
  }

  if (bytes.every(byte => byte === 0xff)) {
    rows.push(['Kind', 'The max UUID — all ones, the far end of the ordering'])
    return rows
  }

  const version = bytes[6] >> 4
  const variant = VARIANTS.find(candidate => (bytes[8] & candidate.mask) === candidate.value)

  rows.push(['Version', VERSION_NAMES[version] || `${version} — not a version any specification defines`])
  rows.push(['Variant', variant ? variant.label : 'unrecognised'])

  if (version === 7) {
    let milliseconds = 0
    for (let i = 0; i < 6; i++) milliseconds = milliseconds * 256 + bytes[i]
    rows.push(['Created', new Date(milliseconds).toISOString()])
  }

  if (version === 1 || version === 6) {
    // v1 scatters its timestamp low-field-first; v6 puts the same bits in
    // order. Both are 60 bits of 100ns ticks once reassembled.
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const ticks = version === 1
      ? BigInt(`0x${hex.slice(13, 16)}${hex.slice(8, 12)}${hex.slice(0, 8)}`)
      : BigInt(`0x${hex.slice(0, 12)}${hex.slice(13, 16)}`)

    const milliseconds = ticks / 10000n - GREGORIAN_OFFSET
    rows.push(['Created', new Date(Number(milliseconds)).toISOString()])
  }

  if (version === 4) rows.push(['Entropy', '122 random bits — there is nothing else in it to read'])
  if (version === 3 || version === 5) {
    rows.push(['Entropy', 'A truncated hash. The namespace and name that produced it cannot be recovered'])
  }

  return rows
}

function inspectUlid(text) {
  const upper = text.toUpperCase()
  let time = 0
  for (let i = 0; i < 10; i++) time = time * 32 + CROCKFORD.indexOf(upper[i])

  return [
    ['Kind', 'ULID — 48 bits of time, 80 random'],
    ['Created', new Date(time).toISOString()],
    ['As UUID', 'A ULID is the same 128 bits as a UUID, but it carries no version or variant nibbles, so it is not one']
  ]
}

function describe() {
  const text = inspectInput.value.trim().replace(/^urn:uuid:/i, '')

  if (!text) {
    inspection.hidden = true
    return
  }

  const rows = HEX.test(text.replace(/^\{|\}$/g, ''))
    ? inspectUuid(text.replace(/^\{|\}$/g, ''))
    : /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i.test(text)
      ? inspectUlid(text)
      : null

  inspection.hidden = false
  inspection.replaceChildren(
    ...(rows || [['Not recognised', 'That is neither a 32-hex-digit UUID nor a 26-character ULID']])
      .flatMap(([label, value]) => describeRow(label, value))
  )
}

// ---------------------------------------------------------------------------

const readVersion = segment('version', () => {
  hint.textContent = HINTS[readVersion()]
  generate()
})

function decorate(values) {
  let out = values
  // ULIDs have no hyphens to remove and no case to change: Crockford base32 is
  // upper case by definition, and lowercasing one is a different string.
  if (readVersion() === 'ulid') return out

  if (noHyphens.checked) out = out.map(value => value.replace(/-/g, ''))
  if (uppercase.checked) out = out.map(value => value.toUpperCase())
  if (braces.checked) out = out.map(value => `{${value}}`)
  return out
}

// Generation is async now that v5 hashes, so a held key or a fast typist can
// have several runs in flight. Only the newest writes to the page.
let latest = 0

async function generate() {
  const generation = ++latest
  const version = readVersion()
  const count = Math.min(500, Math.max(1, parseInt(quantity.value, 10) || 1))

  nameFields.hidden = version !== '5'
  customNamespace.hidden = namespace.value !== 'custom'

  let values

  if (version === 'nil') {
    values = Array.from({ length: count }, () => NIL)
  } else if (version === 'ulid') {
    values = Array.from({ length: count }, ulid)
  } else if (version === '5') {
    const chosen = namespace.value === 'custom' ? customNamespace.value.trim() : namespace.value

    if (!HEX.test(chosen)) {
      output.value = ''
      status('A v5 UUID is hashed against a namespace, which has to be a UUID itself', 'err')
      return
    }

    try {
      // Numbered when there is more than one, because the same name always
      // hashes to the same UUID — a column of identical values is not a bulk
      // generator, it is a mistake.
      values = await Promise.all(Array.from({ length: count }, (_, index) =>
        v5(chosen, count === 1 ? name.value : `${name.value}${index ? `-${index + 1}` : ''}`)
      ))
      if (generation !== latest) return
    } catch (err) {
      status('v5 needs SHA-1 from Web Crypto, which needs a secure (https) connection', 'err')
      return
    }
  } else {
    values = Array.from({ length: count }, version === '7' ? v7 : v4)
  }

  output.value = decorate(values).join('\n')

  const noun = version === 'ulid' ? 'ULID' : 'UUID'
  status(`Generated ${count} ${noun}${count === 1 ? '' : 's'}`, 'ok')
}

$('#generate').addEventListener('click', generate)

$('#download').addEventListener('click', () => {
  if (!output.value) return
  download(readVersion() === 'ulid' ? 'ulids.txt' : 'uuids.txt', output.value)
})

// The common case for the inspector is "what is the thing I just made", so it
// is one click rather than a copy and a paste.
$('#inspect-output').addEventListener('click', () => {
  const first = output.value.split('\n')[0]
  if (!first) return
  inspectInput.value = first
  describe()
})

live([quantity, noHyphens, uppercase, braces, namespace, customNamespace, name], generate)
live([inspectInput], describe)
copyButton($('#copy'), () => output.value)
shortcuts({ run: generate, clear: () => { clearField(inspectInput); describe(); clearStatus() } })

remember('devtools.uuid', [
  quantity, uppercase, noHyphens, braces, namespace,
  $('#version-4'), $('#version-7'), $('#version-5'), $('#version-ulid'), $('#version-nil')
])

hint.textContent = HINTS[readVersion()]
generate()
