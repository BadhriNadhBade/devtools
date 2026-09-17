import { $, $$, live, segment, copyButton, download, status, shortcuts } from '../lib/ui.js'
import { WORDS, BITS_PER_WORD } from '../lib/wordlist.js'

const output = $('#output')
const lengthInput = $('#length')
const wordsInput = $('#words')
const quantityInput = $('#quantity')
const unambiguous = $('#unambiguous')
const everySet = $('#every-set')
const extra = $('#extra')
const exclude = $('#exclude')
const separator = $('#separator')
const capitalize = $('#capitalize')
const addNumber = $('#add-number')
const entropyOut = $('#entropy')
const strengthOut = $('#strength')
const lengthField = $('#length-field')
const wordsField = $('#words-field')
const stringControls = $('#string-controls')
const alphabetControls = $('#alphabet-controls')
const passphraseControls = $('#passphrase-controls')

const SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!#$%&()*+,-.:;<=>?@[]^_{|}~'
}

// Characters that are easy to confuse when a secret is read aloud or copied
// off a screen.
const LOOKALIKES = new Set(`O0oIl1|\`'"`.split(''))

// Base58 is Bitcoin's alphabet: the digits and letters, less the four that
// look like each other.
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const PRESETS = {
  password: { kind: 'string', length: 20, sets: ['uppercase', 'lowercase', 'digits', 'symbols'], everySet: true, quantity: 5 },
  passphrase: { kind: 'passphrase', words: 6, separator: '-', quantity: 5 },
  pin: { kind: 'string', length: 6, sets: ['digits'], quantity: 10 },
  hex: { kind: 'string', length: 32, sets: [], extra: '0123456789abcdef', quantity: 3 },
  base58: { kind: 'string', length: 22, sets: [], extra: BASE58, quantity: 3 },
  api: { kind: 'string', length: 40, sets: ['uppercase', 'lowercase', 'digits'], quantity: 1 },
  // A WPA2 passphrase gets typed into a television by hand at least once, so
  // lookalikes and symbols are both more trouble than the bits are worth.
  wifi: { kind: 'string', length: 20, sets: ['uppercase', 'lowercase', 'digits'], unambiguous: true, quantity: 1 }
}

const readKind = segment('kind', generate)
const isWords = () => readKind() === 'passphrase'

function alphabet() {
  let characters = $$('.charset')
    .filter(box => box.checked)
    .map(box => SETS[box.value])
    .join('') + extra.value

  if (unambiguous.checked) {
    characters = [...characters].filter(character => !LOOKALIKES.has(character)).join('')
  }

  const banned = new Set(exclude.value.split(''))

  // Deduplicated as well as filtered: a character offered twice — by the extra
  // field repeating one of the sets, say — would otherwise be twice as likely
  // as its neighbours, which is exactly the bias the sampling below avoids.
  return [...new Set([...characters].filter(character => !banned.has(character)))].join('')
}

// Rejection sampling. Values at or above the largest exact multiple of the
// alphabet size are thrown away, so no symbol is more likely than another.
function randomIndices(count, size) {
  const out = []

  // A byte is enough below 256 possibilities; above that — the word list —
  // take 32 bits.
  const wide = size > 256
  const ceiling = Math.floor((wide ? 4294967296 : 256) / size) * size
  const buffer = wide ? new Uint32Array(Math.max(32, count)) : new Uint8Array(Math.max(64, count * 2))

  while (out.length < count) {
    crypto.getRandomValues(buffer)
    for (const value of buffer) {
      if (value < ceiling) {
        out.push(value % size)
        if (out.length === count) break
      }
    }
  }

  return out
}

const randomString = (characters, length) =>
  randomIndices(length, characters.length).map(index => characters[index]).join('')

// Which of the selected sets a string is missing. Only the sets are checked —
// the extra field is a free-form alphabet rather than a class to guarantee.
function missingSets(value) {
  return $$('.charset')
    .filter(box => box.checked)
    .filter(box => ![...SETS[box.value]].some(character => value.includes(character)))
    .map(box => box.value)
}

// Drawing again until every set appears leaves the result uniform over the
// strings that satisfy the rule, which is not true of the usual trick of
// forcing a character into a fixed position.
function withEverySet(characters, length) {
  const wanted = $$('.charset').filter(box => box.checked).length
  if (!wanted || length < wanted) return { value: randomString(characters, length), short: length < wanted }

  for (let attempt = 0; attempt < 200; attempt++) {
    const value = randomString(characters, length)
    if (!missingSets(value).length) return { value }
  }

  // Only reachable if the sets have been filtered down to nothing usable, in
  // which case saying so beats looping.
  return { value: randomString(characters, length), exhausted: true }
}

function passphrase(count) {
  const chosen = randomIndices(count, WORDS.length).map(index => WORDS[index])
  const words = capitalize.checked
    ? chosen.map(word => word[0].toUpperCase() + word.slice(1))
    : chosen

  const joined = words.join(separator.value)
  // A trailing digit is there to satisfy a policy, not to add strength, so it
  // is left out of the entropy below.
  return addNumber.checked ? joined + separator.value + randomIndices(1, 10)[0] : joined
}

