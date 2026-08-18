import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import { describe, expect, it } from 'vitest'
import type { CaseRepository, StoredCase } from '../src/storage/index.js'
import { createLocalCase } from '../src/services/case-service.js'
import { normalizePersistedCaseIdentity } from '../src/storage/indexeddb-case-repository.js'

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
  it('normalizes only legacy identities and rejects corrupt explicit demo identities', () => {
    expect(normalizePersistedCaseIdentity({})).toEqual({
      dataOrigin: 'user_created',
      demoFixtureId: null,
    })
    expect(
      normalizePersistedCaseIdentity({
        dataOrigin: 'fictional_demo',
        demoFixtureId: 'm4-ecommerce-refund-demo-v1',
      }),
    ).toEqual({
      dataOrigin: 'fictional_demo',
      demoFixtureId: 'm4-ecommerce-refund-demo-v1',
    })
    expect(() =>
      normalizePersistedCaseIdentity({ dataOrigin: 'fictional_demo', demoFixtureId: null }),
    ).toThrow('本地事件来源身份无效')
  })

  it('creates normal cases with an explicit user-created identity', async () => {
    const repository = {
      async createCase(caseEvent: StoredCase['caseEvent']): Promise<StoredCase> {
        return { caseEvent, revision: 1, lastWriterId: 'test' }
      },
    } as unknown as CaseRepository

    const stored = await createLocalCase(repository, {
      title: '运输破损退款纠纷',
      purchaseTime: '2026-07-29T10:00',
      merchantName: '虚构商家',
      productName: '虚构耳机',
      paidAmountYuan: '899.00',
      requestedResolution: '退款',
    })

    expect(stored.caseEvent.dataOrigin).toBe('user_created')
    expect(stored.caseEvent.demoFixtureId).toBeNull()
    expect(stored.caseEvent.schemaVersion).toBe(2)
  })

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
