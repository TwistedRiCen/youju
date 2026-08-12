import { describe, expect, it } from 'vitest'
import { EvidenceCategorySchema } from '@youju/domain'
import type { EvidenceCategory, EvidenceFile } from '@youju/domain'
import { EVIDENCE_CATEGORY_LABELS } from '../src/services/evidence-service.js'

const caseId = '00000000-0000-4000-8000-000000000001'

const evidenceItem: EvidenceFile = {
  id: '00000000-0000-4000-8000-000000000101',
  caseId,
  originalName: '材料一.png',
  mediaType: 'image/png',
  size: 16,
  sha256: 'a'.repeat(64),
  importedAt: '2026-07-31T07:00:00.000Z',
  sourceCreatedAt: null,
  category: 'order_record',
  categoryOrigin: 'manual',
  categoryCandidateId: null,
  storageRef: `cases/${caseId}/evidence/00000000-0000-4000-8000-000000000101`,
  isOriginalPreserved: true,
  metadata: {},
}

describe('material management', () => {
  it('labels every evidence category from the domain schema in Simplified Chinese', () => {
    const schema = EvidenceCategorySchema as unknown as {
      anyOf: readonly { const: string }[]
    }
    const categories = schema.anyOf.map((entry) => entry.const)

    expect(categories).toHaveLength(10)
    for (const category of categories) {
      const label = EVIDENCE_CATEGORY_LABELS[category as EvidenceCategory]
      expect(label).toBeTruthy()
      expect(label).toMatch(/[\u4e00-\u9fff]/)
    }
  })

  it('renders evidence rows with name, category, size, time and full digest', async () => {
    const { default: EvidenceList } = await import('../src/components/EvidenceList.vue')
    const { mount } = await import('@vue/test-utils')

    const wrapper = mount(EvidenceList, {
      props: { evidence: [evidenceItem] },
    })

    expect(wrapper.text()).toContain('材料一.png')
    expect(wrapper.text()).toContain('大小：16 字节')
    expect(wrapper.text()).toContain('导入时间：2026-07-31T07:00:00.000Z')
    expect(wrapper.text()).toContain(`SHA-256：${'a'.repeat(64)}`)
    expect(wrapper.findAll('select option')).toHaveLength(10)
  })

  it('emits category changes from the list select', async () => {
    const { default: EvidenceList } = await import('../src/components/EvidenceList.vue')
    const { mount } = await import('@vue/test-utils')

    const wrapper = mount(EvidenceList, {
      props: { evidence: [evidenceItem] },
    })

    await wrapper.get('select').setValue('payment_record')

    expect(wrapper.emitted('categoryChange')?.[0]?.[0]).toMatchObject({
      evidenceId: evidenceItem.id,
      category: 'payment_record',
    })
  })

  it('disables the file input while importing', async () => {
    const { default: EvidenceImportField } = await import(
      '../src/components/EvidenceImportField.vue'
    )
    const { mount } = await import('@vue/test-utils')

    const wrapper = mount(EvidenceImportField, {
      props: { disabled: true },
    })

    const input = wrapper.get('input[type="file"]')
    expect(input.attributes('disabled')).toBeDefined()
    expect(input.attributes('multiple')).toBeDefined()
  })
})
