// Filters the tool index as you type. Everything is already in the DOM, so
// this is only ever hiding rows — no fetching, no rebuilding.

import { $, $$ } from './lib/ui.js'

const search = $('#search')
const empty = $('#empty')
const items = $$('.tool-list li')
const categories = $$('[data-category]')

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

  // Hide a heading once every tool under it is filtered out.
  for (const category of categories) {
    category.hidden = !$$('li', category).some(item => !item.hidden)
  }

  empty.hidden = visible > 0
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

// Restores whatever was typed if the browser preserved the field across a
// back navigation.
if (search.value) filter()
