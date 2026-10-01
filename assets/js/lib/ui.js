// Shared plumbing for every tool: element lookup, the status line, copy
// buttons, and the segmented-control binding. Kept deliberately small — each
// tool is a handful of lines on top of this.

export const $ = (selector, root = document) => root.querySelector(selector)
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

let statusTimer

// Writes to the single status line the tool layout renders. `kind` drives the
// colour: ok, err, or info.
export function status(message, kind = 'info') {
  const el = $('#status')
  if (!el) return

  el.textContent = message
  clearTimeout(statusTimer)

  if (!message) {
    el.removeAttribute('data-kind')
    return
  }

  el.setAttribute('data-kind', kind)
  statusTimer = setTimeout(() => {
    el.textContent = ''
    el.removeAttribute('data-kind')
  }, 4000)
}

export const clearStatus = () => status('')

// The async clipboard API needs a secure context, so there is a
// selection-based fallback for plain http (a LAN address, say).
export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const scratch = document.createElement('textarea')
  scratch.value = text
  scratch.setAttribute('readonly', '')
  scratch.style.position = 'fixed'
  scratch.style.opacity = '0'
  document.body.append(scratch)
  scratch.select()

  try {
    if (!document.execCommand('copy')) throw new Error('refused')
  } finally {
    scratch.remove()
  }
}

// Wires a button to copy whatever `getText` returns.
export function copyButton(button, getText) {
  if (!button) return

  button.addEventListener('click', async () => {
    const text = getText()
    if (!text) {
      status('Nothing to copy', 'info')
      return
    }

    try {
      await copyText(text)
      status('Copied', 'ok')
    } catch (err) {
      status('Could not copy — select the text and copy manually', 'err')
    }
  })
}

// Offers `text` as a file download. Used by the tools that can produce more
// output than is comfortable to select by hand.
export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename

  // The anchor has to be in the document for the click to register in Firefox,
  // and revoking the URL in the same tick can cancel the download before it
  // starts — so the cleanup waits a moment.
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function debounce(fn, wait = 150) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

// Reads the checked radio out of a `.tool-seg` group and calls back on change.
export function segment(name, onChange) {
  const inputs = $$(`input[name="${name}"]`)
  const read = () => (inputs.find(input => input.checked) || {}).value

  inputs.forEach(input => {
    input.addEventListener('change', () => onChange(read()))
  })

  return read
}

// Runs `fn` whenever any of the given elements changes. Text inputs are
// debounced so typing stays smooth on large inputs; checkboxes, radios and
// selects fire immediately.
export function live(elements, fn, wait = 150) {
  const debounced = debounce(fn, wait)

  elements.filter(Boolean).forEach(el => {
    const isTyped = el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && ['text', 'number', 'search', ''].includes(el.type))

    el.addEventListener(isTyped ? 'input' : 'change', isTyped ? debounced : fn)
  })
}

// Shared instances — both are stateless, so there is no reason for each tool
// to build its own on every keystroke.
export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

// Formats a byte count for the stat rows.
export function bytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Files in. `download` above sends text out; the three below bring it in, by
// drop, by picker or by paste, so a tool only has to say what to do with a
// File once and gets all three routes for free.
// ---------------------------------------------------------------------------

// Big enough for the log file or the archive someone will reasonably drop on a
// page, small enough that the tab survives the mistake of dropping a video.
export const MAX_FILE = 32 * 1024 * 1024

export const readFileText = file => file.text()

export async function readFileBytes(file) {
  return new Uint8Array(await file.arrayBuffer())
}

// Shared guard, so every entry point refuses the same things for the same
// reasons and a tool never sees a file it cannot hold.
function accepted(file) {
  if (!file) return false

  if (file.size > MAX_FILE) {
    status(`That file is ${bytes(file.size)} — the limit here is ${bytes(MAX_FILE)}`, 'err')
    return false
  }

  return true
}

