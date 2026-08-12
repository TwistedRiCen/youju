import { describe, expect, it } from 'vitest'
import {
  GuardLimitError,
  RequestGuard,
  getTimeoutPolicy,
  type Clock,
} from '../src/ai/request-guard.js'

function createClock(): { clock: Clock; advance: (milliseconds: number) => void } {
  let now = 1_000
  return {
    clock: { now: () => now },
    advance: (milliseconds) => { now += milliseconds },
  }
}

describe('AI request guard', () => {
  it('enforces two active requests per IP and releases the lease', () => {
    const { clock } = createClock()
    const guard = new RequestGuard({ clock })
    const first = guard.acquire('203.0.113.10')
    const second = guard.acquire('203.0.113.10')

    expect(() => guard.acquire('203.0.113.10')).toThrowError(new GuardLimitError('provider_rate_limited'))
    first.release()
    expect(() => guard.acquire('203.0.113.10')).not.toThrow()
    second.release()
  })

  it('enforces eight active requests process-wide', () => {
    const { clock } = createClock()
    const guard = new RequestGuard({ clock })
    const leases = Array.from({ length: 8 }, (_, index) => guard.acquire(`203.0.113.${index + 1}`))

    expect(() => guard.acquire('203.0.113.99')).toThrowError(new GuardLimitError('provider_rate_limited'))
    for (const lease of leases) lease.release()
  })

  it('allows ten requests per IP per minute and expires old counters without retaining identity data', () => {
    const { clock, advance } = createClock()
    const guard = new RequestGuard({ clock })
    for (let index = 0; index < 10; index += 1) {
      guard.record('203.0.113.10')
    }

    expect(() => guard.record('203.0.113.10')).toThrowError(new GuardLimitError('provider_rate_limited'))
    advance(60_001)
    expect(() => guard.record('203.0.113.10')).not.toThrow()
    expect(guard.trackedIpCount).toBe(1)
    advance(60_001)
    guard.prune()
    expect(guard.trackedIpCount).toBe(0)
  })

  it('uses 10/60/120 second outer classes and caps repair at 45 seconds', () => {
    expect(getTimeoutPolicy('connection-test')).toEqual({ outerMs: 10_000, repairMs: 10_000 })
    expect(getTimeoutPolicy('classify_evidence')).toEqual({ outerMs: 60_000, repairMs: 45_000 })
    expect(getTimeoutPolicy('extract_facts')).toEqual({ outerMs: 60_000, repairMs: 45_000 })
    expect(getTimeoutPolicy('build_timeline')).toEqual({ outerMs: 60_000, repairMs: 45_000 })
    expect(getTimeoutPolicy('draft_statement')).toEqual({ outerMs: 120_000, repairMs: 45_000 })
  })
})
