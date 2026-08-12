import type { AiTaskType } from '@youju/ai-core'

export interface Clock {
  readonly now: () => number
}

export interface TimeoutPolicy {
  readonly outerMs: number
  readonly repairMs: number
}

export class GuardLimitError extends Error {
  readonly code = 'provider_rate_limited' as const

  constructor(code: 'provider_rate_limited' = 'provider_rate_limited') {
    super(code)
    this.name = 'GuardLimitError'
  }
}

export interface GuardLease {
  readonly release: () => void
}

interface IpWindow {
  count: number
  expiresAt: number
}

const WINDOW_MS = 60_000
const MAX_IP_ACTIVE = 2
const MAX_PROCESS_ACTIVE = 8
const MAX_IP_REQUESTS = 10

export function getTimeoutPolicy(taskType: 'connection-test' | AiTaskType): TimeoutPolicy {
  if (taskType === 'connection-test') {
    return { outerMs: 10_000, repairMs: 10_000 }
  }
  if (taskType === 'draft_statement') {
    return { outerMs: 120_000, repairMs: 45_000 }
  }
  return { outerMs: 60_000, repairMs: 45_000 }
}

export class RequestGuard {
  private readonly clock: Clock
  private readonly ipWindows = new Map<string, IpWindow>()
  private readonly activeByIp = new Map<string, number>()
  private activeProcess = 0

  constructor(input: { readonly clock?: Clock } = {}) {
    this.clock = input.clock ?? { now: () => Date.now() }
  }

  get trackedIpCount(): number {
    return this.ipWindows.size
  }

  record(ip: string): void {
    this.prune()
    const now = this.clock.now()
    const current = this.ipWindows.get(ip)
    if (current === undefined || current.expiresAt <= now) {
      this.ipWindows.set(ip, { count: 1, expiresAt: now + WINDOW_MS })
      return
    }
    if (current.count >= MAX_IP_REQUESTS) {
      throw new GuardLimitError()
    }
    current.count += 1
  }

  acquire(ip: string): GuardLease {
    this.prune()
    const activeForIp = this.activeByIp.get(ip) ?? 0
    if (activeForIp >= MAX_IP_ACTIVE || this.activeProcess >= MAX_PROCESS_ACTIVE) {
      throw new GuardLimitError()
    }
    this.activeByIp.set(ip, activeForIp + 1)
    this.activeProcess += 1
    let released = false
    return {
      release: () => {
        if (released) {
          return
        }
        released = true
        const remaining = (this.activeByIp.get(ip) ?? 1) - 1
        if (remaining === 0) {
          this.activeByIp.delete(ip)
        } else {
          this.activeByIp.set(ip, remaining)
        }
        this.activeProcess = Math.max(0, this.activeProcess - 1)
      },
    }
  }

  prune(): void {
    const now = this.clock.now()
    for (const [ip, window] of this.ipWindows) {
      if (window.expiresAt <= now) {
        this.ipWindows.delete(ip)
      }
    }
  }
}
