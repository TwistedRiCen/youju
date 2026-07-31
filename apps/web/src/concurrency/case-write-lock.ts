import type { UuidV4 } from '@youju/domain'

export interface CaseWriteLease {
  readonly mode: 'writer' | 'reader'
  release(): Promise<void>
}

export interface CaseWriteLock {
  acquire(caseId: UuidV4): Promise<CaseWriteLease>
}

const LOCK_CHANNEL_NAME = 'youju:case-locks'

interface LockNotification {
  readonly caseId: string
  readonly type: 'writer_acquired' | 'writer_released'
}

function lockName(caseId: UuidV4): string {
  return `youju:case:${caseId}`
}

export function createCaseWriteLock(): CaseWriteLock {
  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(LOCK_CHANNEL_NAME)
      : null

  const notify = (caseId: UuidV4, type: LockNotification['type']): void => {
    const notification: LockNotification = { caseId, type }
    channel?.postMessage(notification)
  }

  return {
    acquire(caseId: UuidV4): Promise<CaseWriteLease> {
      const locks = (navigator as { locks?: LockManager }).locks
      if (locks === undefined || typeof locks.request !== 'function') {
        return Promise.resolve({ mode: 'writer', release: async () => {} })
      }

      return new Promise<CaseWriteLease>((resolve) => {
        void locks.request(lockName(caseId), { ifAvailable: true }, (lock) => {
          if (lock === null) {
            resolve({ mode: 'reader', release: async () => {} })
            return undefined
          }

          let releaseResolve: () => void = () => {}
          const released = new Promise<void>((resolveRelease) => {
            releaseResolve = resolveRelease
          })
          notify(caseId, 'writer_acquired')
          resolve({
            mode: 'writer',
            release: async () => {
              releaseResolve()
              notify(caseId, 'writer_released')
            },
          })
          return released
        })
      })
    },
  }
}
