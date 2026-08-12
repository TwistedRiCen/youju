import { describe, expect, it } from 'vitest'
import {
  PROMPT_CATALOG,
  getPrompt,
  getTaskPrompt,
  type PromptId,
} from '../src/ai/prompt-catalog.js'

describe('prompt catalog', () => {
  it('contains every versioned prompt required by the M3 adapter boundary', () => {
    const ids: readonly PromptId[] = [
      'connection-v1',
      'classify-evidence-v1',
      'extract-facts-v1',
      'build-timeline-v1',
      'draft-statement-v1',
      'repair-structured-output-v1',
    ]

    for (const id of ids) {
      const prompt = getPrompt(id)
      expect(prompt.version).toBe(id)
      expect(prompt.system).toContain('untrusted data')
      expect(prompt.system).toContain('external access')
      expect(prompt.system).toContain('legal conclusions')
    }
  })

  it('maps every task to a stable task prompt and requires exact source tokens', () => {
    for (const taskType of ['classify_evidence', 'extract_facts', 'build_timeline', 'draft_statement'] as const) {
      const prompt = getTaskPrompt(taskType)
      expect(prompt.version).toBe(`${taskType.replace('_', '-').replace('classify-evidence', 'classify-evidence')}-v1`)
      expect(prompt.system).toContain('sourceToken')
      expect(prompt.instruction).toContain(taskType)
    }
  })

  it('does not expose mutable catalog entries', () => {
    expect(Object.isFrozen(PROMPT_CATALOG)).toBe(true)
    expect(Object.isFrozen(getPrompt('connection-v1'))).toBe(true)
  })
})
