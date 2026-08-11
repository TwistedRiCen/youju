import { describe, expect, it } from 'vitest'
import { requiresEvidenceSource } from '@youju/domain'
import type { EvidenceFile } from '@youju/domain'

const evidenceItem: EvidenceFile = {
  id: '00000000-0000-4000-8000-000000000101',
  caseId: '00000000-0000-4000-8000-000000000001',
  originalName: '订单截图.png',
  mediaType: 'image/png',
  size: 16,
  sha256: 'a'.repeat(64),
  importedAt: '2026-07-31T07:00:00.000Z',
  sourceCreatedAt: null,
  category: 'order_record',
  storageRef: 'cases/00000000-0000-4000-8000-000000000001/evidence/00000000-0000-4000-8000-000000000101',
  isOriginalPreserved: true,
  metadata: {},
}

describe('fact source policy', () => {
  it('requires evidence for transactional facts but not statement-only fields', () => {
    expect(requiresEvidenceSource('purchase_time')).toBe(true)
    expect(requiresEvidenceSource('paid_amount')).toBe(true)
    expect(requiresEvidenceSource('problem_description')).toBe(false)
    expect(requiresEvidenceSource('requested_resolution')).toBe(false)
  })
})

describe('fact editor', () => {
  it('warns on source-required facts and emits manual confirmation', async () => {
    const { default: FactEditor } = await import('../src/components/FactEditor.vue')
    const { mount } = await import('@vue/test-utils')

    const wrapper = mount(FactEditor, {
      props: {
        fieldName: 'paid_amount',
        label: '实付金额（元）',
        value: '899.00',
        disabled: false,
        evidence: [evidenceItem],
        selectedSourceIds: [],
      },
    })

    expect(wrapper.text()).toContain('正式导出前必须关联材料')
    await wrapper.get('input').setValue('900.00')
    expect(wrapper.emitted('updateValue')?.[0]?.[0]).toBe('900.00')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('allows selecting source materials for source-required facts', async () => {
    const { default: FactEditor } = await import('../src/components/FactEditor.vue')
    const { mount } = await import('@vue/test-utils')

    const wrapper = mount(FactEditor, {
      props: {
        fieldName: 'paid_amount',
        label: '实付金额（元）',
        value: '899.00',
        disabled: false,
        evidence: [evidenceItem],
        selectedSourceIds: [],
      },
    })

    expect(wrapper.find('fieldset.sources').exists()).toBe(true)
    const checkbox = wrapper.get('input[type="checkbox"]')
    await checkbox.setValue(true)

    expect(wrapper.emitted('updateSourceIds')?.[0]?.[0]).toEqual([evidenceItem.id])
  })

  it('does not warn for problem description and requested resolution', async () => {
    const { default: FactEditor } = await import('../src/components/FactEditor.vue')
    const { mount } = await import('@vue/test-utils')

    for (const fieldName of ['problem_description', 'requested_resolution'] as const) {
      const wrapper = mount(FactEditor, {
        props: {
          fieldName,
          label: fieldName === 'problem_description' ? '问题描述' : '期望处理结果',
          value: '内容',
          disabled: false,
          evidence: [evidenceItem],
          selectedSourceIds: [],
        },
      })
      expect(wrapper.text()).not.toContain('正式导出前必须关联材料')
    }
  })

  it('disables confirmation while the value is empty', async () => {
    const { default: FactEditor } = await import('../src/components/FactEditor.vue')
    const { mount } = await import('@vue/test-utils')

    const wrapper = mount(FactEditor, {
      props: {
        fieldName: 'problem_description',
        label: '问题描述',
        value: '',
        disabled: false,
        evidence: [],
        selectedSourceIds: [],
      },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
