import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const demo = vi.hoisted(() => ({
  find: vi.fn(),
  load: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('../src/demo/index.js', () => ({
  PUBLIC_DEMO_FIXTURE_ID: 'm4-ecommerce-refund-demo-v1',
  findDemoCase: demo.find,
  loadDemoCase: demo.load,
  resetDemoCase: demo.reset,
}))

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/cases/new', name: 'create-case', component: { template: '<div />' } },
      { path: '/cases/:caseId', name: 'case-workspace', component: { template: '<div />' } },
    ],
  })
}

describe('home view', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    demo.find.mockReset().mockResolvedValue(null)
    demo.load.mockReset().mockResolvedValue({ status: 'loaded', caseId: 'demo-case-id' })
    demo.reset.mockReset().mockResolvedValue({ status: 'loaded', caseId: 'reset-case-id' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('states the product purpose and non-legal boundary', async () => {
    const { default: HomeView } = await import('../src/views/HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('有据')
    expect(wrapper.text()).toContain('整理事实与材料，不替你作法律判断')
    expect(wrapper.text()).toContain('无需注册')
    expect(wrapper.text()).toContain('无需 AI')
    expect(wrapper.text()).not.toContain('将在 M2 后续版本开放')
    expect(wrapper.get('[data-action="load-demo"]').text()).toContain('加载完全虚构演示')
    expect(wrapper.get('[data-action="create-case"]').text()).toContain('创建我的事件')
    expect(wrapper.get('a[href="/privacy"]')).toBeTruthy()
    expect(wrapper.get('a[href="/about"]')).toBeTruthy()
  })

  it('loads a new demo and opens it without requesting AI', async () => {
    const { default: HomeView } = await import('../src/views/HomeView.vue')
    const router = makeRouter()
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('[data-action="load-demo"]').trigger('click')
    await flushPromises()

    expect(demo.load).toHaveBeenCalledWith('m4-ecommerce-refund-demo-v1')
    expect(router.currentRoute.value.fullPath).toBe('/cases/demo-case-id')
  })

  it('keeps loading and failure states honest and suppresses duplicate clicks', async () => {
    let rejectLoad: ((reason: Error) => void) | undefined
    demo.load.mockReturnValue(new Promise((_, reject) => { rejectLoad = reject }))
    const { default: HomeView } = await import('../src/views/HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    const button = wrapper.get<HTMLButtonElement>('[data-action="load-demo"]')
    await button.trigger('click')
    await button.trigger('click')
    expect(demo.load).toHaveBeenCalledTimes(1)
    expect(button.element.disabled).toBe(true)
    expect(wrapper.text()).toContain('正在校验并加载完全虚构演示')

    rejectLoad?.(new Error('storage unavailable'))
    await flushPromises()
    expect(wrapper.text()).toContain('演示加载未完成')
    expect(button.element.disabled).toBe(false)
  })

  it('retains the real-case entry when checking demo storage fails', async () => {
    demo.find.mockRejectedValue(new Error('indexeddb unavailable'))
    const { default: HomeView } = await import('../src/views/HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    expect(wrapper.find('[data-action="create-case"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('仍可创建自己的事件')
  })

  it('offers explicit open and reset actions when the demo already exists', async () => {
    demo.find.mockResolvedValue({
      caseEvent: {
        id: 'existing-demo-id',
        dataOrigin: 'fictional_demo',
        demoFixtureId: 'm4-ecommerce-refund-demo-v1',
      },
    })
    const confirm = vi.mocked(window.confirm)
    const { default: HomeView } = await import('../src/views/HomeView.vue')
    const router = makeRouter()
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-action="load-demo"]').exists()).toBe(false)
    expect(wrapper.get('[data-action="open-demo"]').text()).toContain('打开已有演示')
    expect(wrapper.get('[data-action="reset-demo"]').text()).toContain('重置演示案例')
    await wrapper.get('[data-action="open-demo"]').trigger('click')
    await flushPromises()
    expect(demo.load).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/cases/existing-demo-id')

    await router.push('/')
    await wrapper.get('[data-action="reset-demo"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(demo.reset).toHaveBeenCalledWith('m4-ecommerce-refund-demo-v1')
    expect(router.currentRoute.value.fullPath).toBe('/cases/reset-case-id')
  })
})
