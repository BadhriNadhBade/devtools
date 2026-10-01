// Every digest the hash generator can produce, shared by the main thread and
// the worker so the list, the hex conversion and the HMAC import exist in
// exactly one place.
//
// CRC32 and MD5 are ours; the rest come from Web Crypto, which is exposed in a
// worker on the same terms as on the page. HMAC is only offered for the
// algorithms Web Crypto will key — writing an HMAC-MD5 by hand to round out a
// list would be offering a worse option for the sake of symmetry.

import md5 from './md5.js'
import crc32 from './crc32.js'

export const ALGORITHMS = ['CRC32', 'MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']
export const KEYED = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

// Built here rather than imported from `ui.js`: that module is the page's, and
// a worker has no business loading something that reaches for the document.
const encoder = new TextEncoder()

const toHex = buffer =>
  [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')

async function digest(algorithm, data) {
  if (algorithm === 'CRC32') return crc32(data)
  if (algorithm === 'MD5') return md5(data)
  return toHex(await crypto.subtle.digest(algorithm, data))
}

async function keyedDigest(algorithm, data, secret) {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']
  )
  return toHex(await crypto.subtle.sign('HMAC', material, data))
}

/**
 * The one entry point the worker speaks, so adding an algorithm means adding it
 * to the lists above rather than to a second message protocol. `secret` is null
 * for a plain digest and a string for an HMAC.
 *
 * @param {{ data: Uint8Array, secret: string | null }} request
 */
export async function digestAll({ data, secret }) {
  const algorithms = secret === null ? ALGORITHMS : KEYED

  const values = await Promise.all(algorithms.map(algorithm =>
    secret === null ? digest(algorithm, data) : keyedDigest(algorithm, data, secret)
  ))

  return { algorithms, values }
}
