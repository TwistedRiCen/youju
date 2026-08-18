import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activeActivityCount,
  beginActivity,
  createPwaUpdateController,
  endActivity,
  type PwaUpdateControllerOptions,
  type RegisterSwOptions,
} from '../src/pwa/update-controller.js'

function makeRegister(): {
  options: { current: RegisterSwOptions | undefined }
  updateSW: ReturnType<typeof vi.fn>
  register: (options: RegisterSwOptions) => (reloadPage?: boolean) => Promise<void>
} {
  const options: { current: RegisterSwOptions | undefined } = { current: undefined }
  const updateSW = vi.fn<(reloadPage?: boolean) => Promise<void>>().mockResolvedValue(undefined)
  const register = (received: RegisterSwOptions) => {
    options.current = received
    return updateSW
  }
  return { options, updateSW, register }
}

function makeController(
  register: (options: RegisterSwOptions) => (reloadPage?: boolean) => Promise<void>,
  options: PwaUpdateControllerOptions = { reload: vi.fn() },
) {
  const controller = createPwaUpdateController(register, options)
  return { controller, reload: options.reload ?? vi.fn() }
}

function makeWaitingWorker(updateSW: ReturnType<typeof vi.fn>): {
  waiting: {
    state: ServiceWorkerState
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
  }
} {
  let fireStateChange: (() => void) | undefined
  const waiting = {
    state: 'waiting' as ServiceWorkerState,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      fireStateChange = listener
    }),
    removeEventListener: vi.fn(),
  }
  updateSW.mockImplementation(async () => {
    waiting.state = 'activated'
    fireStateChange?.()
  })
  return { waiting }
}

