import { $, live, segment, copyButton, status } from '../lib/ui.js'
import loremIpsum from '../lib/lorem.js'

const output = $('#output')
const count = $('#count')
const startWithLorem = $('#start-with-lorem')

const readUnits = segment('units', generate)

function generate() {
  const units = readUnits()
  const requested = Math.min(200, Math.max(1, parseInt(count.value, 10) || 1))

  output.value = loremIpsum({
    count: requested,
    units,
    startWithLorem: startWithLorem.checked
  })

  status(`${requested} ${requested === 1 ? units.replace(/s$/, '') : units}`, 'ok')
}

$('#generate').addEventListener('click', generate)
live([count, startWithLorem], generate)
copyButton($('#copy'), () => output.value)

generate()