// Drag and drop, plus a file pasted straight out of the clipboard. `handler`
// is called with the File; what to read out of it is the tool's business.
export function dropZone(element, handler) {
  if (!element) return

  let depth = 0

  const settle = () => {
    depth = 0
    element.removeAttribute('data-dropping')
  }

  // A drag that ends anywhere else — dropped on another window, or abandoned
  // with Escape — sends no further events to this element, and a zone left
  // looking like a target forever is worse than one that flickers.
  window.addEventListener('dragend', settle)
  window.addEventListener('drop', settle)

  // dragenter and dragleave fire for every child the pointer crosses, so the
  // state is a depth count rather than a flag — otherwise moving over a nested
  // element reads as having left the zone entirely.
  element.addEventListener('dragenter', event => {
    if (!event.dataTransfer?.types.includes('Files')) return
    depth++
    element.setAttribute('data-dropping', '')
  })

  element.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types.includes('Files')) return
    // Without this the browser navigates to the file instead of handing it over.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  })

  element.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1)
    if (!depth) element.removeAttribute('data-dropping')
  })

  element.addEventListener('drop', event => {
    if (!event.dataTransfer?.files?.length) return
    event.preventDefault()
    settle()

    const file = event.dataTransfer.files[0]
    if (accepted(file)) handler(file)
  })

  element.addEventListener('paste', event => {
    const file = [...(event.clipboardData?.files || [])][0]
    if (!file) return
    event.preventDefault()
    if (accepted(file)) handler(file)
  })
}

// A button that opens the file picker. The input is built here rather than
// sitting in every tool's markup, where it would only ever be hidden.
export function filePicker(button, handler, accept) {
  if (!button) return

  const input = document.createElement('input')
  input.type = 'file'
  input.hidden = true
  if (accept) input.accept = accept
  button.after(input)

  button.addEventListener('click', () => input.click())

  input.addEventListener('change', () => {
    const file = input.files[0]
    if (accepted(file)) handler(file)
    // Cleared so picking the same file twice in a row still fires.
    input.value = ''
  })
}

// ---------------------------------------------------------------------------
// Clipboard in, and the two buttons that pair with `copyButton` above.
// ---------------------------------------------------------------------------

// Wires a button to paste into `target`. Reading the clipboard needs both a
// secure context and the user's permission; when either is missing the button
// says what to press instead of failing silently.
export function pasteButton(button, target, after) {
  if (!button || !target) return

  button.addEventListener('click', async () => {
    if (!navigator.clipboard?.readText || !window.isSecureContext) {
      target.focus()
      status('Paste with the keyboard — this page cannot read the clipboard itself', 'info')
      return
    }

    try {
      target.value = await navigator.clipboard.readText()
      status('Pasted', 'ok')
      after?.()
    } catch (err) {
      target.focus()
      status('The browser would not hand over the clipboard — paste with the keyboard instead', 'err')
    }
  })
}

// Whether the browser keeps an edit history for this element at all. A select,
// a checkbox or a number spinner has nothing for Ctrl+Z to put back.
const undoable = field =>
  field.tagName === 'TEXTAREA' ||
  (field.tagName === 'INPUT' && ['text', 'search', ''].includes(field.type))

// Above this, an undoable edit costs more than it is worth: execCommand walks
// the inserted text to build the history entry, and a dropped log file is
// measured in megabytes. Loading one is also not the edit anybody expects to
// undo — it replaces the whole box rather than part of it.
const UNDO_LIMIT = 128 * 1024

// Replaces a field's contents in a way the browser's own undo can put back.
// Assigning to `value` wipes the element's edit history with it, and a long
// paste lost to a stray Sample click is the same mistake as one lost to a
// stray Escape — so every path that overwrites what someone typed comes
// through here rather than assigning.
export function setField(field, text) {
  if (!field || field.value === text) return

  // Nothing to preserve: an empty field has no history, and a field the
  // browser will not undo cannot be given one.
  if (!undoable(field) || !field.value || text.length > UNDO_LIMIT) {
    field.value = text
    return
  }

  const focused = document.activeElement
  field.focus()
  field.select()

  // execCommand is deprecated and still the only route to an undoable edit.
  // It is also refused outright in some settings, so the plain assignment
  // stays as the fallback. `insertText` with an empty string is a no-op in
  // some engines, which is what `delete` is here for.
  const applied = text
    ? document.execCommand?.('insertText', false, text)
    : document.execCommand?.('delete')

  if (!applied) field.value = text

  if (focused && focused !== field) focused.focus()
}

// Empties a field, undoably, by the same route.
export const clearField = field => setField(field, '')

// Empties one or more fields and hands focus back to the first of them.
export function clearButton(button, targets, after) {
  if (!button) return

  const fields = [].concat(targets).filter(Boolean)

  button.addEventListener('click', () => {
    for (const field of fields) clearField(field)
    fields[0]?.focus()
    clearStatus()
    after?.()
  })
}

