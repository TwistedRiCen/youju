import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  EcommerceRefundRuleSchema,
  evaluateRule,
  isEcommerceRefundRule,
  parseEcommerceRefundRule,
} from '../src/index.js'
import type { EcommerceRefundRule, EvaluateRuleInput } from '../src/index.js'

const validRule: EcommerceRefundRule = {
  id: 'consumer.ecommerce.refund.basic',
  version: '1.0.0',
  scenario: 'ecommerce_refund',
  source: {
    description: '网购退款纠纷材料整理的稳定方法',
    scope: '中国大陆普通消费场景，仅用于材料整理',
    stable: true,
    lastVerifiedAt: '2026-07-29',
    maintainer: 'YouJu contributors',
  },
  requiredFacts: [
    'purchase_time',
    'merchant_name',
    'product_name',
    'paid_amount',
    'problem_description',
    'requested_resolution',
  ],
  recommendedEvidence: [
    {
      category: 'order_record',
      label: '订单记录',
      sourceReference: 'stable-method:order-record',
    },
    {
      category: 'payment_record',
      label: '支付凭证',
      sourceReference: 'stable-method:payment-record',
    },
    {
      category: 'product_issue_photo',
      label: '商品问题照片',
      sourceReference: 'stable-method:product-photo',
    },
    {
      category: 'merchant_communication',
      label: '商家沟通记录',
      sourceReference: 'stable-method:merchant-communication',
    },
  ],
  warnings: [
    'preserve_original_files',
    'preserve_original_device',
    'avoid_editing_original_screenshots',
  ],
}

const allConfirmedFactFields: EvaluateRuleInput['confirmedFactFields'] = [
  'purchase_time',
  'merchant_name',
  'product_name',
  'paid_amount',
  'problem_description',
  'requested_resolution',
]

const allEvidence: EvaluateRuleInput['evidence'] = [
  { id: '00000000-0000-4000-8000-000000000101', category: 'order_record' },
  { id: '00000000-0000-4000-8000-000000000102', category: 'payment_record' },
  { id: '00000000-0000-4000-8000-000000000103', category: 'product_issue_photo' },
  { id: '00000000-0000-4000-8000-000000000104', category: 'merchant_communication' },
]

