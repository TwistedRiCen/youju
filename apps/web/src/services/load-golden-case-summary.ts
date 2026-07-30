import { goldenCase001Summary } from '@youju/test-support/browser'

export interface GoldenCaseSummary {
  id: string
  title: string
  evidenceCount: number
  confirmedFactCount: number
  timelineCount: number
  ruleValidation: 'passed' | 'failed'
}

export function loadGoldenCaseSummary(): GoldenCaseSummary {
  return { ...goldenCase001Summary }
}
