// Filters the tool index as you type, and keeps pinned tools in a section at
// the top. Everything is already in the DOM, so this only ever hides rows or
// moves them between lists — no fetching, no rebuilding.

import { $, $$ } from './lib/ui.js'

const search = $('#search')
const empty = $('#empty')
const items = $$('.tool-list li')
const categories = $$('[data-category]')
const pinnedList = $('#pinned-list')

const STORE = 'devtools.pinned'

// localStorage is not merely empty in some privacy modes — reading it throws.
// A star that forgets is better than an index that fails to render.
function readPins() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function writePins(slugs) {
  try {
    localStorage.setItem(STORE, JSON.stringify(slugs))
  } catch {
    // Nothing to do: pins just do not survive this session.
  }
}

// Pin order is the order they were pinned in, so the top of the page stays
// where the user put it rather than resorting itself.
let pins = readPins()

const bySlug = new Map(items.map(item => [item.dataset.slug, item]))

// Every row's original list, in the original order, so unpinning can put a row
// back exactly where it came from instead of at the end of its category.
const origin = new Map()
for (const item of items) {
  const list = item.parentNode
  if (!origin.has(list)) origin.set(list, [])
  origin.get(list).push(item)
}

function applyPins() {
  // Drop slugs for tools that no longer exist, so a renamed or deleted tool
  // cannot strand an entry in storage forever.
  pins = pins.filter(slug => bySlug.has(slug))

  // Re-append each category's unpinned rows in their original order. Appending
  // a row that is already in place is a no-op, so this settles the ordering
  // without having to track individual moves.
  for (const [list, rows] of origin) {
    for (const row of rows) {
      if (!pins.includes(row.dataset.slug)) list.append(row)
    }
  }

  for (const slug of pins) pinnedList.append(bySlug.get(slug))

  for (const item of items) {
    const isPinned = pins.includes(item.dataset.slug)
    const button = $('[data-pin]', item)
    const title = $('.tool-pill', item).textContent.trim()

    button.hidden = false
    button.textContent = isPinned ? '★' : '☆'
    button.setAttribute('aria-pressed', String(isPinned))
    button.setAttribute('aria-label', `${isPinned ? 'Unpin' : 'Pin'} ${title}`)
  }
}

function toggle(item) {
  const slug = item.dataset.slug
  pins = pins.includes(slug) ? pins.filter(s => s !== slug) : [...pins, slug]

  writePins(pins)
  applyPins()
  filter()
}

function filter() {
  const query = search.value.trim().toLowerCase()
  const terms = query.split(/\s+/).filter(Boolean)

  let visible = 0

  for (const item of items) {
    const haystack = item.dataset.search
    const matches = terms.every(term => haystack.includes(term))
    item.hidden = !matches
    if (matches) visible++
  }

  // Hide a heading once every tool under it is filtered out. The Pinned
  // section falls out of the same rule: with no rows in it, nothing is
  // visible, so it stays hidden until something is pinned.
  for (const category of categories) {
    category.hidden = !$$('li', category).some(item => !item.hidden)
  }

  empty.hidden = visible > 0
}

for (const item of items) {
  $('[data-pin]', item).addEventListener('click', () => toggle(item))
}

search.addEventListener('input', filter)

// "/" focuses the filter, as long as you are not already typing somewhere.
document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
  // Mid-composition an IME can report "/" for a key that is not one.
  if (event.isComposing) return

  const focused = document.activeElement
  if (focused && ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName)) return
  if (focused && focused.isContentEditable) return

  event.preventDefault()
  search.focus()
  search.select()
})

// Runs unconditionally: it restores whatever the browser preserved in the
// filter across a back navigation, and settles category visibility now that
// pinned rows have moved.
applyPins()
filter()
