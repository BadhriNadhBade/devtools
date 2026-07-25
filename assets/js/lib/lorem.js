// Lorem ipsum generation. Replaces the lorem-ipsum npm package the original
// tool used; the shape of the output (3-7 sentences per paragraph, 4-15 words
// per sentence) matches that package's defaults.

const WORDS = [
  'a', 'ac', 'accumsan', 'ad', 'adipiscing', 'aenean', 'aliquam', 'aliquet',
  'amet', 'ante', 'aptent', 'arcu', 'at', 'auctor', 'augue', 'bibendum',
  'blandit', 'class', 'commodo', 'condimentum', 'congue', 'consectetur',
  'consequat', 'conubia', 'convallis', 'cras', 'cubilia', 'curabitur',
  'curae', 'cursus', 'dapibus', 'diam', 'dictum', 'dictumst', 'dignissim',
  'dis', 'dolor', 'donec', 'dui', 'duis', 'efficitur', 'egestas', 'eget',
  'eleifend', 'elementum', 'elit', 'enim', 'erat', 'eros', 'est', 'et',
  'etiam', 'eu', 'euismod', 'ex', 'facilisi', 'facilisis', 'fames',
  'faucibus', 'felis', 'fermentum', 'feugiat', 'finibus', 'fringilla',
  'fusce', 'gravida', 'habitant', 'habitasse', 'hac', 'hendrerit',
  'himenaeos', 'iaculis', 'id', 'imperdiet', 'in', 'inceptos', 'integer',
  'interdum', 'ipsum', 'justo', 'lacinia', 'lacus', 'laoreet', 'lectus',
  'leo', 'libero', 'ligula', 'litora', 'lobortis', 'lorem', 'luctus',
  'maecenas', 'magna', 'magnis', 'malesuada', 'massa', 'mattis', 'mauris',
  'maximus', 'metus', 'mi', 'molestie', 'mollis', 'montes', 'morbi',
  'nam', 'nascetur', 'natoque', 'nec', 'neque', 'netus', 'nibh', 'nisi',
  'nisl', 'non', 'nostra', 'nulla', 'nullam', 'nunc', 'odio', 'orci',
  'ornare', 'parturient', 'pellentesque', 'penatibus', 'per', 'pharetra',
  'phasellus', 'placerat', 'platea', 'porta', 'porttitor', 'posuere',
  'potenti', 'praesent', 'pretium', 'primis', 'proin', 'pulvinar', 'purus',
  'quam', 'quis', 'quisque', 'rhoncus', 'ridiculus', 'risus', 'rutrum',
  'sagittis', 'sapien', 'scelerisque', 'sed', 'sem', 'semper', 'senectus',
  'sit', 'sociosqu', 'sodales', 'sollicitudin', 'suscipit', 'suspendisse',
  'taciti', 'tellus', 'tempor', 'tempus', 'tincidunt', 'torquent',
  'tortor', 'tristique', 'turpis', 'ullamcorper', 'ultrices', 'ultricies',
  'urna', 'ut', 'varius', 'vehicula', 'vel', 'velit', 'venenatis',
  'vestibulum', 'vitae', 'vivamus', 'viverra', 'volutpat', 'vulputate'
]

const OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit'
const OPENING_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit'.split(' ')

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
const randomWord = () => WORDS[Math.floor(Math.random() * WORDS.length)]

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1)

function sentence() {
  const length = randomInt(4, 15)
  const words = Array.from({ length }, randomWord)

  // A comma somewhere in the middle keeps longer sentences from reading as a
  // flat word list.
  if (length > 8) {
    const comma = randomInt(3, length - 3)
    words[comma] += ','
  }

  return `${capitalize(words.join(' '))}.`
}

const paragraph = () =>
  Array.from({ length: randomInt(3, 7) }, sentence).join(' ')

/**
 * @param {{count: number, units: 'paragraphs'|'sentences'|'words', startWithLorem: boolean}} options
 */
export default function loremIpsum({ count, units, startWithLorem }) {
  const total = Math.max(1, Math.floor(count) || 1)

  if (units === 'words') {
    if (!startWithLorem) return Array.from({ length: total }, randomWord).join(' ')
    if (total <= OPENING_WORDS.length) return OPENING_WORDS.slice(0, total).join(' ')

    const rest = Array.from({ length: total - OPENING_WORDS.length }, randomWord)
    return [...OPENING_WORDS, ...rest].join(' ')
  }

  if (units === 'sentences') {
    const rest = Array.from({ length: startWithLorem ? total - 1 : total }, sentence)
    return startWithLorem ? [`${OPENING}.`, ...rest].join(' ') : rest.join(' ')
  }

  const paragraphs = Array.from({ length: total }, paragraph)
  if (startWithLorem) paragraphs[0] = `${OPENING}. ${paragraphs[0]}`

  return paragraphs.join('\n\n')
}
