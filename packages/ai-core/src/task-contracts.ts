import { AnalysisTaskTypeSchema } from '@youju/domain'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import {
  BuildTimelineResultSchema,
  type BuildTimelineResult,
} from './timeline.js'
import {
  ClassifyEvidenceResultSchema,
  type ClassifyEvidenceResult,
} from './classification.js'
import {
  DraftStatementResultSchema,
  type DraftStatementResult,
} from './statement.js'
import { ExtractFactsResultSchema, type ExtractFactsResult } from './fact-extraction.js'

export const AiTaskTypeSchema = AnalysisTaskTypeSchema
export type AiTaskType = Static<typeof AiTaskTypeSchema>

export const ClassifyEvidenceWireOutputSchema = ClassifyEvidenceResultSchema
export const ExtractFactsWireOutputSchema = ExtractFactsResultSchema
export const BuildTimelineWireOutputSchema = BuildTimelineResultSchema
export const DraftStatementWireOutputSchema = DraftStatementResultSchema

export const AiTaskOutputSchema = Type.Union([
  ClassifyEvidenceWireOutputSchema,
  ExtractFactsWireOutputSchema,
  BuildTimelineWireOutputSchema,
  DraftStatementWireOutputSchema,
])

export type ClassifyEvidenceWireOutput = ClassifyEvidenceResult
export type ExtractFactsWireOutput = ExtractFactsResult
export type BuildTimelineWireOutput = BuildTimelineResult
export type DraftStatementWireOutput = DraftStatementResult
export type AiTaskOutput = Static<typeof AiTaskOutputSchema>

export function isAiTaskOutput(taskType: unknown, value: unknown): value is AiTaskOutput {
  switch (taskType) {
    case 'classify_evidence':
      return Value.Check(ClassifyEvidenceWireOutputSchema, value)
    case 'extract_facts':
      return Value.Check(ExtractFactsWireOutputSchema, value)
    case 'build_timeline':
      return Value.Check(BuildTimelineWireOutputSchema, value)
    case 'draft_statement':
      return Value.Check(DraftStatementWireOutputSchema, value)
    default:
      return false
  }
}
