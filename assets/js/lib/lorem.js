// Placeholder text. Replaces the lorem-ipsum npm package the original tool
// used; the shape of the output (3-7 sentences per paragraph, 4-15 words per
// sentence) matches that package's defaults.
//
// The classic Latin is the default, but the vocabulary is a parameter: filler
// that reads like the copy it is standing in for makes a layout easier to
// judge than filler that reads like nothing at all.

const LOREM = `
a ac accumsan ad adipiscing aenean aliquam aliquet amet ante aptent arcu at
auctor augue bibendum blandit class commodo condimentum congue consectetur
consequat conubia convallis cras cubilia curabitur curae cursus dapibus diam
dictum dictumst dignissim dis dolor donec dui duis efficitur egestas eget
eleifend elementum elit enim erat eros est et etiam eu euismod ex facilisi
facilisis fames faucibus felis fermentum feugiat finibus fringilla fusce
gravida habitant habitasse hac hendrerit himenaeos iaculis id imperdiet in
inceptos integer interdum ipsum justo lacinia lacus laoreet lectus leo libero
ligula litora lobortis lorem luctus maecenas magna magnis malesuada massa
mattis mauris maximus metus mi molestie mollis montes morbi nam nascetur
natoque nec neque netus nibh nisi nisl non nostra nulla nullam nunc odio orci
ornare parturient pellentesque penatibus per pharetra phasellus placerat
platea porta porttitor posuere potenti praesent pretium primis proin pulvinar
purus quam quis quisque rhoncus ridiculus risus rutrum sagittis sapien
scelerisque sed sem semper senectus sit sociosqu sodales sollicitudin suscipit
suspendisse taciti tellus tempor tempus tincidunt torquent tortor tristique
turpis ullamcorper ultrices ultricies urna ut varius vehicula vel velit
venenatis vestibulum vitae vivamus viverra volutpat vulputate
`

// The vocabulary a landing page is actually written in. Useful when the point
// of the filler is to see whether real copy will fit.
const CORPORATE = `
accelerate access agile alignment analytics approach architecture assessment
audience bandwidth baseline benchmark best practice blueprint bottom line brand
budget capability capacity cascade channel client collaborate commitment
compliance conversion core value cross functional culture customer cycle
dashboard deliverable deployment differentiate disruption drive ecosystem
efficiency empower enablement engagement enterprise escalate evaluate execution
expertise footprint framework funnel governance growth headcount holistic
horizon impact initiative innovation insight integration iterate journey
leadership leverage lifecycle margin market metric milestone mindset momentum
narrative objective onboarding operational opportunity optimise outcome
ownership paradigm partnership performance pipeline pivot platform portfolio
positioning priority process productivity proposition quarter reach realign
resource revenue roadmap scalable segment service shareholder solution
stakeholder strategy streamline sustainable synergy target touchpoint traction
transformation transparency trend value vision visibility workflow workstream
`

// And the vocabulary of the documentation that sits next to it.
const TECH = `
adapter allocation anchor api artefact assertion backend bandwidth batch binary
branch buffer bundle cache callback canary capacity certificate checksum client
cluster commit compiler config container context cursor daemon dashboard
database deployment dependency deserialise digest dispatch driver endpoint
entropy environment event exception fallback feature flag fixture fork format
framework gateway handler hash header heap host index ingest instance interface
iterator kernel latency layer library lifecycle listener log lookup manifest
memory middleware migration module mutation namespace network node null object
observer offset origin packet parser partition patch payload permission
pipeline pointer pool port process protocol proxy query queue quota rate limit
record reference registry release replica repository request resolver response
retry rollback route runtime sandbox schema scope script sequence serialise
server session shard signature snapshot socket source stack state stream string
struct subscriber syntax table template thread throughput timeout token trace
transaction transform tree type upstream validate vector version worker
`

const clean = text => text.trim().split(/\s+/)

