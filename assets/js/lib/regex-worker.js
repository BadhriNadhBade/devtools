// Runs the matching loop off the main thread.
//
// A pattern like /(a+)+b/ against a long run of a's backtracks for effectively
// forever, and there is no way to interrupt a running regex from inside the
// same thread — no callback fires, no timer runs. Terminating the thread is
// the only way back, so matching happens here and the page gives each run a
// deadline.

import { run } from './regex-match.js'

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...run(data) })
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message })
  }
}
