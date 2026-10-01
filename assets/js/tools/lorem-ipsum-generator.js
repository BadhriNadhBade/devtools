import {
  $, live, segment, copyButton, download, status,
  remember, prefill, sendTo, shortcuts, bytes, encoder
} from '../lib/ui.js'
import loremIpsum, { blocks } from '../lib/lorem.js'

const output = $('#output')
const count = $('#count')
const startWithLorem = $('#start-with-lorem')
const flavour = $('#flavour')
const rich = $('#rich')
const richField = $('#rich-field')
const size = $('#size')

const readUnits = segment('units', generate)
const readFormat = segment('format', generate)

// Nothing here is user-supplied — every word comes from a fixed list in the
// library — but the output is markup and is about to be pasted into a page, so
// it is escaped anyway rather than relying on that staying true.
const escape = text => text.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]))

function renderHtml(parts) {
  return parts.map(part => {
    if (part.kind === 'heading') return `<h2>${escape(part.text)}</h2>`
    if (part.kind === 'list') return `<ul>\n${part.items.map(item => `  <li>${escape(item)}</li>`).join('\n')}\n</ul>`
    return `<p>${escape(part.text)}</p>`
  }).join('\n\n')
}

function renderMarkdown(parts) {
  return parts.map(part => {
    if (part.kind === 'heading') return `## ${part.text}`
    if (part.kind === 'list') return part.items.map(item => `- ${item}`).join('\n')
    return part.text
  }).join('\n\n')
}

function generate() {
  const units = readUnits()
  const format = readFormat()
  const requested = Math.min(200, Math.max(1, parseInt(count.value, 10) || 1))

  // Headings and lists only have somewhere to go when the output is made of
  // paragraphs and has markup to put them in.
  const structured = format !== 'text' && units === 'paragraphs'
  richField.hidden = !structured

  if (structured) {
    const parts = blocks({
      count: requested,
      startWithLorem: startWithLorem.checked,
      flavour: flavour.value,
      rich: rich.checked
    })

    output.value = format === 'html' ? renderHtml(parts) : renderMarkdown(parts)
  } else {
    output.value = loremIpsum({
      count: requested,
      units,
      startWithLorem: startWithLorem.checked,
      flavour: flavour.value
    })

    // Sentences and words in HTML are still text, just wrapped once, so the
    // format control keeps meaning something rather than silently doing nothing.
    if (format === 'html' && units === 'sentences') output.value = `<p>${escape(output.value)}</p>`
  }

  size.textContent = bytes(encoder.encode(output.value).length)
  status(`${requested} ${requested === 1 ? units.replace(/s$/, '') : units}`, 'ok')
}

$('#generate').addEventListener('click', generate)

$('#download').addEventListener('click', () => {
  if (!output.value) return

  const format = readFormat()
  const extension = format === 'html' ? 'html' : format === 'markdown' ? 'md' : 'txt'
  const type = format === 'html' ? 'text/html' : format === 'markdown' ? 'text/markdown' : 'text/plain'
  download(`lorem.${extension}`, output.value, type)
})

live([count, startWithLorem, flavour, rich], generate)
copyButton($('#copy'), () => output.value)
shortcuts({ run: generate })

// Placeholder text is generated to be measured — against a character limit, or
// against the copy it is standing in for.
sendTo($('#send'), ['word-counter', 'text-diff-checker'], () => output.value, 'lorem generator')

remember('devtools.lorem', [
  count, startWithLorem, flavour, rich,
  $('#units-paragraphs'), $('#units-sentences'), $('#units-words'),
  $('#format-text'), $('#format-html'), $('#format-markdown')
])

// After `remember`, so a link naming a count and a format beats whatever was
// left set last time.
prefill([
  count, startWithLorem, flavour, rich,
  $('#units-paragraphs'), $('#units-sentences'), $('#units-words'),
  $('#format-text'), $('#format-html'), $('#format-markdown')
])

generate()
