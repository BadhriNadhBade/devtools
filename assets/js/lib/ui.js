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
