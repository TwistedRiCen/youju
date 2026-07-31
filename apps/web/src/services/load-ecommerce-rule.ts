import ruleYaml from '../../../../rules/consumer/ecommerce-refund.v1.yaml?raw'
import { parseEcommerceRefundRule } from '@youju/rule-engine'
import type { EcommerceRefundRule } from '@youju/rule-engine'

export function loadEcommerceRefundRule(): EcommerceRefundRule {
  return parseEcommerceRefundRule(ruleYaml)
}
