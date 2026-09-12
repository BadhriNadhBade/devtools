// The formats a structured document gets written to and read from when it is
// not JSON or YAML. Those two have parsers of their own in this directory;
// everything here is smaller, because the rest of the list is either a flat
// list of pairs or a table.
//
// Every writer takes a parsed value and returns text. Where a format cannot
// express what it was given — CSV has no nesting, .env has no structure — it
// throws with a message that says what to do instead, rather than inventing an
// encoding nobody else would read back.

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isScalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value)

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// A field needs quoting if it contains the delimiter, a quote or a newline;
// quotes inside are doubled. That is the whole of RFC 4180 that matters.
function csvField(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(value) {
  if (!Array.isArray(value)) {
    throw new Error('CSV is a table, so the document has to be an array of rows')
  }

  if (!value.length) return ''

  // An array of arrays is already a table; an array of objects becomes one,
  // with the union of every row's keys as the header so a row missing a field
  // leaves a gap rather than shifting the columns.
  if (value.every(Array.isArray)) {
    return value.map(row => row.map(csvField).join(',')).join('\n') + '\n'
  }

  if (!value.every(isObject)) {
    throw new Error('CSV needs every row to be an object or an array, and this document mixes them')
  }

  const columns = [...new Set(value.flatMap(Object.keys))]

  const rows = value.map(row => columns.map(column => {
    const cell = row[column]
    if (cell !== undefined && !isScalar(cell)) {
      throw new Error(`CSV has no way to hold the nested value at "${column}" — flatten it first`)
    }
    return csvField(cell)
  }).join(','))

  return [columns.map(csvField).join(','), ...rows].join('\n') + '\n'
}

// Splits one CSV line, honouring quotes. Written as a scan rather than a regex
// because a quoted field can contain the delimiter, and a regex that copes
// with that is longer than this.
function csvSplit(line) {
  const fields = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const character = line[i]

    if (quoted) {
      if (character !== '"') { field += character; continue }
      // A doubled quote inside a quoted field is one literal quote.
      if (line[i + 1] === '"') { field += '"'; i++; continue }
      quoted = false
      continue
    }

    if (character === '"') { quoted = true; continue }
    if (character === ',') { fields.push(field); field = ''; continue }
    field += character
  }

  fields.push(field)
  return fields
}

// Numbers and booleans are recognised; everything else stays a string, which
// is the only safe default — a CSV cell has no type of its own.
function csvValue(text) {
  if (text === '') return ''
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) return Number(text)
  return text
}

export function fromCsv(text) {
  // A quoted field can hold a newline, so lines are reassembled by counting
  // quotes rather than split on sight.
  const lines = []
  let current = ''
  let quotes = 0

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    current = current ? `${current}\n${line}` : line
    quotes += (line.match(/"/g) || []).length

    if (quotes % 2 === 0) {
      lines.push(current)
      current = ''
    }
  }

  if (current) lines.push(current)

  const rows = lines.filter(line => line.trim())
  if (!rows.length) return []

  const header = csvSplit(rows[0])

  return rows.slice(1).map(row => {
    const fields = csvSplit(row)
    return Object.fromEntries(header.map((name, index) => [name, csvValue(fields[index] ?? '')]))
  })
}

// ---------------------------------------------------------------------------
// Flat pairs: .env and query strings. Both hold a flat map of strings, so both
// flatten a nested document the same way and say so the same way.
// ---------------------------------------------------------------------------

function flatten(value, prefix = '', out = {}) {
  if (isScalar(value)) {
    out[prefix || 'value'] = value
    return out
  }

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (isScalar(child)) out[path] = child
    else flatten(child, path, out)
  }

  return out
}

