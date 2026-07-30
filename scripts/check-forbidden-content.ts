import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ForbiddenContentRuleId =
  | 'environment-file'
  | 'fixture-mainland-mobile'
  | 'openai-secret'
  | 'real-user-data-marker'
  | 'real-user-material-marker'

export interface ForbiddenContentFinding {
  path: string
  ruleId: ForbiddenContentRuleId
}

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'reports',
  'test-results',
])
const SKIPPED_FILES = new Set(['pnpm-lock.yaml'])
const POLICY_REFERENCE_FILES = new Set(['docs/development/first-codex-prompt.md'])
const POLICY_REFERENCE_DIRECTORIES = ['docs/superpowers/plans/']
const SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]{20,}\b/
const MAINLAND_MOBILE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/
const ENGLISH_REAL_DATA_MARKER = 'REAL_' + 'USER_DATA'
const CHINESE_REAL_MATERIAL_MARKER = '真实用户' + '材料'

const toRepositoryPath = (root: string, path: string) => relative(root, path).split(sep).join('/')

const isEnvironmentFile = (path: string) => {
  const fileName = path.split('/').at(-1)
  return fileName !== '.env.example' && (fileName === '.env' || fileName?.startsWith('.env.'))
}

const isPolicyReference = (path: string) =>
  POLICY_REFERENCE_FILES.has(path) ||
  POLICY_REFERENCE_DIRECTORIES.some((directory) => path.startsWith(directory))

const isFixturePath = (path: string) => path.split('/').includes('fixtures')

const collectFilePaths = async (root: string, directory = root): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths: string[] = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) {
      continue
    }

    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        paths.push(...(await collectFilePaths(root, path)))
      }
      continue
    }

    if (entry.isFile() && !SKIPPED_FILES.has(entry.name)) {
      paths.push(path)
    }
  }

  return paths
}

const scanText = (path: string, content: string): ForbiddenContentRuleId[] => {
  const ruleIds: ForbiddenContentRuleId[] = []

  if (SECRET_PATTERN.test(content)) {
    ruleIds.push('openai-secret')
  }
  if (content.includes(ENGLISH_REAL_DATA_MARKER)) {
    ruleIds.push('real-user-data-marker')
  }
  if (content.includes(CHINESE_REAL_MATERIAL_MARKER)) {
    ruleIds.push('real-user-material-marker')
  }
  if (isFixturePath(path) && MAINLAND_MOBILE_PATTERN.test(content)) {
    ruleIds.push('fixture-mainland-mobile')
  }

  return ruleIds
}

export const scanRepository = async (root: string): Promise<ForbiddenContentFinding[]> => {
  const repositoryRoot = resolve(root)
  const findings: ForbiddenContentFinding[] = []

  for (const filePath of await collectFilePaths(repositoryRoot)) {
    const path = toRepositoryPath(repositoryRoot, filePath)
    if (isEnvironmentFile(path)) {
      findings.push({ path, ruleId: 'environment-file' })
    }
    if (isPolicyReference(path)) {
      continue
    }

    const content = await readFile(filePath)
    if (content.includes(0)) {
      continue
    }

    for (const ruleId of scanText(path, content.toString('utf8'))) {
      findings.push({ path, ruleId })
    }
  }

  return findings.sort(
    (left, right) => left.path.localeCompare(right.path) || left.ruleId.localeCompare(right.ruleId),
  )
}

const run = async () => {
  const findings = await scanRepository(process.cwd())
  if (findings.length === 0) {
    console.log('PASS forbidden-content: no forbidden content found')
    return
  }

  for (const finding of findings) {
    console.error(`FAIL ${finding.path}: ${finding.ruleId}`)
  }
  process.exitCode = 1
}

const entryPoint = process.argv[1]
if (entryPoint && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  await run()
}