const SECOND = 1
const MINUTE = 60
const HOUR = 3600
const DAY = 86400
const YEAR = 31557600

// An offline attack against a fast hash. Deliberately pessimistic: it is the
// number that tells you whether a secret is long enough, and a cheerful
// estimate is the useless kind.
const GUESSES_PER_SECOND = 1e10

function crackTime(bits) {
  // Half the keyspace on average.
  const seconds = 2 ** (bits - 1) / GUESSES_PER_SECOND

  if (seconds < SECOND) return 'instantly'
  if (seconds < MINUTE) return `${Math.round(seconds)} seconds`
  if (seconds < HOUR) return `${Math.round(seconds / MINUTE)} minutes`
  if (seconds < DAY) return `${Math.round(seconds / HOUR)} hours`
  if (seconds < YEAR) return `${Math.round(seconds / DAY)} days`

  const years = seconds / YEAR
  if (years < 1e3) return `${Math.round(years)} years`
  if (years < 1e6) return `${Math.round(years / 1e3)} thousand years`
  if (years < 1e9) return `${Math.round(years / 1e6)} million years`
  if (years < 1e12) return `${Math.round(years / 1e9)} billion years`
  return `${(years / 1e12).toPrecision(2)} trillion years`
}

function describeStrength(bits, detail) {
  const rounded = Math.floor(bits)

  strengthOut.textContent = rounded
    ? `${rounded} bits — about ${crackTime(rounded)} to guess at ten billion tries a second${detail ? `. ${detail}` : ''}`
    : ''
}

function generate() {
  const words = isWords()

  lengthField.hidden = words
  wordsField.hidden = !words
  stringControls.hidden = words
  alphabetControls.hidden = words
  passphraseControls.hidden = !words

  const quantity = Math.min(500, Math.max(1, parseInt(quantityInput.value, 10) || 1))

  if (words) {
    const count = Math.min(64, Math.max(2, parseInt(wordsInput.value, 10) || 2))
    output.value = Array.from({ length: quantity }, () => passphrase(count)).join('\n')

    const bits = count * BITS_PER_WORD
    entropyOut.textContent = `${WORDS.length} words · ~${Math.floor(bits)} bits`
    describeStrength(bits, `Each word is worth ${BITS_PER_WORD.toFixed(1)} bits${addNumber.checked ? '; the trailing digit is not counted' : ''}.`)
    status(`Generated ${quantity} passphrase${quantity === 1 ? '' : 's'}`, 'ok')
    return
  }

  const characters = alphabet()

  if (!characters) {
    output.value = ''
    entropyOut.textContent = ''
    strengthOut.textContent = ''
    status('Pick at least one character set, or put something in “Also allow”', 'err')
    return
  }

  const length = Math.min(4096, Math.max(1, parseInt(lengthInput.value, 10) || 1))

  const results = Array.from({ length: quantity }, () =>
    everySet.checked ? withEverySet(characters, length) : { value: randomString(characters, length) }
  )

  output.value = results.map(result => result.value).join('\n')

  const bits = length * Math.log2(characters.length)
  entropyOut.textContent = `${characters.length} chars · ~${Math.floor(bits)} bits`
  describeStrength(bits)

  if (results.some(result => result.short)) {
    status('Too short to hold one of every set — the rule was skipped', 'info')
  } else {
    status(`Generated ${quantity} string${quantity === 1 ? '' : 's'}`, 'ok')
  }
}

function applyPreset(name) {
  const preset = PRESETS[name]
  if (!preset) return

  $(preset.kind === 'passphrase' ? '#kind-passphrase' : '#kind-string').checked = true

  if (preset.length) lengthInput.value = preset.length
  if (preset.words) wordsInput.value = preset.words
  if (preset.separator) separator.value = preset.separator
  quantityInput.value = preset.quantity

  if (preset.sets) {
    for (const box of $$('.charset')) box.checked = preset.sets.includes(box.value)
  }

  extra.value = preset.extra || ''
  exclude.value = ''
  unambiguous.checked = Boolean(preset.unambiguous)
  everySet.checked = Boolean(preset.everySet)

  generate()
}

for (const button of $$('#presets [data-preset]')) {
  button.addEventListener('click', () => applyPreset(button.dataset.preset))
}

$('#generate').addEventListener('click', generate)

$('#download').addEventListener('click', () => {
  if (!output.value) return
  download('random.txt', output.value)
})

live([
  lengthInput, wordsInput, quantityInput, unambiguous, everySet, extra, exclude,
  separator, capitalize, addNumber, ...$$('.charset')
], generate)

copyButton($('#copy'), () => output.value)
shortcuts({ run: generate })

// Nothing here is remembered on purpose: every field on this page is either a
// secret or a description of one.

generate()
