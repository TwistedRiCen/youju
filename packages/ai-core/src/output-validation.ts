import {
  type ConfirmedFact,
  type FactFieldName,
  type UuidV4,
} from '@youju/domain'
import { Value } from '@sinclair/typebox/value'
import {
  isAiTaskOutput,
  type AiTaskType,
  type BuildTimelineWireOutput,
  type ClassifyEvidenceWireOutput,
  type DraftStatementWireOutput,
  type ExtractFactsWireOutput,
} from './task-contracts.js'
import {
  type AiCandidate,
  type AiFactCandidate,
  type AiTimelineCandidate,
  type CandidateConflict,
  type CandidateConflictInput,
  type CandidateSourceLocation,
  type EvidenceClassificationCandidate,
  type AiStatementCandidate,
  isAiFactCandidate,
  isAiTimelineCandidate,
} from './candidates.js'
import {
  InputManifestSchema,
  type InputManifest,
  type InputManifestItem,
  validateInputManifest,
} from './input-manifest.js'
import type { SourceLocation } from './source-location.js'

interface LocalizedSources {
  readonly sourceRefs: readonly { readonly evidenceId: UuidV4 }[]
  readonly sourceLocations: readonly CandidateSourceLocation[]
}

function validationError(code: string): Error {
  return new Error(code)
}

function uniqueSourceRefs(locations: readonly CandidateSourceLocation[]): readonly { readonly evidenceId: UuidV4 }[] {
  const seen = new Set<UuidV4>()
  const refs: { readonly evidenceId: UuidV4 }[] = []
  for (const location of locations) {
    if (!seen.has(location.evidenceId)) {
      seen.add(location.evidenceId)
      refs.push({ evidenceId: location.evidenceId })
    }
  }
  return refs
}

function resolveSourceLocation(
  source: SourceLocation,
  manifestItems: ReadonlyMap<string, InputManifestItem>,
): CandidateSourceLocation {
  const item = manifestItems.get(source.sourceToken)
  if (item === undefined) {
    throw validationError('unknown_source_token')
  }

  if (source.page !== undefined && source.page !== item.page) {
    throw validationError('source_page_mismatch')
  }

  if (source.region !== undefined) {
    const { x, y, width, height } = source.region
    if (
      width <= 0 ||
      height <= 0 ||
      x + width > item.pixelWidth ||
      y + height > item.pixelHeight
    ) {
      throw validationError('invalid_source_region')
    }
  }

  return {
    evidenceId: item.evidenceId,
    page: item.page,
    pixelWidth: item.pixelWidth,
    pixelHeight: item.pixelHeight,
    ...(source.region === undefined ? {} : { region: source.region }),
  }
}

function resolveSources(
  sources: readonly SourceLocation[],
  manifestItems: ReadonlyMap<string, InputManifestItem>,
): LocalizedSources {
  const sourceTokens = new Set<string>()
  const locations: CandidateSourceLocation[] = []
  for (const source of sources) {
    if (sourceTokens.has(source.sourceToken)) {
      throw validationError('duplicate_source_token')
    }
    sourceTokens.add(source.sourceToken)
    locations.push(resolveSourceLocation(source, manifestItems))
  }
  return {
    sourceRefs: uniqueSourceRefs(locations),
    sourceLocations: locations,
  }
}

function candidateBase(
  id: UuidV4,
  caseId: UuidV4,
  analysisVersionId: UuidV4,
  candidateType: CandidateBaseType,
  confidenceLevel: 'high' | 'needs_confirmation' | 'conflicted' | 'unknown',
  createdAt: string,
  sources: LocalizedSources,
) {
  return {
    id,
    caseId,
    analysisVersionId,
    candidateType,
    origin: 'ai' as const,
    reviewStatus: 'pending' as const,
    createdAt,
    confidenceLevel,
    sourceRefs: sources.sourceRefs,
    sourceLocations: sources.sourceLocations,
  }
}

type CandidateBaseType = 'classification' | 'fact' | 'timeline' | 'statement'

function localizeFacts(
  output: ExtractFactsWireOutput,
  input: LocalizeTaskOutputInput,
  manifestItems: ReadonlyMap<string, InputManifestItem>,
): readonly AiFactCandidate[] {
  return output.facts.map((fact) => {
    const sources = resolveSources(fact.sources, manifestItems)
    return {
      ...candidateBase(
        input.idFactory(),
        input.caseId,
        input.analysisVersionId,
        'fact',
        fact.confidenceLevel,
        input.createdAt,
        sources,
      ),
      factType: fact.factType,
      fieldName: fact.fieldName,
      value: fact.value,
      normalizedValue: fact.normalizedValue,
    } as AiFactCandidate
  })
}

function localizeClassifications(
  output: ClassifyEvidenceWireOutput,
  input: LocalizeTaskOutputInput,
  manifestItems: ReadonlyMap<string, InputManifestItem>,
): readonly EvidenceClassificationCandidate[] {
  return output.classifications.map((classification) => {
    const sources = resolveSources([{ sourceToken: classification.sourceToken }], manifestItems)
    return {
      ...candidateBase(
        input.idFactory(),
        input.caseId,
        input.analysisVersionId,
        'classification',
        classification.confidenceLevel,
        input.createdAt,
        sources,
      ),
      evidenceId: sources.sourceRefs[0]?.evidenceId,
      category: classification.category,
      value: classification.category,
      normalizedValue: classification.category,
    } as EvidenceClassificationCandidate
  })
}