describe('ecommerce refund rule engine', () => {
  it('loads the versioned YAML rule with stable source metadata', async () => {
    const ruleDocument = await readFile(
      new URL('../../../rules/consumer/ecommerce-refund.v1.yaml', import.meta.url),
      'utf8',
    )

    const rule = parseEcommerceRefundRule(ruleDocument)

    expect(EcommerceRefundRuleSchema).toBeDefined()
    expect(isEcommerceRefundRule(rule)).toBe(true)
    expect(rule).toEqual(validRule)
  })

  it('does not report missing facts when every required fact is confirmed', () => {
    const findings = evaluateRule(validRule, {
      confirmedFactFields: allConfirmedFactFields,
      evidence: [],
    })

    expect(findings.filter(({ resultType }) => resultType === 'missing_fact')).toEqual([])
  })

  it('reports a blocking finding for a missing required fact', () => {
    const findings = evaluateRule(validRule, {
      confirmedFactFields: allConfirmedFactFields.filter((field) => field !== 'merchant_name'),
      evidence: allEvidence,
    })

    expect(findings).toEqual([
      {
        ruleId: 'consumer.ecommerce.refund.basic',
        ruleVersion: '1.0.0',
        severity: 'blocking',
        resultType: 'missing_fact',
        message: '缺少必填事实：merchant_name',
        relatedEvidenceIds: [],
        sourceReference: 'stable-method:required-fact:merchant_name',
      },
    ])
  })

  it('reports the specified warning when merchant communication evidence is missing', () => {
    const findings = evaluateRule(validRule, {
      confirmedFactFields: allConfirmedFactFields,
      evidence: allEvidence.filter(({ category }) => category !== 'merchant_communication'),
    })

    expect(findings).toEqual([
      {
        ruleId: 'consumer.ecommerce.refund.basic',
        ruleVersion: '1.0.0',
        severity: 'warning',
        resultType: 'missing_evidence',
        message: '建议补充：商家沟通记录',
        relatedEvidenceIds: [],
        sourceReference: 'stable-method:merchant-communication',
      },
    ])
  })

  it('does not report missing evidence when every recommendation is present', () => {
    const findings = evaluateRule(validRule, {
      confirmedFactFields: allConfirmedFactFields,
      evidence: allEvidence,
    })

    expect(findings.filter(({ resultType }) => resultType === 'missing_evidence')).toEqual([])
  })

  it('does not create duplicate findings for repeated evidence', () => {
    const evidenceWithoutCommunication = allEvidence.filter(
      ({ category }) => category !== 'merchant_communication',
    )

    const findings = evaluateRule(validRule, {
      confirmedFactFields: allConfirmedFactFields,
      evidence: [...evidenceWithoutCommunication, ...evidenceWithoutCommunication],
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.sourceReference).toBe('stable-method:merchant-communication')
  })

  it('keeps finding order stable for identical inputs', () => {
    const input: EvaluateRuleInput = {
      confirmedFactFields: [
        'product_name',
        'paid_amount',
        'problem_description',
        'requested_resolution',
      ],
      evidence: [{ id: '00000000-0000-4000-8000-000000000102', category: 'payment_record' }],
    }

    const expected = [
      {
        ruleId: 'consumer.ecommerce.refund.basic',
        ruleVersion: '1.0.0',
        severity: 'blocking',
        resultType: 'missing_fact',
        message: '缺少必填事实：purchase_time',
        relatedEvidenceIds: [],
        sourceReference: 'stable-method:required-fact:purchase_time',
      },
      {
        ruleId: 'consumer.ecommerce.refund.basic',
        ruleVersion: '1.0.0',
        severity: 'blocking',
        resultType: 'missing_fact',
        message: '缺少必填事实：merchant_name',
        relatedEvidenceIds: [],
        sourceReference: 'stable-method:required-fact:merchant_name',
      },
      {
        ruleId: 'consumer.ecommerce.refund.basic',
        ruleVersion: '1.0.0',
        severity: 'warning',
        resultType: 'missing_evidence',
        message: '建议补充：订单记录',
        relatedEvidenceIds: [],
        sourceReference: 'stable-method:order-record',
      },
      {
        ruleId: 'consumer.ecommerce.refund.basic',
        ruleVersion: '1.0.0',
        severity: 'warning',
        resultType: 'missing_evidence',
        message: '建议补充：商品问题照片',
        relatedEvidenceIds: [],
        sourceReference: 'stable-method:product-photo',
      },
      {
        ruleId: 'consumer.ecommerce.refund.basic',
        ruleVersion: '1.0.0',
        severity: 'warning',
        resultType: 'missing_evidence',
        message: '建议补充：商家沟通记录',
        relatedEvidenceIds: [],
        sourceReference: 'stable-method:merchant-communication',
      },
    ]

    expect(evaluateRule(validRule, input)).toEqual(expected)
    expect(evaluateRule(validRule, input)).toEqual(expected)
  })

  it('does not modify the rule or input objects', () => {
    const input: EvaluateRuleInput = {
      confirmedFactFields: [...allConfirmedFactFields],
      evidence: allEvidence.map((evidence) => ({ ...evidence })),
    }
    const ruleBefore = structuredClone(validRule)
    const inputBefore = structuredClone(input)

    evaluateRule(validRule, input)

    expect(validRule).toEqual(ruleBefore)
    expect(input).toEqual(inputBefore)
  })

  it('rejects malformed rules at runtime', () => {
    expect(isEcommerceRefundRule({ ...validRule, version: '1.0' })).toBe(false)
    expect(isEcommerceRefundRule({ ...validRule, requiredFacts: [] })).toBe(false)
    expect(isEcommerceRefundRule({ ...validRule, recommendedEvidence: [] })).toBe(false)
    expect(() => parseEcommerceRefundRule('id: incomplete-rule')).toThrow(
      'Invalid ecommerce refund rule',
    )
  })

  it('rejects unknown scenarios', () => {
    expect(isEcommerceRefundRule({ ...validRule, scenario: 'medical_dispute' })).toBe(false)
  })

  it('rejects unknown fields in rule objects', () => {
    expect(isEcommerceRefundRule({ ...validRule, legalConclusion: 'merchant_liable' })).toBe(false)
    expect(
      isEcommerceRefundRule({
        ...validRule,
        source: { ...validRule.source, jurisdictionConclusion: 'applicable' },
      }),
    ).toBe(false)
  })
})
