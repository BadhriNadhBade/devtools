import { $, live, segment, copyButton, clearStatus } from '../lib/ui.js'

const input = $('#input')
const output = $('#output')
const inputCount = $('#input-count')
const outputCount = $('#output-count')

const unique = $('#unique')
const trim = $('#trim')
const dropEmpty = $('#drop-empty')
const ignoreCase = $('#ignore-case')
const natural = $('#natural')

const SAMPLE = [
  'banana', 'Apple', 'cherry', 'apple', 'item 10', 'item 9', 'item 100',
  'date', '', 'elderberry', 'Banana', 'fig'
].join('\n')

const readOrder = segment('order', run)

// Fisher-Yates, drawing each index from the cryptographic source with
// rejection sampling so every permutation stays equally likely.
function shuffle(items) {
  const shuffled = [...items]
  const buffer = new Uint32Array(1)

  for (let i = shuffled.length - 1; i > 0; i--) {
    const bound = i + 1
    const ceiling = Math.floor(4294967296 / bound) * bound

    let value
    do {
      crypto.getRandomValues(buffer)
      value = buffer[0]
    } while (value >= ceiling)

    const j = value % bound
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

// "".split("\n") is [""], so an untouched box would otherwise report one line.
const countLabel = count => `${count} line${count === 1 ? '' : 's'}`

function run() {
  let lines = input.value ? input.value.split('\n') : []
  inputCount.textContent = countLabel(lines.length)

  if (trim.checked) lines = lines.map(line => line.trim())
  if (dropEmpty.checked) lines = lines.filter(line => line.trim())

  if (unique.checked) {
    const seen = new Set()
    lines = lines.filter(line => {
      const key = ignoreCase.checked ? line.toLowerCase() : line
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const collator = new Intl.Collator(undefined, {
    numeric: natural.checked,
    sensitivity: ignoreCase.checked ? 'base' : 'variant'
  })

  switch (readOrder()) {
    case 'ascending':
      lines = [...lines].sort(collator.compare)
      break
    case 'descending':
      lines = [...lines].sort((a, b) => collator.compare(b, a))
      break
    case 'length':
      lines = [...lines].sort((a, b) => a.length - b.length || collator.compare(a, b))
      break
    case 'reversed':
      lines = [...lines].reverse()
      break
    case 'random':
      lines = shuffle(lines)
      break
  }

  output.value = lines.join('\n')
  outputCount.textContent = countLabel(lines.length)
  clearStatus()
}

$('#sample').addEventListener('click', () => {
  input.value = SAMPLE
  run()
})

live([input, unique, trim, dropEmpty, ignoreCase, natural], run)
copyButton($('#copy'), () => output.value)

run()
