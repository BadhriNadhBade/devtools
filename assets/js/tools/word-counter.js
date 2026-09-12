import {
  $, live, bytes, encoder, dropZone, filePicker, readFileText,
  pasteButton, clearButton, clearField, remember, shortcuts, status
} from '../lib/ui.js'

const input = $('#input')
const statsOut = $('#stats')
const frequencyOut = $('#frequency')
const skipStopwords = $('#stopwords')
const gram = $('#gram')
const targets = $('#targets')
const meters = $('#meters')
const readability = $('#readability')
const readabilityList = $('#readability-list')
const selection = $('#selection')

const SAMPLE = [
  'The quick brown fox jumps over the lazy dog. The dog, unimpressed, goes back to sleep.',
  '',
  'Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump! The five boxing wizards jump quickly, and the fox watches the wizards jump.'
].join('\n')

// Words that dominate any frequency count in English without saying anything
// about the text.
const STOPWORDS = new Set(`a an and are as at be but by can did do does for from had has have he her his i if in is it its just no not of on or she so than that the their them then there they this to too very was were will with you your`.split(' '))

// Word matching, carried over from the original tool: latin (with the accented
// and extended ranges), cyrillic and malayalam are counted as runs of letters,
// while CJK and Hangul are counted per character, which is how those scripts
// are normally tallied.
const LATIN = 'a-zA-ZÀ-ÿĀ-ſƀ-ɏɐ-ʯḀ-ỿЀ-ӿԀ-ԯഀ-ൿ'
const CJK = '⺀-⻿⼀-⿟㇀-㇯㈀-㋿㌀-㏿㐀-䶿一-鿿豈-﫿'
const JAPANESE = '぀-ゟ゠-ヿㇰ-ㇿ㆐-㆟'
const KOREAN = 'ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿'

const WORD_PATTERN = new RegExp(`\\d+|[${LATIN}]+|[${CJK}${JAPANESE}${KOREAN}]`, 'g')

const words = text => text.match(WORD_PATTERN) || []

// Average adult silent reading speed for prose, and a comfortable speaking
// pace. Near enough for a hint in both cases.
const WORDS_PER_MINUTE = 225
const SPOKEN_PER_MINUTE = 130