// ---------------------------------------------------------------------------
// Storage. Reading localStorage throws outright in some privacy modes, so
// everything that touches it goes through here and treats failure as "empty".
// ---------------------------------------------------------------------------

export function readStore(key, fallback = null) {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : JSON.parse(stored)
  } catch {
    return fallback
  }
}

export function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Nothing to do: the value just does not survive this session.
    return false
  }
}

// Restores the given controls from storage and keeps them there as they
// change, so a reload lands back where you left off. Returns whether anything
// came back, which is how a tool decides between showing its sample and
// showing what the user actually had.
//
// Deliberately opt-in per tool, and never given an input that holds a secret:
// the JWT decoder and the random string generator both forget on purpose.
export function remember(key, elements, onRestore) {
  const fields = elements.filter(Boolean)
  const name = element => element.id || element.name
  const stored = readStore(key)

  let restored = false

  if (stored && typeof stored === 'object') {
    for (const element of fields) {
      const value = stored[name(element)]
      if (value === undefined) continue

      if (element.type === 'checkbox' || element.type === 'radio') element.checked = Boolean(value)
      else element.value = value

      restored = true
    }
  }

  const save = () => {
    const state = {}
    for (const element of fields) {
      state[name(element)] = element.type === 'checkbox' || element.type === 'radio'
        ? element.checked
        : element.value
    }
    writeStore(key, state)
  }

  for (const element of fields) {
    element.addEventListener('input', save)
    element.addEventListener('change', save)
  }

  // A radio group whose stored state predates a new option can come back with
  // nothing selected at all, which leaves every `segment()` reader returning
  // undefined. Falling back to the group's first option is what the markup
  // would have done on a first visit.
  for (const element of fields) {
    if (element.type !== 'radio') continue
    const group = $$(`input[name="${element.name}"]`)
    if (!group.some(option => option.checked)) group[0].checked = true
  }

  if (restored) onRestore?.()
  return restored
}

// ---------------------------------------------------------------------------
// Links in. A tool's state can be named in the query string, so a configured
// tool can be linked to from somewhere else — a note, a README, a message to
// a colleague — and arrive set up rather than empty.
//
// Strictly one way: nothing here ever writes the address bar. Putting what
// somebody pasted into a URL would put it into history and into anything that
// logs a URL, which is the opposite of what every page here promises. A link
// is something you chose to build, not something the tool builds behind you.
// ---------------------------------------------------------------------------

// Reads the given controls out of the query string, by `id` for most things and
// by `name` for a radio group — so `?mode=decode&input=aGk` checks
// `#mode-decode` and fills `#input`. Takes the same list `remember` does, and
// runs after it, because an explicit link should beat the last session.
//
// Returns whether anything was applied. A tool that seeds its own box reads
// the box rather than this, since the browser can also have restored it on a
// back navigation — see the regex tester.
export function prefill(elements) {
  const params = new URLSearchParams(location.search)
  if (![...params.keys()].length) return false

  let applied = false

  for (const element of elements.filter(Boolean)) {
    // A radio is addressed by its group, and only the option whose value was
    // asked for takes the message.
    if (element.type === 'radio') {
      const asked = params.get(element.name)
      if (asked === null) continue
      if (element.value !== asked) continue

      element.checked = true
      applied = true
      continue
    }

    const asked = params.get(element.id || element.name)
    if (asked === null) continue

    if (element.type === 'checkbox') element.checked = asked !== '' && asked !== '0' && asked !== 'false'
    else element.value = asked

    applied = true
  }

  return applied
}

// ---------------------------------------------------------------------------
// Handing a result to another tool. The chains are real — a Base64 payload
// that turns out to be JSON, a substitution that wants sorting, a token whose
// claims want laying out — and without this each one is a trip through the
// clipboard and back via the index page.
//
// What is being carried travels in sessionStorage rather than in the URL, for
// the same reason `prefill` only reads: a query string would put the payload
// into history and the referrer. sessionStorage is scoped to the tab, is read
// exactly once, and is deleted on arrival.
// ---------------------------------------------------------------------------

const HANDOFF = 'devtools.handoff'

