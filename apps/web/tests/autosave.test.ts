import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosave } from '../src/composables/use-autosave.js'
import { CaseRepositoryError } from '../src/storage/index.js'
import { activeActivityCount, endActivity } from '../src/pwa/update-controller.js'

describe('autosave controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    try {
      expect(activeActivityCount()).toBe(0)
    } finally {
      endActivity()
      endActivity()
      endActivity()
    }
    vi.useRealTimers()
  })

  it('debounces scheduled saves by 400 ms and keeps only the latest value', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosave({ persist })

    controller.schedule('a')
    controller.schedule('b')
    expect(persist).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(399)
    expect(persist).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('b')

    await controller.dispose()
  })

  it('reports a pending write as saving before the debounce completes', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosave({ persist })

    controller.schedule('pending')

    expect(controller.status.value).toBe('saving')

    await controller.dispose()
  })

  it('exposes saving and saved status around a persisted write', async () => {
    let resolvePersist: (() => void) | undefined
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = resolve
        }),
    )
    const controller = createAutosave({ persist })

    controller.schedule('a')
    const flushPromise = controller.flush()

    expect(controller.status.value).toBe('saving')
    await Promise.resolve()
    resolvePersist?.()
    await flushPromise
    expect(controller.status.value).toBe('saved')

    await controller.dispose()
  })

  it('retains the pending value and reports failure when persistence fails', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('storage down'))
    const controller = createAutosave({ persist })

    controller.schedule('keep-me')
    await controller.flush()

    expect(controller.status.value).toBe('failed')

    persist.mockResolvedValueOnce(undefined)
    await controller.flush()
    expect(persist).toHaveBeenLastCalledWith('keep-me')
    expect(controller.status.value).toBe('saved')

    await controller.dispose()
  })

  it('reports conflict for concurrent edit errors and stops further writes', async () => {
    const persist = vi
      .fn()
      .mockRejectedValue(
        new CaseRepositoryError('concurrent_edit_conflict', '事件已在其他标签页被修改'),
      )
    const onConflict = vi.fn()
    const controller = createAutosave({ persist, onConflict })

    controller.schedule('a')
    await controller.flush()

    expect(controller.status.value).toBe('conflict')
    expect(onConflict).toHaveBeenCalledTimes(1)

    controller.schedule('b')
    await controller.flush()
    expect(persist).toHaveBeenCalledTimes(1)

    await controller.dispose()
  })

  it('flushes the latest pending value on dispose', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosave({ persist })

    controller.schedule('late')
    await controller.dispose()

    expect(persist).toHaveBeenCalledWith('late')
  })

  it('keeps the newer draft and balanced activity when an in-flight persist fails', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const persisted: string[] = []
    const persist = vi.fn(async (value: string) => {
      persisted.push(value)
      await gate
      if (value === 'v1') {
        throw new Error('storage down')
      }
    })
    const controller = createAutosave({ persist, debounceMs: 1 })

    controller.schedule('v1')
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(persisted).toEqual(['v1'])

    controller.schedule('v2')
    release?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(persisted).toEqual(['v1', 'v2'])
    expect(controller.status.value).toBe('saved')
    expect(activeActivityCount()).toBe(0)

    await controller.dispose()
  })
})
