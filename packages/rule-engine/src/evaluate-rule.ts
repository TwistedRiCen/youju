import type { EvidenceCategory, FactFieldName, UuidV4 } from '@youju/domain'
import type { EcommerceRefundRule, RuleFinding } from './rule-schema.js'

export interface RuleEvidence {
  readonly id: UuidV4
  readonly category: EvidenceCategory
}

export interface EvaluateRuleInput {
  readonly confirmedFactFields: readonly FactFieldName[]
  readonly evidence: readonly RuleEvidence[]
}

export function evaluateRule(rule: EcommerceRefundRule, input: EvaluateRuleInput): RuleFinding[] {
  const confirmedFactFields = new Set(input.confirmedFactFields)
  const evidenceCategories = new Set(input.evidence.map(({ category }) => category))
  const findings: RuleFinding[] = []

  for (const fieldName of rule.requiredFacts) {
    if (!confirmedFactFields.has(fieldName)) {
      findings.push({
        ruleId: rule.id,
        ruleVersion: rule.version,
        severity: 'blocking',
        resultType: 'missing_fact',
        message: `缺少必填事实：${fieldName}`,
        relatedEvidenceIds: [],
        sourceReference: `stable-method:required-fact:${fieldName}`,
      })
    }
  }

  for (const recommendation of rule.recommendedEvidence) {
    if (!evidenceCategories.has(recommendation.category)) {
      findings.push({
        ruleId: rule.id,
        ruleVersion: rule.version,
        severity: 'warning',
        resultType: 'missing_evidence',
        message: `建议补充：${recommendation.label}`,
        relatedEvidenceIds: [],
        sourceReference: recommendation.sourceReference,
      })
    }
  }

  return findings
}