export const BANKS = {
  lorem: {
    label: 'Lorem ipsum',
    words: clean(LOREM),
    opening: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit'
  },
  corporate: {
    label: 'Corporate',
    words: clean(CORPORATE),
    opening: 'Our strategy accelerates value across every stakeholder touchpoint'
  },
  tech: {
    label: 'Technical',
    words: clean(TECH),
    opening: 'The service resolves each request against a versioned schema'
  }
}

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
const pick = list => list[Math.floor(Math.random() * list.length)]

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1)

function sentence(bank) {
  const length = randomInt(4, 15)
  const words = Array.from({ length }, () => pick(bank.words))

  // A comma somewhere in the middle keeps longer sentences from reading as a
  // flat word list.
  if (length > 8) {
    const comma = randomInt(3, length - 3)
    words[comma] += ','
  }

  return `${capitalize(words.join(' '))}.`
}

const paragraph = bank => Array.from({ length: randomInt(3, 7) }, () => sentence(bank)).join(' ')

// A heading is a handful of words with no full stop; a list item is a short
// sentence without one either. Both exist so a rich layout has something other
// than paragraphs to lay out.
const heading = bank =>
  capitalize(Array.from({ length: randomInt(2, 5) }, () => pick(bank.words)).join(' '))

const item = bank =>
  capitalize(Array.from({ length: randomInt(3, 8) }, () => pick(bank.words)).join(' '))

const bankFor = flavour => BANKS[flavour] || BANKS.lorem

/**
 * @param {{count: number, units: 'paragraphs'|'sentences'|'words', startWithLorem: boolean, flavour?: string}} options
 */
export default function loremIpsum({ count, units, startWithLorem, flavour }) {
  const bank = bankFor(flavour)
  const total = Math.max(1, Math.floor(count) || 1)
  const openingWords = bank.opening.toLowerCase().replace(/,/g, '').split(' ')

  if (units === 'words') {
    if (!startWithLorem) return Array.from({ length: total }, () => pick(bank.words)).join(' ')
    if (total <= openingWords.length) return openingWords.slice(0, total).join(' ')

    const rest = Array.from({ length: total - openingWords.length }, () => pick(bank.words))
    return [...openingWords, ...rest].join(' ')
  }

  if (units === 'sentences') {
    const rest = Array.from({ length: startWithLorem ? total - 1 : total }, () => sentence(bank))
    return startWithLorem ? [`${bank.opening}.`, ...rest].join(' ') : rest.join(' ')
  }

  const paragraphs = Array.from({ length: total }, () => paragraph(bank))
  if (startWithLorem) paragraphs[0] = `${bank.opening}. ${paragraphs[0]}`

  return paragraphs.join('\n\n')
}

/**
 * The same text as a structure rather than a string, so a caller can render it
 * as HTML, as Markdown, or as anything else. Only paragraphs are broken up:
 * asking for sentences or words and getting a heading back would be a surprise.
 *
 * @param {{count: number, startWithLorem: boolean, flavour?: string, rich?: boolean}} options
 * @returns {Array<{kind: 'heading'|'paragraph'|'list', text?: string, items?: string[]}>}
 */
export function blocks({ count, startWithLorem, flavour, rich }) {
  const bank = bankFor(flavour)
  const total = Math.max(1, Math.floor(count) || 1)
  const out = []

  for (let index = 0; index < total; index++) {
    // A heading before every third paragraph and a list after every fourth:
    // often enough to exercise the styles, rare enough that the result still
    // reads as prose.
    if (rich && index % 3 === 0) out.push({ kind: 'heading', text: heading(bank) })

    let text = paragraph(bank)
    if (index === 0 && startWithLorem) text = `${bank.opening}. ${text}`
    out.push({ kind: 'paragraph', text })

    if (rich && index % 4 === 3) {
      out.push({ kind: 'list', items: Array.from({ length: randomInt(3, 5) }, () => item(bank)) })
    }
  }

  return out
}
