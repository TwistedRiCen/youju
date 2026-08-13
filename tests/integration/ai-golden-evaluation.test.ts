import { describe, expect, it } from 'vitest'
import { evaluateGoldenCase } from '../../scripts/evaluate-ai-golden-case.js'

describe('M3 AI golden evaluation', () => {
  it('matches the frozen aggregate metrics without exposing fixture content', async () => {
    const result = await evaluateGoldenCase()

    expect(result.caseId).toBe('case-001-transport-damage')
    expect(result.metrics).toEqual({
      classification: { correct: 4, total: 4 },
      facts: { correct: 9, total: 9 },
      timeline: { matched: 4, expected: 4 },
      sources: { correct: 17, total: 17 },
      missingSourceCount: 0,
      conflictCount: 0,
      hallucinationCount: 0,
      initialSchema: { passed: 4, total: 5 },
      afterRepairSchema: { passed: 5, total: 5 },
    })
    expect(result.output).not.toMatch(/鏅村窛|899|手机号|apiKey/i)
  })
})
