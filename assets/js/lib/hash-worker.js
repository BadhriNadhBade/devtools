// Runs the digests off the main thread.
//
// `MAX_FILE` is 32 MB and two of the six algorithms are plain JavaScript, so
// hashing a large file on the page freezes the tab for as long as it takes —
// no typing, no scrolling, not even the status line that would have said why.
// Web Crypto is already async but does its work on a thread of the browser's
// choosing; MD5 and CRC32 are the ones that need moving, and moving the whole
// set keeps one code path instead of two.

import { digestAll } from './digest.js'

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...(await digestAll(data)) })
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message })
  }
}