function duration(count, rate) {
  if (!count) return '—'
  const minutes = count / rate
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} sec`
  return `${Math.round(minutes)} min`
}

// The limits people are usually counting towards. Characters in every case —
// none of these are measured in words.
const LIMITS = [
  { label: 'Post', limit: 280, note: 'a post on X or Mastodon' },
  { label: 'SMS', limit: 160, note: 'one GSM-7 message' },
  { label: 'Meta description', limit: 155, note: 'before a search result truncates it' },
  { label: 'Title tag', limit: 60, note: 'before a search result truncates it' }
]

// A rough syllable count: vowel groups, less a silent trailing e, never fewer
// than one. Wrong on plenty of individual words and close enough in aggregate,
// which is all either formula below needs.
function syllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!clean) return 0
  if (clean.length <= 3) return 1

  const groups = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g)

  return groups ? groups.length : 1
}

function stat(label, value) {
  const wrapper = document.createElement('div')

  const dt = document.createElement('dt')
  dt.textContent = label

  const dd = document.createElement('dd')
  dd.textContent = value

  wrapper.append(dt, dd)
  return wrapper
}

function meter(label, used, limit, note) {
  const wrapper = document.createElement('div')
  wrapper.className = 'tool-meter'
  if (used > limit) wrapper.setAttribute('data-over', '')

  const head = document.createElement('div')
  head.className = 'tool-meter-head'

  const name = document.createElement('span')
  name.textContent = label
  name.title = note

  const remaining = document.createElement('span')
  remaining.textContent = used > limit ? `${(used - limit).toLocaleString()} over` : `${(limit - used).toLocaleString()} left`

  head.append(name, remaining)

  // A <progress> rather than a div with a width: the value is an attribute, so
  // nothing here needs an inline style — which the site's Content-Security-
  // Policy forbids outright — and a screen reader gets the number for free.
  const bar = document.createElement('progress')
  bar.className = 'tool-meter-bar'
  bar.max = limit
  bar.value = Math.min(used, limit)

  wrapper.append(head, bar)
  return wrapper
}

function renderTargets(characters) {
  targets.hidden = characters === 0
  if (!characters) return

  meters.replaceChildren(
    ...LIMITS.map(({ label, limit, note }) => meter(`${label} · ${limit}`, characters, limit, note))
  )
}

// Flesch's own bands, named rather than left as a bare score — 62 means
// nothing on its own.
function fleschBand(score) {
  if (score >= 90) return 'very easy — a 5th grader'
  if (score >= 80) return 'easy'
  if (score >= 70) return 'fairly easy'
  if (score >= 60) return 'plain English'
  if (score >= 50) return 'fairly hard'
  if (score >= 30) return 'hard — university level'
  return 'very hard — a graduate degree'
}

function renderReadability(found, sentences) {
  // Below this the numbers swing wildly on a single long word, and neither
  // formula was ever meant for a fragment.
  const enough = found.length >= 30 && sentences > 0
  readability.hidden = !enough
  if (!enough) return

  const totalSyllables = found.reduce((sum, word) => sum + syllables(word), 0)
  const perSentence = found.length / sentences
  const perWord = totalSyllables / found.length

  const ease = 206.835 - 1.015 * perSentence - 84.6 * perWord
  const grade = 0.39 * perSentence + 11.8 * perWord - 15.59

  const rows = [
    ['Flesch reading ease', `${ease.toFixed(0)} — ${fleschBand(ease)}`],
    ['Flesch–Kincaid grade', `${Math.max(0, grade).toFixed(1)} — US school year`],
    ['Words per sentence', perSentence.toFixed(1)],
    ['Syllables per word', perWord.toFixed(2)],
    ['Longest word', found.reduce((longest, word) => (word.length > longest.length ? word : longest), '')]
  ]

  readabilityList.replaceChildren(...rows.flatMap(([label, value]) => {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    return [dt, dd]
  }))
}

// Phrases are counted inside a sentence, never across the full stop between
// two — "the dog. The cat" is not a phrase anyone wrote.
function phrases(text, size) {
  if (size === 1) return words(text).map(word => word.toLowerCase())

  const out = []
  for (const chunk of text.split(/[.!?…。！？\n]+/)) {
    const found = words(chunk).map(word => word.toLowerCase())
    for (let i = 0; i + size <= found.length; i++) {
      out.push(found.slice(i, i + size).join(' '))
    }
  }
  return out
}

function renderFrequency(text, total) {
  frequencyOut.replaceChildren()

  const size = Number(gram.value)
  const counts = new Map()

  for (const phrase of phrases(text, size)) {
    // A phrase made only of stopwords says as little as a single one does; a
    // phrase that merely contains one is usually the point.
    if (skipStopwords.checked && phrase.split(' ').every(word => STOPWORDS.has(word))) continue
    counts.set(phrase, (counts.get(phrase) || 0) + 1)
  }

  const ranked = [...counts.entries()]
    .filter(([, count]) => size === 1 || count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)

  if (!ranked.length) {
    const empty = document.createElement('p')
    empty.className = 'desc'
    empty.textContent = size === 1 ? 'Nothing to count yet.' : 'No phrase of that length repeats.'
    frequencyOut.append(empty)
    return
  }

  // Built with an explicit thead/tbody: appending <tr> straight to a <table>
  // leaves the DOM in a shape no parser would ever produce.
  const table = document.createElement('table')
  table.className = 'tool-table'

  const head = table.createTHead().insertRow()
  for (const label of [size === 1 ? 'Word' : 'Phrase', 'Count', 'Density']) {
    const th = document.createElement('th')
    th.scope = 'col'
    th.textContent = label
    head.append(th)
  }

  const body = table.createTBody()
  for (const [phrase, count] of ranked) {
    const row = body.insertRow()
    // Density is against the word count, so a two-word phrase occurring in a
    // tenth of the text reads as a tenth rather than a twentieth.
    const density = total ? ((count * size) / total) * 100 : 0
    for (const value of [phrase, String(count), `${density.toFixed(1)}%`]) {
      row.insertCell().textContent = value
    }
  }

  frequencyOut.append(table)
}

function run() {
  const text = input.value
  const found = words(text)

  // Sentence-enders, allowing for runs like "?!" and for the last sentence
  // having no terminator at all.
  const sentences = (text.match(/[^.!?…。！？]*[.!?…。！？]+|[^.!?…。！？]+$/g) || [])
    .filter(chunk => chunk.trim()).length

  const paragraphs = text.split(/\n\s*\n/).filter(chunk => chunk.trim()).length
  const characters = [...text].length

  statsOut.replaceChildren(
    stat('Words', found.length.toLocaleString()),
    stat('Characters', characters.toLocaleString()),
    stat('No spaces', [...text.replace(/\s/g, '')].length.toLocaleString()),
    stat('Unique words', new Set(found.map(word => word.toLowerCase())).size.toLocaleString()),
    stat('Sentences', sentences.toLocaleString()),
    stat('Paragraphs', paragraphs.toLocaleString()),
    stat('Lines', text ? text.split('\n').length.toLocaleString() : '0'),
    stat('Size', bytes(encoder.encode(text).length)),
    stat('Reading time', duration(found.length, WORDS_PER_MINUTE)),
    stat('Speaking time', duration(found.length, SPOKEN_PER_MINUTE))
  )

  renderTargets(characters)
  renderReadability(found, sentences)
  renderFrequency(text, found.length)
}

// Counting what is highlighted is the quickest way to answer "is this
// paragraph short enough", and it costs one event listener.
function describeSelection() {
  const { selectionStart, selectionEnd } = input
  if (selectionStart === selectionEnd) {
    selection.textContent = ''
    return
  }

  const picked = input.value.slice(selectionStart, selectionEnd)
  selection.textContent = `${words(picked).length.toLocaleString()} words selected · ${[...picked].length.toLocaleString()} characters`
}

$('#sample').addEventListener('click', () => {
  input.value = SAMPLE
  run()
})

input.addEventListener('select', describeSelection)
input.addEventListener('keyup', describeSelection)
input.addEventListener('mouseup', describeSelection)

dropZone($('#input-pane'), async file => {
  input.value = await readFileText(file)
  status(`Loaded ${file.name}`, 'ok')
  run()
})

filePicker($('#open'), async file => {
  input.value = await readFileText(file)
  status(`Loaded ${file.name}`, 'ok')
  run()
}, 'text/*,.md,.csv,.json,.log')

pasteButton($('#paste'), input, run)
clearButton($('#clear'), input, () => { selection.textContent = ''; run() })
shortcuts({ run, clear: () => { clearField(input); selection.textContent = ''; run() } })

live([input, skipStopwords, gram], run)

remember('devtools.words', [skipStopwords, gram])

run()
