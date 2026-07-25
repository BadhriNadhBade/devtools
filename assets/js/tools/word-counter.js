import { $, live, bytes, encoder } from '../lib/ui.js'

const input = $('#input')
const statsOut = $('#stats')
const frequencyOut = $('#frequency')
const skipStopwords = $('#stopwords')

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
const CJK = '⺀-⻿⼀-⿟㇀-㇯㈀-㋿㌀-㏿㐀-䶿一-鿿豈-﫿'
const JAPANESE = '぀-ゟ゠-ヿㇰ-ㇿ㆐-㆟'
const KOREAN = 'ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿'

const WORD_PATTERN = new RegExp(`\\d+|[${LATIN}]+|[${CJK}${JAPANESE}${KOREAN}]`, 'g')

const words = text => text.match(WORD_PATTERN) || []

// Average adult silent reading speed for prose, near enough for a hint.
const WORDS_PER_MINUTE = 225

function readingTime(count) {
  if (!count) return '—'
  const minutes = count / WORDS_PER_MINUTE
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} sec`
  return `${Math.round(minutes)} min`
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

function renderFrequency(found) {
  frequencyOut.replaceChildren()

  const counts = new Map()
  for (const word of found) {
    const lower = word.toLowerCase()
    if (skipStopwords.checked && STOPWORDS.has(lower)) continue
    counts.set(lower, (counts.get(lower) || 0) + 1)
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)

  if (!ranked.length) {
    const empty = document.createElement('p')
    empty.className = 'desc'
    empty.textContent = 'Nothing to count yet.'
    frequencyOut.append(empty)
    return
  }

  // Built with an explicit thead/tbody: appending <tr> straight to a <table>
  // leaves the DOM in a shape no parser would ever produce.
  const table = document.createElement('table')
  table.className = 'tool-table'

  const head = table.createTHead().insertRow()
  for (const label of ['Word', 'Count']) {
    const th = document.createElement('th')
    th.scope = 'col'
    th.textContent = label
    head.append(th)
  }

  const body = table.createTBody()
  for (const [word, count] of ranked) {
    const row = body.insertRow()
    for (const value of [word, String(count)]) {
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

  statsOut.replaceChildren(
    stat('Words', found.length.toLocaleString()),
    stat('Characters', [...text].length.toLocaleString()),
    stat('No spaces', [...text.replace(/\s/g, '')].length.toLocaleString()),
    stat('Unique words', new Set(found.map(word => word.toLowerCase())).size.toLocaleString()),
    stat('Sentences', sentences.toLocaleString()),
    stat('Paragraphs', paragraphs.toLocaleString()),
    stat('Lines', text ? text.split('\n').length.toLocaleString() : '0'),
    stat('Size', bytes(encoder.encode(text).length)),
    stat('Reading time', readingTime(found.length))
  )

  renderFrequency(found)
}

$('#sample').addEventListener('click', () => {
  input.value = SAMPLE
  run()
})

$('#clear').addEventListener('click', () => {
  input.value = ''
  input.focus()
  run()
})

live([input, skipStopwords], run)

run()
