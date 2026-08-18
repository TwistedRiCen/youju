import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AppPreferencesRepository,
  LocalAppPreferences,
} from '../src/storage/index.js'
import FirstUseGuide from '../src/components/FirstUseGuide.vue'
import StoragePersistenceNotice from '../src/components/StoragePersistenceNotice.vue'

class MemoryPreferences implements AppPreferencesRepository {
  constructor(public value: LocalAppPreferences | null) {}

  async get(): Promise<LocalAppPreferences | null> {
    return this.value
  }

  async put(value: LocalAppPreferences): Promise<void> {
    this.value = value
  }

  async clear(): Promise<void> {
    this.value = null
  }
}

const existing: LocalAppPreferences = {
  schemaVersion: 1,
  onboardingVersionSeen: null,
  lastAcknowledgedReleaseId: '2026.08.0',
  storagePersistence: 'denied',
}

describe('first-use guidance', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('shows no more than three accessible steps and skip preserves unrelated preferences', async () => {
    const preferences = new MemoryPreferences(existing)
    const wrapper = mount(FirstUseGuide, { props: { preferences } })
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(true))

    expect(wrapper.findAll('[data-guide-step]')).toHaveLength(3)
    expect(wrapper.text()).toContain('本地')
    expect(wrapper.text()).toContain('无需 AI')
    expect(wrapper.text()).toContain('不提供法律结论')
    await wrapper.get('button[data-action="skip"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))

    expect(preferences.value).toEqual({
      ...existing,
      onboardingVersionSeen: 1,
    })
  })

  it('stays closed for the current version, can reopen, and reappears after clear', async () => {
    const preferences = new MemoryPreferences({ ...existing, onboardingVersionSeen: 1 })
    let wrapper = mount(FirstUseGuide, { props: { preferences } })
    await vi.waitFor(() => expect(wrapper.find('button[data-action="open"]').exists()).toBe(true))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.get('button[data-action="open"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    wrapper.unmount()

    await preferences.clear()
    wrapper = mount(FirstUseGuide, { props: { preferences } })
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(true))
  })

  it('shows honest backup advice for denied or unsupported and no cloud claim for granted', async () => {
    for (const status of ['denied', 'unsupported'] as const) {
      const wrapper = mount(StoragePersistenceNotice, {
        props: {
          preferences: new MemoryPreferences({ ...existing, storagePersistence: status }),
          storagePersistenceSupported: true,
        },
      })
      await vi.waitFor(() => expect(wrapper.text()).toContain('导出备份'))
      expect(wrapper.text()).toContain('浏览器')
      if (status === 'denied') {
        expect(wrapper.get('button').text()).toContain('再次请求')
      } else {
        expect(wrapper.text()).toContain('不支持请求持久保存')
        expect(wrapper.find('button').exists()).toBe(false)
      }
      wrapper.unmount()
    }

    const granted = mount(StoragePersistenceNotice, {
      props: {
        preferences: new MemoryPreferences({ ...existing, storagePersistence: 'granted' }),
        storagePersistenceSupported: true,
      },
    })
    await vi.waitFor(() => expect(granted.text()).toContain('持久保存'))
    expect(granted.text()).not.toMatch(/云端备份|不会丢失/)
  })

  it('uses a modal dialog, traps keyboard focus, and closes with Escape', async () => {
    const preferences = new MemoryPreferences(existing)
    const wrapper = mount(FirstUseGuide, {
      attachTo: document.body,
      props: { preferences },
    })
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(true))
    const skip = wrapper.get<HTMLButtonElement>('button[data-action="skip"]')
    const complete = wrapper.get<HTMLButtonElement>('button[data-action="complete"]')
    expect(document.activeElement).toBe(skip.element)

    await skip.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(complete.element)
    await complete.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(skip.element)
    await skip.trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    expect(preferences.value?.onboardingVersionSeen).toBe(1)
  })
})
