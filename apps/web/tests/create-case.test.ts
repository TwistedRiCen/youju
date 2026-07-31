import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import { describe, expect, it } from 'vitest'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cases/new', name: 'create-case', component: { template: '<div />' } },
      { path: '/cases/:caseId', name: 'case-workspace', component: { template: '<div />' } },
    ],
  })
}

describe('create case view', () => {
  it('shows exactly the six creation fields and the local-data risk statement', async () => {
    const { default: CreateCaseView } = await import('../src/views/CreateCaseView.vue')
    const { mount } = await import('@vue/test-utils')
    const router = makeRouter()
    const wrapper = mount(CreateCaseView, { global: { plugins: [router] } })

    expect(wrapper.findAll('input')).toHaveLength(6)
    expect(wrapper.get('label[for="case-title"]').text()).toBe('事件标题')
    expect(wrapper.get('label[for="purchase-time"]').text()).toBe('购买时间')
    expect(wrapper.get('label[for="merchant-name"]').text()).toBe('商家名称')
    expect(wrapper.get('label[for="product-name"]').text()).toBe('商品名称')
    expect(wrapper.get('label[for="paid-amount"]').text()).toBe('实付金额（元）')
    expect(wrapper.get('label[for="requested-resolution"]').text()).toBe('期望处理结果')
    expect(wrapper.get('button[type="submit"]').text()).toBe('创建事件')
    expect(wrapper.text()).toContain('只保存在当前浏览器设备')
    expect(wrapper.findAll('input[type="password"], input[type="tel"]')).toHaveLength(0)
    expect(wrapper.text()).not.toMatch(/AI|账号|电话|密码/)
  })
})
