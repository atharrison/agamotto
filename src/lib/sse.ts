/** SSE helpers. Pure — no I/O. */

/** Encode one SSE event block. */
export function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Enqueue an SSE chunk. Returns false when the client already closed the
 * stream so callers must not treat a disconnect as a pipeline failure.
 */
export function tryEnqueueSse(
  enqueue: (chunk: Uint8Array) => void,
  chunk: Uint8Array
): boolean {
  try {
    enqueue(chunk)
    return true
  } catch {
    return false
  }
}
