import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TURNS,
  DEFAULT_TIMEOUT_MS,
  harnessLimits,
} from '../src/lib/harness-limits'

describe('harnessLimits', () => {
  it('returns documented defaults when env vars are missing', () => {
    expect(harnessLimits({})).toEqual({
      maxTurns: DEFAULT_MAX_TURNS,
      maxTokens: DEFAULT_MAX_TOKENS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
  })

  it('returns documented defaults for blank strings', () => {
    expect(
      harnessLimits({ MAX_TURNS: '  ', MAX_TOKENS: '', TIMEOUT_MS: '\t' })
    ).toEqual({
      maxTurns: DEFAULT_MAX_TURNS,
      maxTokens: DEFAULT_MAX_TOKENS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
  })

  it('parses positive integers from env', () => {
    expect(
      harnessLimits({
        MAX_TURNS: '30',
        MAX_TOKENS: '400000',
        TIMEOUT_MS: '600000',
      })
    ).toEqual({
      maxTurns: 30,
      maxTokens: 400000,
      timeoutMs: 600000,
    })
  })

  it('falls back when values are non-integer, zero, or negative', () => {
    expect(
      harnessLimits({
        MAX_TURNS: '1.5',
        MAX_TOKENS: '0',
        TIMEOUT_MS: '-1',
      })
    ).toEqual({
      maxTurns: DEFAULT_MAX_TURNS,
      maxTokens: DEFAULT_MAX_TOKENS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
  })

  it('falls back when values are not numeric', () => {
    expect(
      harnessLimits({
        MAX_TURNS: 'abc',
        MAX_TOKENS: '200k',
        TIMEOUT_MS: 'NaN',
      })
    ).toEqual({
      maxTurns: DEFAULT_MAX_TURNS,
      maxTokens: DEFAULT_MAX_TOKENS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
  })

  it('reads process.env when no bag is passed', () => {
    const origTurns = process.env.MAX_TURNS
    const origTokens = process.env.MAX_TOKENS
    const origTimeout = process.env.TIMEOUT_MS
    process.env.MAX_TURNS = '12'
    process.env.MAX_TOKENS = '180000'
    process.env.TIMEOUT_MS = '90000'
    try {
      expect(harnessLimits()).toEqual({
        maxTurns: 12,
        maxTokens: 180000,
        timeoutMs: 90000,
      })
    } finally {
      if (origTurns === undefined) delete process.env.MAX_TURNS
      else process.env.MAX_TURNS = origTurns
      if (origTokens === undefined) delete process.env.MAX_TOKENS
      else process.env.MAX_TOKENS = origTokens
      if (origTimeout === undefined) delete process.env.TIMEOUT_MS
      else process.env.TIMEOUT_MS = origTimeout
    }
  })
})
