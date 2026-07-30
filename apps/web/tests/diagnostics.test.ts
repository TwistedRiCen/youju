import { describe, expect, it } from 'vitest'

describe('development diagnostics view', () => {
  it('shows the browser-safe golden case summary', async () => {
    const { default: DiagnosticsView } = await import('../src/views/DiagnosticsView.vue')
    const { mount } = await import('@vue/test-utils')
    const wrapper = mount(DiagnosticsView)

    expect(wrapper.text()).toContain('case-001-transport-damage')
    expect(wrapper.text()).toContain('材料数量：4')
    expect(wrapper.text()).toContain('已确认事实：6')
    expect(wrapper.text()).toContain('时间线条目：4')
    expect(wrapper.text()).toContain('规则校验：通过')
  })
})
