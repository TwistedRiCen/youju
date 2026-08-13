import { describe, expect, it } from 'vitest'
import { evaluateRule } from '@youju/rule-engine'
import { confirmStatement } from '@youju/domain'
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

  it('preserves candidate provenance when a candidate-derived draft is finally confirmed', () => {
    const draft = {
      id: '00000000-0000-4000-8000-000000000401',
      caseId: '00000000-0000-4000-8000-000000000001',
      content: 'fictional statement',
      confirmedFactIds: [],
      confirmedTimelineEntryIds: [],
      contentOrigin: 'candidate_edited' as const,
      derivedFromCandidateId: '00000000-0000-4000-8000-000000000301',
      ruleVersion: '1.0.0',
      updatedAt: '2026-08-12T01:00:00.000Z',
      revision: 1,
    }

    const confirmed = confirmStatement({
      draft,
      id: '00000000-0000-4000-8000-000000000402',
      confirmedAt: '2026-08-12T01:01:00.000Z',
      version: 1,
    })

    expect(confirmed.contentOrigin).toBe('candidate_edited')
    expect(confirmed.derivedFromCandidateId).toBe('00000000-0000-4000-8000-000000000301')
  })
})