function localizeTimeline(
  output: BuildTimelineWireOutput,
  input: LocalizeTaskOutputInput,
  manifestItems: ReadonlyMap<string, InputManifestItem>,
): readonly AiTimelineCandidate[] {
  return output.entries.map((entry) => {
    const sources = resolveSources(entry.sources, manifestItems)
    return {
      ...candidateBase(
        input.idFactory(),
        input.caseId,
        input.analysisVersionId,
        'timeline',
        entry.confidenceLevel,
        input.createdAt,
        sources,
      ),
      occurredAt: entry.occurredAt,
      timePrecision: entry.timePrecision,
      summary: entry.summary,
      detail: entry.detail,
    } as AiTimelineCandidate
  })
}

function localizeStatement(
  output: DraftStatementWireOutput,
  input: LocalizeTaskOutputInput,
): readonly AiStatementCandidate[] {
  return [{
    ...candidateBase(
      input.idFactory(),
      input.caseId,
      input.analysisVersionId,
      'statement',
      'high',
      input.createdAt,
      { sourceRefs: [], sourceLocations: [] },
    ),
    text: output.text,
    confirmedFactIds: output.confirmedFactIds,
    confirmedTimelineEntryIds: output.confirmedTimelineEntryIds,
  } as AiStatementCandidate]
}

export interface LocalizeTaskOutputInput {
  readonly analysisVersionId: UuidV4
  readonly caseId: UuidV4
  readonly taskType: AiTaskType
  readonly manifest: InputManifest
  readonly output: unknown
  readonly createdAt: string
  readonly idFactory: () => UuidV4
}

export function localizeTaskOutput(input: LocalizeTaskOutputInput): readonly AiCandidate[] {
  if (!Value.Check(InputManifestSchema, input.manifest)) {
    throw validationError('invalid_input_manifest')
  }
  validateInputManifest(input.manifest)
  if (input.manifest.caseId !== input.caseId) {
    throw validationError('case_id_mismatch')
  }
  if (!isAiTaskOutput(input.taskType, input.output)) {
    throw validationError('invalid_structured_output')
  }

  const manifestItems = new Map(
    input.manifest.items.map((item) => [item.sourceToken, item] as const),
  )

  switch (input.taskType) {
    case 'classify_evidence':
      return localizeClassifications(input.output as ClassifyEvidenceWireOutput, input, manifestItems)
    case 'extract_facts':
      return localizeFacts(input.output as ExtractFactsWireOutput, input, manifestItems)
    case 'build_timeline':
      return localizeTimeline(input.output as BuildTimelineWireOutput, input, manifestItems)
    case 'draft_statement':
      return localizeStatement(input.output as DraftStatementWireOutput, input)
  }
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

function normalizeConfirmedFact(fact: ConfirmedFact): string {
  if (fact.fieldName === 'paid_amount') {
    return fact.value.replace('.', '')
  }
  return normalizeText(fact.value)
}

function addConflict(
  conflicts: CandidateConflict[],
  conflict: CandidateConflict,
): void {
  const duplicate = conflicts.some((item) =>
    item.candidateId === conflict.candidateId &&
    item.type === conflict.type &&
    item.conflictingRecordId === conflict.conflictingRecordId,
  )
  if (!duplicate) {
    conflicts.push(conflict)
  }
}

export function detectCandidateConflicts(input: CandidateConflictInput): readonly CandidateConflict[] {
  const conflicts: CandidateConflict[] = []
  const factsByField = new Map<FactFieldName, AiFactCandidate[]>()

  for (const candidate of input.candidates) {
    if (!isAiFactCandidate(candidate)) {
      continue
    }
    const sameField = factsByField.get(candidate.fieldName) ?? []
    for (const previous of sameField) {
      if (previous.normalizedValue !== candidate.normalizedValue) {
        addConflict(conflicts, {
          candidateId: previous.id,
          type: 'candidate_value_conflict',
          fieldName: candidate.fieldName,
        })
        addConflict(conflicts, {
          candidateId: candidate.id,
          type: 'candidate_value_conflict',
          fieldName: candidate.fieldName,
        })
      }
    }
    sameField.push(candidate)
    factsByField.set(candidate.fieldName, sameField)

    for (const formalFact of input.currentFacts) {
      if (
        formalFact.fieldName === candidate.fieldName &&
        normalizeConfirmedFact(formalFact) !== candidate.normalizedValue
      ) {
        addConflict(conflicts, {
          candidateId: candidate.id,
          type: 'formal_fact_conflict',
          conflictingRecordId: formalFact.id,
          fieldName: candidate.fieldName,
        })
      }
    }
  }

  for (const candidate of input.candidates) {
    if (!isAiTimelineCandidate(candidate)) {
      continue
    }
    for (const formalTimeline of input.currentTimeline) {
      const sameTime = candidate.occurredAt === formalTimeline.occurredAt
      const sameSummary = normalizeText(candidate.summary) === normalizeText(formalTimeline.summary)
      if ((sameTime && !sameSummary) || (!sameTime && sameSummary)) {
        addConflict(conflicts, {
          candidateId: candidate.id,
          type: 'formal_timeline_conflict',
          conflictingRecordId: formalTimeline.id,
        })
      }
    }
  }

  return conflicts
}
