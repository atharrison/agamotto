import { encodeSseEvent, tryEnqueueSse } from '../src/lib/sse'

describe('encodeSseEvent', () => {
  it('formats event and JSON data lines', () => {
    expect(encodeSseEvent('error', { error: 'nope' })).toBe(
      'event: error\ndata: {"error":"nope"}\n\n'
    )
  })
})

describe('tryEnqueueSse', () => {
  it('returns true when enqueue succeeds', () => {
    const enqueue = jest.fn()
    const chunk = new Uint8Array([1])
    expect(tryEnqueueSse(enqueue, chunk)).toBe(true)
    expect(enqueue).toHaveBeenCalledWith(chunk)
  })

  it('returns false when the controller is already closed', () => {
    const enqueue = jest.fn(() => {
      throw new TypeError('Invalid state: Controller is already closed')
    })
    expect(tryEnqueueSse(enqueue, new Uint8Array([1]))).toBe(false)
  })
})
