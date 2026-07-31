export interface GoldenCaseSummary {
  id: string
  title: string
  evidenceCount: number
  binaryCount: number
  confirmedFactCount: number
  timelineCount: number
  ruleValidation: 'passed' | 'failed'
}

export const goldenCase001Summary: GoldenCaseSummary = {
  id: 'case-001-transport-damage',
  title: '运输破损退款纠纷（完全虚构）',
  evidenceCount: 4,
  binaryCount: 4,
  confirmedFactCount: 6,
  timelineCount: 4,
  ruleValidation: 'passed',
}
