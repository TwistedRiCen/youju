import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtractFactsResult } from '@youju/ai-core'
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
  GoldenCaseExpectedTimelineSchema,
  GoldenCaseManifestSchema,
} from './fixture-schema.js'
import type { GoldenCaseManifest } from './fixture-schema.js'

export interface GoldenCase {
  manifest: GoldenCaseManifest
  case: CaseEvent
  evidence: EvidenceFile[]
  expected: {
    confirmedFactFields: FactFieldName[]
    confirmedFacts: ConfirmedFact[]
    aiExtraction: ExtractFactsResult
    timeline: TimelineEntry[]
    findings: RuleFinding[]
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

  if (caseDocument.case.scenarioType !== manifest.scenarioType) {
    throw new Error('Fixture scenario mismatch')
  }

  return {
    manifest,
    case: caseDocument.case,
    evidence: evidenceDocuments.map(({ evidence }) => evidence),
    expected: {
      confirmedFactFields: expectedFacts.confirmedFactFields,
      confirmedFacts: expectedFacts.confirmedFacts,
      aiExtraction: expectedFacts.aiExtraction,
      timeline: expectedTimeline.timeline,
      findings: expectedFindings.findings,
    },
  }
}
