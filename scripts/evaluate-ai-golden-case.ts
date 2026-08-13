import { isAiTaskOutput } from '@youju/ai-core'
import type { GoldenCaseExpectedMetrics } from '@youju/test-support'
import { loadGoldenCase } from '@youju/test-support'
import type { GoldenCase, GoldenCaseAiResponse } from '@youju/test-support'
import { deepStrictEqual } from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtureDirectory = new URL(
  '../fixtures/ecommerce-refund/case-001-transport-damage/',
  import.meta.url,
)

export type AiGoldenMetrics = GoldenCaseExpectedMetrics

export interface AiGoldenEvaluation {
  readonly caseId: string
  readonly metrics: AiGoldenMetrics
  readonly output: string
}

function outputOf(caseFixture: GoldenCase, key: keyof GoldenCase['ai']): GoldenCaseAiResponse {
  return caseFixture.ai[key] as GoldenCaseAiResponse
}

function sourceTokens(response: GoldenCaseAiResponse): readonly string[] {
  const output = response.output
  const tokens: string[] = []
  if (response.taskType === 'classify_evidence' && typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const classifications = (output as { classifications?: unknown }).classifications
    if (Array.isArray(classifications)) {
      for (const item of classifications) {
        if (typeof item === 'object' && item !== null && typeof (item as { sourceToken?: unknown }).sourceToken === 'string') {
          tokens.push((item as { sourceToken: string }).sourceToken)
        }
      }
    }
    return tokens
  }
  if ((response.taskType === 'extract_facts' || response.taskType === 'build_timeline') && typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const items = response.taskType === 'extract_facts'
      ? (output as { facts?: unknown }).facts
      : (output as { entries?: unknown }).entries
    if (Array.isArray(items)) {
      for (const item of items) {
        const sources = typeof item === 'object' && item !== null ? (item as { sources?: unknown }).sources : undefined
        if (Array.isArray(sources)) {
          for (const source of sources) {
            if (typeof source === 'object' && source !== null && typeof (source as { sourceToken?: unknown }).sourceToken === 'string') {
              tokens.push((source as { sourceToken: string }).sourceToken)
            }
          }
        }
      }
    }
    return tokens
  }
  return []
}

function facts(response: GoldenCaseAiResponse): readonly Record<string, unknown>[] {
  const items = typeof response.output === 'object' && response.output !== null && !Array.isArray(response.output)
    ? (response.output as { facts?: unknown }).facts
    : undefined
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    : []
}

function timeline(response: GoldenCaseAiResponse): readonly Record<string, unknown>[] {
  const items = typeof response.output === 'object' && response.output !== null && !Array.isArray(response.output)
    ? (response.output as { entries?: unknown }).entries
    : undefined
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    : []
}

function classifications(response: GoldenCaseAiResponse): readonly Record<string, unknown>[] {
  const items = typeof response.output === 'object' && response.output !== null && !Array.isArray(response.output)
    ? (response.output as { classifications?: unknown }).classifications
    : undefined
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    : []
}

function evaluateMetrics(caseFixture: GoldenCase): AiGoldenMetrics {
  const classification = outputOf(caseFixture, 'responsesClassification')
  const factExtraction = outputOf(caseFixture, 'chatFacts')
  const timelineOutput = outputOf(caseFixture, 'chatTimeline')
  const normalResponses = [classification, factExtraction, timelineOutput, outputOf(caseFixture, 'chatStatement')]
  const repaired = outputOf(caseFixture, 'repairedResponse')
  const authorized = new Set(caseFixture.manifest.ai.authorizedSourceTokens)

  const expectedCategories = new Map([
    [caseFixture.manifest.ai.authorizedSourceTokens[0], 'order_record'],
    [caseFixture.manifest.ai.authorizedSourceTokens[1], 'payment_record'],
    [caseFixture.manifest.ai.authorizedSourceTokens[2], 'product_issue_photo'],
    [caseFixture.manifest.ai.authorizedSourceTokens[3], 'merchant_communication'],
  ])
  const correctClassifications = classifications(classification).filter((item) =>
    typeof item.sourceToken === 'string' && item.category === expectedCategories.get(item.sourceToken),
  ).length

  const expectedFactKeys = new Set(caseFixture.expected.aiExtraction.facts.map((item) => `${item.factType}:${item.fieldName}`))
  const extractedFacts = facts(factExtraction)
  const correctFacts = extractedFacts.filter((item) =>
    typeof item.factType === 'string' && typeof item.fieldName === 'string' && expectedFactKeys.has(`${item.factType}:${item.fieldName}`),
  ).length

  const expectedTimelineKeys = new Set(caseFixture.expected.timeline.map((item) => `${item.occurredAt}:${item.timePrecision}`))
  const timelineEntries = timeline(timelineOutput)
  const matchedTimeline = timelineEntries.filter((item) =>
    typeof item.occurredAt === 'string' && typeof item.timePrecision === 'string' && expectedTimelineKeys.has(`${item.occurredAt}:${item.timePrecision}`),
  ).length

  const sourceReferences = [
    ...sourceTokens(classification),
    ...sourceTokens(factExtraction),
    ...sourceTokens(timelineOutput),
  ]
  const missingSourceCount = sourceReferences.filter((token) => !authorized.has(token)).length
  const factKeyCounts = new Map<string, number>()
  for (const item of extractedFacts) {
    if (typeof item.factType === 'string' && typeof item.fieldName === 'string') {
      const key = `${item.factType}:${item.fieldName}`
      factKeyCounts.set(key, (factKeyCounts.get(key) ?? 0) + 1)
    }
  }
  const conflictCount = [...factKeyCounts.values()].filter((count) => count > 1).length
  const hallucinationCount = extractedFacts.filter((item) => {
    if (typeof item.factType !== 'string' || typeof item.fieldName !== 'string') return true
    return !expectedFactKeys.has(`${item.factType}:${item.fieldName}`)
  }).length

  const initialSchemaPassed = normalResponses.filter((response) => isAiTaskOutput(response.taskType, response.output)).length
    + (isAiTaskOutput(outputOf(caseFixture, 'malformedFirstResponse').taskType, outputOf(caseFixture, 'malformedFirstResponse').output) ? 1 : 0)
  const afterRepairSchemaPassed = normalResponses.filter((response) => isAiTaskOutput(response.taskType, response.output)).length
    + (isAiTaskOutput(repaired.taskType, repaired.output) ? 1 : 0)

  return {
    classification: { correct: correctClassifications, total: classifications(classification).length },
    facts: { correct: correctFacts, total: extractedFacts.length },
    timeline: { matched: matchedTimeline, expected: caseFixture.expected.timeline.length },
    sources: { correct: sourceReferences.length - missingSourceCount, total: sourceReferences.length },
    missingSourceCount,
    conflictCount,
    hallucinationCount,
    initialSchema: { passed: initialSchemaPassed, total: normalResponses.length + 1 },
    afterRepairSchema: { passed: afterRepairSchemaPassed, total: normalResponses.length + 1 },
  }
}

export async function evaluateGoldenCase(): Promise<AiGoldenEvaluation> {
  const caseFixture = await loadGoldenCase(fixtureDirectory)
  const metrics = evaluateMetrics(caseFixture)
  deepStrictEqual(metrics, caseFixture.ai.expectedMetrics)
  const output = `${caseFixture.manifest.id} ${JSON.stringify(metrics)}`
  return { caseId: caseFixture.manifest.id, metrics, output }
}

async function main(): Promise<void> {
  try {
    const result = await evaluateGoldenCase()
    console.log(result.output)
  } catch {
    console.error('golden-case evaluation failed')
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main()
}