export function toEnv(value) {
  const flat = flatten(value)

  return Object.entries(flat).map(([key, held]) => {
    // Upper snake case is the convention every shell and every twelve-factor
    // reader expects, and a dotted path is not a legal variable name.
    const name = key.replace(/[.\s-]+/g, '_').replace(/([a-z\d])([A-Z])/g, '$1_$2').toUpperCase()
    const text = held === null ? '' : String(held)

    return /[\s"'$#=]/.test(text) ? `${name}="${text.replace(/(["\\$`])/g, '\\$1')}"` : `${name}=${text}`
  }).join('\n') + '\n'
}

export function fromEnv(text) {
  const out = {}

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^(?:export\s+)?([\w.]+)\s*=\s*(.*)$/)
    if (!match) continue

    let value = match[2].trim()

    // A quoted value keeps whatever is inside it, including the # that would
    // otherwise start a comment.
    const quoted = value.match(/^"([\s\S]*)"$|^'([\s\S]*)'$/)
    if (quoted) value = quoted[1] !== undefined ? quoted[1].replace(/\\(["\\$`n])/g, (_, c) => (c === 'n' ? '\n' : c)) : quoted[2]
    else value = value.replace(/\s+#.*$/, '').trim()

    out[match[1]] = value
  }

  return out
}

export function toQueryString(value) {
  const search = new URLSearchParams()

  for (const [key, held] of Object.entries(isScalar(value) ? { value } : value)) {
    // An array repeats its key, which is what every server-side parser reads
    // back as a list.
    if (Array.isArray(held)) {
      for (const item of held) search.append(key, item === null ? '' : String(item))
      continue
    }

    if (!isScalar(held)) {
      for (const [path, leaf] of Object.entries(flatten(held, key))) {
        search.append(path, leaf === null ? '' : String(leaf))
      }
      continue
    }

    search.append(key, held === null ? '' : String(held))
  }

  return `${search.toString()}\n`
}

export function fromQueryString(text) {
  const search = new URLSearchParams(text.trim().replace(/^[^?]*\?/, ''))
  const out = {}

  for (const key of new Set(search.keys())) {
    const values = search.getAll(key)
    out[key] = values.length > 1 ? values : values[0]
  }

  return out
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const escapeXml = text => String(text).replace(/[&<>"]/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]))

// XML element names cannot start with a digit or contain most punctuation, and
// a document keyed by anything else still has to come out as something a parser
// will accept.
const elementName = key =>
  /^[A-Za-z_][\w.-]*$/.test(key) ? key : `item key="${escapeXml(key)}"`

function xmlNode(name, value, depth) {
  const pad = '  '.repeat(depth)
  const tag = elementName(name)
  const closing = tag.split(' ')[0]

  if (value === null) return `${pad}<${tag}/>`

  if (Array.isArray(value)) {
    // An array repeats its parent's element rather than growing a wrapper,
    // which is how every hand-written XML document does a list.
    return value.map(item => xmlNode(name, item, depth)).join('\n')
  }

  if (isObject(value)) {
    const children = Object.entries(value).map(([key, child]) => xmlNode(key, child, depth + 1))
    return `${pad}<${tag}>\n${children.join('\n')}\n${pad}</${closing}>`
  }

  return `${pad}<${tag}>${escapeXml(value)}</${closing}>`
}

export function toXml(value) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlNode('root', value, 0)}\n`
}

// ---------------------------------------------------------------------------
// TOML
// ---------------------------------------------------------------------------

const tomlKey = key => (/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key))

function tomlValue(value) {
  if (value === null) throw new Error('TOML has no null — remove the key instead, which is what its absence means')
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)

  if (Array.isArray(value)) return `[${value.map(tomlValue).join(', ')}]`

  // An inline table, for an object nested inside an array — TOML has no
  // section syntax that reaches inside one.
  return `{ ${Object.entries(value).map(([key, held]) => `${tomlKey(key)} = ${tomlValue(held)}`).join(', ')} }`
}

export function toToml(value) {
  if (!isObject(value)) {
    throw new Error('A TOML document is a table, so the top level has to be an object')
  }

  const lines = []

  // Scalars and simple arrays come first, then sections: TOML reads keys as
  // belonging to the most recent [table] header, so a scalar written after one
  // would silently move into it.
  const write = (table, path) => {
    const scalars = []
    const tables = []
    const arrays = []

    for (const [key, held] of Object.entries(table)) {
      if (isObject(held)) tables.push([key, held])
      else if (Array.isArray(held) && held.length && held.every(isObject)) arrays.push([key, held])
      else scalars.push([key, held])
    }

    for (const [key, held] of scalars) lines.push(`${tomlKey(key)} = ${tomlValue(held)}`)

    for (const [key, held] of tables) {
      const name = [...path, tomlKey(key)].join('.')
      lines.push('', `[${name}]`)
      write(held, [...path, tomlKey(key)])
    }

    for (const [key, held] of arrays) {
      const name = [...path, tomlKey(key)].join('.')
      for (const item of held) {
        lines.push('', `[[${name}]]`)
        write(item, [...path, tomlKey(key)])
      }
    }
  }

  write(value, [])

  return lines.join('\n').replace(/^\n/, '') + '\n'
}
