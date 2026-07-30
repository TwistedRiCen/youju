import { describe, expect, it } from 'vitest'

describe('home view', () => {
  it('states the product purpose and non-legal boundary', async () => {
    const { default: HomeView } = await import('../src/views/HomeView.vue')
    const { mount } = await import('@vue/test-utils')
    const wrapper = mount(HomeView)

    expect(wrapper.get('h1').text()).toBe('有据')
    expect(wrapper.text()).toContain('整理事实与材料，不替你作法律判断')
    expect(wrapper.text()).toContain('无需注册；不使用AI也能完成核心流程')
  })
})
