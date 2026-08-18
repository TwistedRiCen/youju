import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { CaseEvent } from '@youju/domain'
import DemoCaseBanner from '../src/components/DemoCaseBanner.vue'

const base: CaseEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  scenarioType: 'ecommerce_refund',
  title: '完全虚构演示数据',
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
  status: 'draft',
  requestedResolution: null,
  storageMode: 'local',
  schemaVersion: 2,
  dataOrigin: 'user_created',
  demoFixtureId: null,
}

describe('demo case banner', () => {
  it('does not infer demo identity from a real case title', () => {
    const wrapper = mount(DemoCaseBanner, { props: { caseEvent: base } })
    expect(wrapper.text()).toBe('')
  })

  it('persistently marks a fictional demo from the CaseEvent discriminator', () => {
    const wrapper = mount(DemoCaseBanner, {
      props: {
        caseEvent: {
          ...base,
          title: '普通标题',
          dataOrigin: 'fictional_demo',
          demoFixtureId: 'm4-ecommerce-refund-demo-v1',
        },
      },
    })
    expect(wrapper.text()).toContain('完全虚构演示数据')
    expect(wrapper.text()).toContain('请勿作为真实材料提交')
  })
})
