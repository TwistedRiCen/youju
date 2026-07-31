import { describe, expect, it } from 'vitest'
import { requiresEvidenceSource } from '@youju/domain'

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
      },
    })

    expect(wrapper.text()).toContain('正式导出前必须关联材料')
    await wrapper.get('input').setValue('900.00')
    expect(wrapper.emitted('updateValue')?.[0]?.[0]).toBe('900.00')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
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
      },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
