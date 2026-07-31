import { describe, expect, it } from 'vitest'
import { evaluateRule } from '@youju/rule-engine'
import { loadEcommerceRefundRule } from '../src/services/load-ecommerce-rule.js'

describe('versioned rule loading', () => {
  it('loads the YAML rule as a raw asset without duplicating rule data', () => {
    const rule = loadEcommerceRefundRule()

    expect(rule.id).toBe('consumer.ecommerce.refund.basic')
    expect(rule.version).toBe('1.0.0')
  })

  it('produces deterministic blocking and warning findings', () => {
    const rule = loadEcommerceRefundRule()
    const findings = evaluateRule(rule, { confirmedFactFields: [], evidence: [] })

    expect(findings.filter((finding) => finding.resultType === 'missing_fact')).toHaveLength(6)
    expect(findings.filter((finding) => finding.resultType === 'missing_evidence')).toHaveLength(4)
    expect(findings[0]).toMatchObject({
      ruleId: 'consumer.ecommerce.refund.basic',
      severity: 'blocking',
      resultType: 'missing_fact',
      message: '缺少必填事实：purchase_time',
    })
  })
})
