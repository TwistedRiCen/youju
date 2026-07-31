import { ref } from 'vue'
import type { Ref } from 'vue'
import type { UuidV4 } from '@youju/domain'
import { createCaseWriteLock } from '../concurrency/case-write-lock.js'
import type { CaseWriteLease } from '../concurrency/case-write-lock.js'

export interface UseCaseWriteLockResult {
  readonly mode: Readonly<Ref<'writer' | 'reader'>>
  readonly lease: Readonly<Ref<CaseWriteLease | null>>
  readonly acquire: (caseId: UuidV4) => Promise<void>
  readonly release: () => Promise<void>
}

export function useCaseWriteLock(): UseCaseWriteLockResult {
  const lock = createCaseWriteLock()
  const mode = ref<'writer' | 'reader'>('reader')
  const lease = ref<CaseWriteLease | null>(null)

  async function acquire(caseId: UuidV4): Promise<void> {
    if (lease.value !== null) {
      await lease.value.release()
      lease.value = null
    }
    const nextLease = await lock.acquire(caseId)
    lease.value = nextLease
    mode.value = nextLease.mode
  }

  async function release(): Promise<void> {
    if (lease.value !== null) {
      await lease.value.release()
      lease.value = null
    }
    mode.value = 'reader'
  }

  return { mode, lease, acquire, release }
}
