import { ref } from 'vue'
import type { Ref } from 'vue'

export type PwaStatus = 'idle' | 'offline_ready' | 'update_available' | 'updating'

export interface PwaUpdateController {
  readonly status: Readonly<Ref<PwaStatus>>
  readonly online: Readonly<Ref<boolean>>
  confirmUpdate(): Promise<void>
  dismissUpdate(): void
  dispose(): void
}

export interface RegisterSwOptions {
  immediate?: boolean
  onOfflineReady?: () => void
  onNeedRefresh?: () => void
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

export type RegisterSw = (options: RegisterSwOptions) => (reloadPage?: boolean) => Promise<void>

export interface PwaUpdateControllerOptions {
  readonly reload?: () => void
}

let busyCounter = 0
const idleWaiters: Array<(idle: boolean) => void> = []

const ACTIVATION_TIMEOUT_MS = 10_000

/**
 * Marks one user-visible local operation (import, export, AI task or a
 * pending local write) as active. The prompted update waits until the
 * counter returns to zero before activating a new service worker.
 */
export function beginActivity(): void {
  busyCounter += 1
}

export function endActivity(): void {
  busyCounter = Math.max(0, busyCounter - 1)
  if (busyCounter === 0 && idleWaiters.length > 0) {
    for (const resolve of idleWaiters.splice(0)) {
      resolve(true)
    }
  }
}

export function activeActivityCount(): number {
  return busyCounter
}

export function createPwaUpdateController(
  register: RegisterSw,
  options: PwaUpdateControllerOptions = {},
): PwaUpdateController {
  const reload = options.reload ?? ((): void => window.location.reload())
  const status = ref<PwaStatus>('idle')
  const online = ref(typeof navigator !== 'undefined' && navigator.onLine)
  let readyReached = false
  let disposed = false
  let registration: ServiceWorkerRegistration | null = null
  let waitingWaiterFinish: ((activated: boolean) => void) | null = null

  const onOffline = (): void => {
    online.value = false
  }
  const onOnline = (): void => {
    online.value = true
  }
  window.addEventListener('offline', onOffline)
  window.addEventListener('online', onOnline)

  const updateSW = register({
    immediate: true,
    onOfflineReady: () => {
      if (disposed) return
      readyReached = true
      status.value = 'offline_ready'
    },
    onNeedRefresh: () => {
      if (disposed || status.value === 'updating') return
      status.value = 'update_available'
    },
    onRegistered: (registered) => {
      if (disposed) return
      registration = registered ?? null
    },
    onRegisterError: () => {
      // Registration failed or is unsupported; status stays idle and the
      // banner keeps silent rather than claiming offline readiness.
    },
  })

  async function confirmUpdate(): Promise<void> {
    if (status.value !== 'update_available') return
    status.value = 'updating'
    if (busyCounter > 0) {
      const idle = await waitForIdle()
      if (disposed) return
      if (!idle) {
        // Active operations did not settle in time; return to the prompt
        // so the user can retry instead of hanging in the updating state.
        status.value = 'update_available'
        return
      }
    }
    if (disposed) return
    if (busyCounter > 0) {
      // A new operation started right after the idle wait resolved.
      status.value = 'update_available'
      return
    }
    try {
      await updateSW()
    } catch {
      // skipWaiting could not be delivered; keep the prompt available so
      // the user can retry instead of hanging in the updating state.
      if (disposed) return
      status.value = 'update_available'
      return
    }
    if (disposed) return
    const waiting = registration?.waiting ?? null
    if (waiting !== null) {
      const activated = await waitForWaitingWorker(waiting)
      if (disposed || !activated) return
    }
    if (disposed) return
    reload()
  }

  function waitForIdle(): Promise<boolean> {
    if (busyCounter === 0) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (idle: boolean): void => {
        if (settled) return
        settled = true
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
        const index = idleWaiters.indexOf(finish)
        if (index !== -1) {
          idleWaiters.splice(index, 1)
        }
        resolve(idle)
      }
      idleWaiters.push(finish)
      timer = setTimeout(() => finish(false), ACTIVATION_TIMEOUT_MS)
    })
  }

  function waitForWaitingWorker(waiting: ServiceWorker): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (activated: boolean): void => {
        if (settled) return
        settled = true
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
        waiting.removeEventListener('statechange', check)
        if (waitingWaiterFinish === finish) {
          waitingWaiterFinish = null
        }
        resolve(activated)
      }
      const check = (): void => {
        if (waiting.state === 'activated' || waiting.state === 'redundant') {
          finish(true)
        } else if (disposed) {
          finish(false)
        }
      }
      waiting.addEventListener('statechange', check)
      waitingWaiterFinish = finish
      timer = setTimeout(() => {
        // skipWaiting did not activate the worker in time (for example a
        // competing tab); fall back to the prompt so the user can retry
        // instead of hanging in the updating state.
        if (!disposed) {
          status.value = 'update_available'
        }
        finish(false)
      }, ACTIVATION_TIMEOUT_MS)
      check()
    })
  }

  function dismissUpdate(): void {
    if (status.value !== 'update_available') return
    status.value = readyReached ? 'offline_ready' : 'idle'
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('online', onOnline)
    for (const resolve of idleWaiters.splice(0)) {
      resolve(false)
    }
    waitingWaiterFinish?.(false)
  }

  return { status, online, confirmUpdate, dismissUpdate, dispose }
}

let controller: PwaUpdateController | null = null

export function startPwaUpdateController(register: RegisterSw): PwaUpdateController {
  controller ??= createPwaUpdateController(register)
  return controller
}

export function getPwaUpdateController(): PwaUpdateController | null {
  return controller
}
