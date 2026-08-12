import { computed, inject, provide } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'

export interface CaseWriteAccess {
  readonly mode: Readonly<Ref<'writer' | 'reader'>>
  readonly canWrite: ComputedRef<boolean>
}

const CASE_WRITE_ACCESS_KEY: InjectionKey<CaseWriteAccess> = Symbol('case-write-access')

export function provideCaseWriteAccess(
  mode: Readonly<Ref<'writer' | 'reader'>>,
): void {
  provide(CASE_WRITE_ACCESS_KEY, {
    mode,
    canWrite: computed(() => mode.value === 'writer'),
  })
}

export function useCaseWriteAccess(): CaseWriteAccess {
  const access = inject(CASE_WRITE_ACCESS_KEY)
  if (access === undefined) {
    throw new Error('case_write_access_unavailable')
  }
  return access
}
