import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAiTaskOutput, type ExtractFactsWireOutput } from '@youju/ai-core'
import type {
  CaseEvent,
  ConfirmedFact,
  EvidenceFile,
  FactFieldName,
  TimelineEntry,
} from '@youju/domain'
import type { RuleFinding } from '@youju/rule-engine'
import type { Static, TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import {
  GoldenCaseCaseDocumentSchema,
  GoldenCaseEvidenceDocumentSchema,
  GoldenCaseExpectedFactsSchema,
  GoldenCaseExpectedFindingsSchema,
  GoldenCaseExpectedMetricsSchema,
  GoldenCaseExpectedTimelineSchema,
  GoldenCaseAiResponseSchema,
  GoldenCaseManifestSchema,
} from './fixture-schema.js'
import type {
  GoldenCaseAiResponse,
  GoldenCaseExpectedMetrics,
  GoldenCaseManifest,
} from './fixture-schema.js'

export interface GoldenCase {
  manifest: GoldenCaseManifest
  case: CaseEvent
  evidence: EvidenceFile[]
  binaryEvidence: GoldenCaseManifest['binaryEvidence']
  ai: {
    responsesClassification: GoldenCaseAiResponse
    chatFacts: GoldenCaseAiResponse
    chatTimeline: GoldenCaseAiResponse
    chatStatement: GoldenCaseAiResponse
    malformedFirstResponse: GoldenCaseAiResponse
    repairedResponse: GoldenCaseAiResponse
    expectedMetrics: GoldenCaseExpectedMetrics
  }
  expected: {
    confirmedFactFields: FactFieldName[]
    confirmedFacts: ConfirmedFact[]
    aiExtraction: ExtractFactsWireOutput
    timeline: TimelineEntry[]
    findings: RuleFinding[]
  }
}

function sourceTokens(value: GoldenCaseAiResponse): readonly string[] {
  const output = value.output
  const tokens: string[] = []
  if (value.taskType === 'classify_evidence' && typeof output === 'object' && output !== null && !Array.isArray(output)) {
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
  if ((value.taskType === 'extract_facts' || value.taskType === 'build_timeline') && typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const items = value.taskType === 'extract_facts'
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

function validateAiSources(
  value: GoldenCaseAiResponse,
  authorizedSourceTokens: ReadonlySet<string>,
): void {
  if (!isAiTaskOutput(value.taskType, value.output)) {
    throw new Error('Invalid AI fixture output')
  }
  for (const token of sourceTokens(value)) {
    if (!authorizedSourceTokens.has(token)) {
      throw new Error('AI fixture contains unknown source token')
    }
  }
}

function toFileSystemPath(path: string | URL): string {
  return path instanceof URL ? fileURLToPath(path) : resolve(path)
}

async function readValidatedJson<T extends TSchema>(
  path: string | URL,
  schema: T,
  label: string,
): Promise<Static<T>> {
  let value: unknown

  try {
    value = JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    throw new Error(`Unable to read ${label}`)
  }

  if (!Value.Check(schema, value)) {
    throw new Error(`Invalid ${label}`)
  }

  return value
}

export async function loadGoldenCase(path: string | URL): Promise<GoldenCase> {
  const directory = toFileSystemPath(path)
  const manifest = await readValidatedJson(
    join(directory, 'manifest.json'),
    GoldenCaseManifestSchema,
    'fixture manifest',
  )
  const caseDocument = await readValidatedJson(
    join(directory, 'case.json'),
    GoldenCaseCaseDocumentSchema,
    'fixture case',
  )
  const evidenceDirectory = join(directory, 'evidence')
  const evidenceFileNames = (await readdir(evidenceDirectory))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
  const evidenceDocuments = await Promise.all(
    evidenceFileNames.map((fileName) =>
      readValidatedJson(
        join(evidenceDirectory, fileName),
        GoldenCaseEvidenceDocumentSchema,
        'fixture evidence',
      ),
    ),
  )
  const expectedFacts = await readValidatedJson(
    join(directory, 'expected', 'facts.json'),
    GoldenCaseExpectedFactsSchema,
    'expected facts',
  )
  const expectedTimeline = await readValidatedJson(
    join(directory, 'expected', 'timeline.json'),
    GoldenCaseExpectedTimelineSchema,
    'expected timeline',
  )
  const expectedFindings = await readValidatedJson(
    join(directory, 'expected', 'findings.json'),
    GoldenCaseExpectedFindingsSchema,
    'expected findings',
  )
  const aiFixtures = {
    responsesClassification: await readValidatedJson(
      join(directory, manifest.ai.responsesClassification),
      GoldenCaseAiResponseSchema,
      'AI classification fixture',
    ),
    chatFacts: await readValidatedJson(
      join(directory, manifest.ai.chatFacts),
      GoldenCaseAiResponseSchema,
      'AI facts fixture',
    ),
    chatTimeline: await readValidatedJson(
      join(directory, manifest.ai.chatTimeline),
      GoldenCaseAiResponseSchema,
      'AI timeline fixture',
    ),
    chatStatement: await readValidatedJson(
      join(directory, manifest.ai.chatStatement),
      GoldenCaseAiResponseSchema,
      'AI statement fixture',
    ),
    malformedFirstResponse: await readValidatedJson(
      join(directory, manifest.ai.malformedFirstResponse),
      GoldenCaseAiResponseSchema,
      'AI malformed response fixture',
    ),
    repairedResponse: await readValidatedJson(
      join(directory, manifest.ai.repairedResponse),
      GoldenCaseAiResponseSchema,
      'AI repaired response fixture',
    ),
    expectedMetrics: await readValidatedJson(
      join(directory, manifest.ai.expectedMetrics),
      GoldenCaseExpectedMetricsSchema,
      'AI expected metrics',
    ),
  }

  const authorizedSourceTokens = new Set(manifest.ai.authorizedSourceTokens)
  for (const fixture of [
    aiFixtures.responsesClassification,
    aiFixtures.chatFacts,
    aiFixtures.chatTimeline,
    aiFixtures.chatStatement,
    aiFixtures.repairedResponse,
  ]) {
    validateAiSources(fixture, authorizedSourceTokens)
  }

  if (caseDocument.case.scenarioType !== manifest.scenarioType) {
    throw new Error('Fixture scenario mismatch')
  }

  return {
    manifest,
    case: caseDocument.case,
    evidence: evidenceDocuments.map(({ evidence }) => evidence),
    binaryEvidence: manifest.binaryEvidence,
    ai: aiFixtures,
    expected: {
      confirmedFactFields: expectedFacts.confirmedFactFields,
      confirmedFacts: expectedFacts.confirmedFacts,
      aiExtraction: expectedFacts.aiExtraction,
      timeline: expectedTimeline.timeline,
      findings: expectedFindings.findings,
    },
  }
}
