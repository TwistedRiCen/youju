import { ref } from 'vue'
import type { Ref } from 'vue'
import { CaseRepositoryError } from '../storage/index.js'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'failed'

export interface AutosaveController<T> {
  readonly status: Readonly<Ref<AutosaveStatus>>
  schedule(value: T): void
  flush(): Promise<void>
  dispose(): Promise<void>
}

export interface AutosaveOptions<T> {
  readonly persist: (value: T) => Promise<void>
  readonly debounceMs?: number
  readonly isConflict?: (error: unknown) => boolean
  readonly onConflict?: () => void
}

export function createAutosave<T>(options: AutosaveOptions<T>): AutosaveController<T> {
  const status = ref<AutosaveStatus>('idle')
  const debounceMs = options.debounceMs ?? 400
  const isConflict =
    options.isConflict ??
    ((error: unknown): boolean =>
      error instanceof CaseRepositoryError && error.code === 'concurrent_edit_conflict')

  let pendingValue: T | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let writeChain: Promise<void> = Promise.resolve()
  let blocked = false
  let disposed = false

  const runPersist = async (): Promise<void> => {
    if (pendingValue === null) {
      return
    }
    const value = pendingValue
    pendingValue = null
    status.value = 'saving'

    try {
      await options.persist(value)
      if (!disposed && pendingValue === null) {
        status.value = 'saved'
      }
    } catch (error) {
      pendingValue = value
      if (isConflict(error)) {
        blocked = true
        status.value = 'conflict'
        options.onConflict?.()
      } else {
        status.value = 'failed'
      }
    }
  }

  const enqueuePersist = (): void => {
    writeChain = writeChain.then(runPersist)
  }

  return {
    status,
    schedule(value: T): void {
      if (disposed || blocked) {
        return
      }
      pendingValue = value
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = null
        enqueuePersist()
      }, debounceMs)
    },
    async flush(): Promise<void> {
      if (disposed || blocked) {
        return
      }
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (pendingValue !== null) {
        status.value = 'saving'
      }
      enqueuePersist()
      await writeChain
    },
    async dispose(): Promise<void> {
      if (disposed) {
        return
      }
      disposed = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (!blocked && pendingValue !== null) {
        enqueuePersist()
        await writeChain
      }
    },
  }
}