describe('pwa update controller', () => {
  afterEach(() => {
    try {
      expect(activeActivityCount()).toBe(0)
    } finally {
      endActivity()
      endActivity()
      endActivity()
    }
  })

  it('starts idle and reflects navigator.onLine', () => {
    const { register } = makeRegister()
    const { controller } = makeController(register)
    expect(controller.status.value).toBe('idle')
    expect(controller.online.value).toBe(true)
    controller.dispose()
  })

  it('reaches offline_ready when the service worker is installed', () => {
    const { options, register } = makeRegister()
    const { controller } = makeController(register)
    options.current?.onOfflineReady?.()
    expect(controller.status.value).toBe('offline_ready')
    controller.dispose()
  })

  it('exposes update_available without reloading when a new worker waits', () => {
    const { options, register, updateSW } = makeRegister()
    const { controller, reload } = makeController(register)
    options.current?.onNeedRefresh?.()
    expect(controller.status.value).toBe('update_available')
    expect(updateSW).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('does not confirm when no update is available', async () => {
    const { register, updateSW } = makeRegister()
    const { controller, reload } = makeController(register)
    await controller.confirmUpdate()
    expect(updateSW).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('waits for active operations before confirming an update', async () => {
    const { options, register, updateSW } = makeRegister()
    const { controller, reload } = makeController(register)
    options.current?.onOfflineReady?.()
    options.current?.onNeedRefresh?.()

    beginActivity()
    const confirm = controller.confirmUpdate()
    expect(controller.status.value).toBe('updating')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(updateSW).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()

    endActivity()
    await confirm
    expect(updateSW).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('returns to update_available when a new activity starts after the idle wait', async () => {
    const { options, register, updateSW } = makeRegister()
    const { controller } = makeController(register)
    options.current?.onNeedRefresh?.()

    beginActivity()
    const confirm = controller.confirmUpdate()
    endActivity()
    beginActivity()
    await confirm
    expect(controller.status.value).toBe('update_available')
    expect(updateSW).not.toHaveBeenCalled()
    endActivity()
    controller.dispose()
  })

  it('falls back to update_available when active operations never settle', async () => {
    vi.useFakeTimers()
    try {
      const { options, register, updateSW } = makeRegister()
      const { controller, reload } = makeController(register)
      options.current?.onNeedRefresh?.()

      beginActivity()
      const confirm = controller.confirmUpdate()
      await vi.advanceTimersByTimeAsync(10_000)
      await confirm
      expect(controller.status.value).toBe('update_available')
      expect(updateSW).not.toHaveBeenCalled()
      expect(reload).not.toHaveBeenCalled()
      endActivity()
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('deduplicates confirmations while an update is already pending', async () => {
    const { options, register, updateSW } = makeRegister()
    const { controller, reload } = makeController(register)
    options.current?.onNeedRefresh?.()

    beginActivity()
    const first = controller.confirmUpdate()
    const second = controller.confirmUpdate()
    endActivity()
    await Promise.all([first, second])

    expect(updateSW).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('returns to update_available when skipWaiting fails', async () => {
    const { options, register, updateSW } = makeRegister()
    updateSW.mockRejectedValue(new Error('registration lost'))
    const { controller, reload } = makeController(register)
    options.current?.onNeedRefresh?.()

    await controller.confirmUpdate()
    expect(controller.status.value).toBe('update_available')
    expect(reload).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('reloads after the waiting worker activates', async () => {
    const { options, register, updateSW } = makeRegister()
    const { waiting } = makeWaitingWorker(updateSW)
    const registration = { waiting } as unknown as ServiceWorkerRegistration
    const { controller, reload } = makeController(register)
    options.current?.onRegistered?.(registration)
    options.current?.onNeedRefresh?.()

    await controller.confirmUpdate()
    expect(updateSW).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('falls back to update_available when the waiting worker never activates', async () => {
    vi.useFakeTimers()
    try {
      const { options, register, updateSW } = makeRegister()
      updateSW.mockResolvedValue(undefined)
      const waiting = {
        state: 'waiting' as ServiceWorkerState,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      const registration = { waiting } as unknown as ServiceWorkerRegistration
      const { controller, reload } = makeController(register)
      options.current?.onRegistered?.(registration)
      options.current?.onNeedRefresh?.()

      const confirm = controller.confirmUpdate()
      await vi.advanceTimersByTimeAsync(10_000)
      await confirm
      expect(controller.status.value).toBe('update_available')
      expect(reload).not.toHaveBeenCalled()
      controller.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispose during the activation wait resolves without reloading', async () => {
    const { options, register, updateSW } = makeRegister()
    updateSW.mockResolvedValue(undefined)
    const waiting = {
      state: 'waiting' as ServiceWorkerState,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const registration = { waiting } as unknown as ServiceWorkerRegistration
    const { controller, reload } = makeController(register)
    options.current?.onRegistered?.(registration)
    options.current?.onNeedRefresh?.()

    const confirm = controller.confirmUpdate()
    await vi.waitFor(() => {
      expect(updateSW).toHaveBeenCalledTimes(1)
    })
    controller.dispose()
    await confirm
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads when no waiting worker exists', async () => {
    const { options, register, updateSW } = makeRegister()
    const { controller, reload } = makeController(register)
    options.current?.onNeedRefresh?.()

    await controller.confirmUpdate()
    expect(updateSW).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('dismiss returns to offline_ready after a prior ready state', () => {
    const { options, register } = makeRegister()
    const { controller } = makeController(register)
    options.current?.onOfflineReady?.()
    options.current?.onNeedRefresh?.()
    controller.dismissUpdate()
    expect(controller.status.value).toBe('offline_ready')
    controller.dispose()
  })

  it('dismiss returns to idle when the worker was never ready', () => {
    const { options, register } = makeRegister()
    const { controller } = makeController(register)
    options.current?.onNeedRefresh?.()
    controller.dismissUpdate()
    expect(controller.status.value).toBe('idle')
    controller.dispose()
  })

  it('tracks offline and online events as advisory state', () => {
    const { register } = makeRegister()
    const { controller } = makeController(register)
    window.dispatchEvent(new Event('offline'))
    expect(controller.online.value).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(controller.online.value).toBe(true)
    controller.dispose()
  })

  it('ignores a second endActivity without suspending the idle wait', async () => {
    const { options, register, updateSW } = makeRegister()
    const { controller } = makeController(register)
    options.current?.onNeedRefresh?.()

    beginActivity()
    const confirm = controller.confirmUpdate()
    endActivity()
    endActivity()
    await confirm
    expect(updateSW).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('dispose resolves a pending confirmation without activating', async () => {
    const { options, register, updateSW } = makeRegister()
    const { controller, reload } = makeController(register)
    options.current?.onNeedRefresh?.()

    beginActivity()
    const confirm = controller.confirmUpdate()
    controller.dispose()
    await confirm
    expect(updateSW).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    endActivity()

    window.dispatchEvent(new Event('offline'))
    expect(controller.online.value).toBe(true)
  })
})