// Every tool a result can be sent to, by slug, and what to call it in the menu.
// A tool names the slugs it offers; the names live here so two tools cannot end
// up calling the same destination different things. Every tool's permalink is
// its slug — see the front matter in `_tools` — so the path needs no second
// entry here.
const DESTINATIONS = {
  'base64-encoder-decoder': 'Base64',
  'hash-generator': 'Hash generator',
  'json-yaml-converter': 'Converter',
  'json-yaml-formatter': 'Formatter',
  'list-sorter-randomizer': 'List sorter',
  'regex-tester': 'Regex tester',
  'text-diff-checker': 'Diff checker',
  'url-encoder-decoder': 'URL tools',
  'word-counter': 'Word counter'
}

// Fills a `<select>` with the given destinations and sends `getText()` to
// whichever is chosen. Hidden in the markup and unhidden here, so with
// JavaScript off there is no control offering a journey nothing can make.
export function sendTo(select, slugs, getText, from) {
  if (!select) return

  const offered = slugs.filter(slug => DESTINATIONS[slug])
  if (!offered.length) return

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = 'Send to…'
  select.append(placeholder)

  for (const slug of offered) {
    const option = document.createElement('option')
    option.value = `/${slug}`
    option.textContent = DESTINATIONS[slug]
    select.append(option)
  }

  select.addEventListener('change', () => {
    const path = select.value
    // Back to the placeholder either way, so the control never sits there
    // naming a journey that already happened.
    select.value = ''
    if (!path) return

    const text = getText()
    if (!text) {
      status('Nothing to send yet', 'info')
      return
    }

    if (!carry(HANDOFF, { text, from })) {
      status('This browser will not hold the text long enough to carry it over — copy it instead', 'err')
      return
    }

    location.assign(path)
  })

  // The control lives in a pane head, which is laid out as a row; revealing the
  // label rather than the select keeps the two together.
  const host = select.closest('label') || select
  host.hidden = false
}

// The other end. Takes whatever was sent, puts it in `field` and says where it
// came from. Reading is destructive on purpose: a reload should show the
// document you have been editing since, not re-import the one you arrived with.
export function receive(field, after) {
  if (!field) return false

  let carried
  try {
    carried = JSON.parse(sessionStorage.getItem(HANDOFF))
    sessionStorage.removeItem(HANDOFF)
  } catch {
    return false
  }

  if (!carried || typeof carried.text !== 'string' || !carried.text) return false

  // Assigned rather than put through `setField`: this runs as the page loads, so
  // there is no edit history worth preserving, and `setField` would focus the
  // box to make one — scrolling the page to whichever box took delivery before
  // the reader has seen the top of it.
  field.value = carried.text

  // The recompute comes first and the message second: most tools end a run by
  // clearing the status line, which would wipe this the moment it was written.
  after?.()
  status(carried.from ? `Brought in from the ${carried.from}` : 'Brought in from the last tool', 'ok')

  return true
}

// The storage helpers above are localStorage, which is the right place for a
// setting and the wrong place for a payload: a handoff should not outlive the
// tab it was made in. Same throw-safety, different shelf.
function carry(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Keyboard. Every tool has one thing it does — run, generate, convert — and
// the same two keys should reach it everywhere.
// ---------------------------------------------------------------------------

// Says on the control what the key is, so the two shortcuts below stop being a
// secret. A title rather than visible text: the pane heads are already full,
// and the layout spells both keys out underneath every tool anyway.
function annotate(selector, keys, label) {
  const button = $(selector)
  if (!button) return

  button.setAttribute('aria-keyshortcuts', keys)
  button.title = label
}

// Ctrl/Cmd+Enter runs, Escape clears. Both are bound on the document: the
// point of them is that they work from inside whichever box you are already
// typing in.
export function shortcuts({ run, clear } = {}) {
  // Mac reads Meta as Command, everything else reads Control; `aria-keyshortcuts`
  // wants the key names rather than the symbols.
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  const modifier = mac ? 'Cmd' : 'Ctrl'

  // The primary button where there is one — Generate — and otherwise nothing:
  // a tool that recomputes as you type has no button that Ctrl+Enter presses.
  if (run) annotate('.tool-button', mac ? 'Meta+Enter' : 'Control+Enter', `${modifier}+Enter`)
  if (clear) annotate('#clear', 'Escape', 'Escape')

  document.addEventListener('keydown', event => {
    if (event.isComposing) return

    if (run && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      run()
      return
    }

    if (clear && event.key === 'Escape') {
      // Escape inside a search box already means "empty it" to the browser;
      // taking it over there would clear the whole tool instead.
      if (document.activeElement?.type === 'search') return
      event.preventDefault()
      clear()
    }
  })
}
