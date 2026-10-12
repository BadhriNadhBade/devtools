// Runs a user-supplied regex filter off the main thread.
//
// A pattern like /(a+)+b/ against a long line backtracks forever, and there is
// no way to interrupt a running regex from the same thread. The caller gives
// each request a deadline and terminates this worker if it is not met.

self.onmessage = ({ data }) => {
  const { id, pattern, flags, lines, invert } = data

  try {
    const compiled = new RegExp(pattern, flags)
    const indices = []

    for (let i = 0; i < lines.length; i++) {
      if (compiled.test(lines[i]) !== invert) indices.push(i)
    }

    self.postMessage({ id, indices })
  } catch (error) {
    self.postMessage({ id, error: error.message })
  }
}
