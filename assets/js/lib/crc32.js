// CRC-32, the checksum zip files, PNG chunks and gzip headers carry. Not a
// hash in the cryptographic sense and never to be used as one — it is here
// because it is what those formats print, and matching one against the other
// is the whole job.

// The standard reflected polynomial, 0xEDB88320. Built once on first use
// rather than shipped as 256 literals.
let table

function buildTable() {
  table = new Uint32Array(256)

  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
}

/**
 * @param {Uint8Array} data
 * @returns {string} eight lowercase hex digits
 */
export default function crc32(data) {
  if (!table) buildTable()

  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }

  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}
