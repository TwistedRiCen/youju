import { OpfsEvidenceBlobStore } from '@youju/evidence-store'
import type { CaseRepository, StoredCase } from '../storage/index.js'
import { getCaseRepository } from '../services/case-service.js'
import { deleteDemoCasePermanently } from '../services/delete-case-service.js'
import { recoverLocalOperations } from '../services/recover-local-operations.js'
import {
  DemoCaseLoadError,
  persistDemoCase,
  type DemoCaseLoaderDependencies,
} from './demo-case-loader.js'
import {
  PUBLIC_DEMO_FIXTURE_ID,
  parsePublicDemoFixture,
} from './demo-fixture.js'

export interface DemoCaseServiceDependencies
  extends Omit<DemoCaseLoaderDependencies, 'readAsset'> {
  readonly loadManifest: (fixtureId: string) => Promise<unknown>
  readonly readAsset: (fixtureId: string, relativePath: string) => Promise<Uint8Array>
}

export type LoadDemoCaseResult = {
  readonly status: 'loaded' | 'existing'
  readonly caseId: string
}

const assertFixtureId = (fixtureId: string) => {
  if (fixtureId !== PUBLIC_DEMO_FIXTURE_ID) {
    throw new DemoCaseLoadError('invalid_fixture')
  }
}

const fetchSameOrigin = async (path: string) => {
  const url = new URL(path, window.location.origin)
  if (url.origin !== window.location.origin) {
    throw new DemoCaseLoadError('invalid_fixture')
  }
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
  })
  if (!response.ok || new URL(response.url).origin !== window.location.origin) {
    throw new DemoCaseLoadError('invalid_fixture')
  }
  return response
}

const createBrowserDependencies = async (): Promise<DemoCaseServiceDependencies> => {
  const dependencies = {
    repository: await getCaseRepository(),
    blobStore: new OpfsEvidenceBlobStore(),
    loadManifest: async (fixtureId: string) =>
      (await fetchSameOrigin(`/demo/${fixtureId}/manifest.json`)).json(),
    readAsset: async (fixtureId: string, relativePath: string) =>
      new Uint8Array(
        await (await fetchSameOrigin(`/demo/${fixtureId}/${relativePath}`)).arrayBuffer(),
      ),
  }
  return typeof navigator.storage?.estimate === 'function'
    ? { ...dependencies, estimateStorage: async () => navigator.storage.estimate() }
    : dependencies
}

const resolveDependencies = (dependencies?: DemoCaseServiceDependencies) =>
  dependencies === undefined ? createBrowserDependencies() : Promise.resolve(dependencies)

const fixtureQueues = new Map<string, Promise<void>>()

const runFixtureExclusive = async <T>(fixtureId: string, action: () => Promise<T>) => {
  const previous = fixtureQueues.get(fixtureId) ?? Promise.resolve()
  let release: () => void = () => {}
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  fixtureQueues.set(fixtureId, current)
  await previous
  try {
    if (typeof navigator !== 'undefined' && navigator.locks != null) {
      return await navigator.locks.request(`youju-demo:${fixtureId}`, action)
    }
    return await action()
  } finally {
    release()
    if (fixtureQueues.get(fixtureId) === current) fixtureQueues.delete(fixtureId)
  }
}

export async function findDemoCase(
  fixtureId: string,
  repository?: CaseRepository,
): Promise<StoredCase | null> {
  assertFixtureId(fixtureId)
  const resolvedRepository = repository ?? (await getCaseRepository())
  const matches = (await resolvedRepository.listCases()).filter(
    ({ caseEvent }) =>
      caseEvent.dataOrigin === 'fictional_demo' && caseEvent.demoFixtureId === fixtureId,
  )
  if (matches.length > 1) throw new DemoCaseLoadError('demo_case_ambiguous')
  return matches[0] ?? null
}

export async function loadDemoCase(
  fixtureId: string,
  dependencies?: DemoCaseServiceDependencies,
): Promise<LoadDemoCaseResult> {
  assertFixtureId(fixtureId)
  const resolved = await resolveDependencies(dependencies)
  return runFixtureExclusive(fixtureId, async () => {
    await recoverLocalOperations(resolved)
    const existing = await findDemoCase(fixtureId, resolved.repository)
    if (existing !== null) return { status: 'existing', caseId: existing.caseEvent.id }

    const manifest = parsePublicDemoFixture(await resolved.loadManifest(fixtureId))
    const result = await persistDemoCase(manifest, {
      ...resolved,
      readAsset: (relativePath) => resolved.readAsset(fixtureId, relativePath),
    })
    return { status: 'loaded', caseId: result.caseId }
  })
}

export async function resetDemoCase(
  fixtureId: string,
  dependencies?: DemoCaseServiceDependencies,
): Promise<LoadDemoCaseResult> {
  assertFixtureId(fixtureId)
  const resolved = await resolveDependencies(dependencies)
  return runFixtureExclusive(fixtureId, async () => {
    await recoverLocalOperations(resolved)
    const existing = await findDemoCase(fixtureId, resolved.repository)
    if (existing !== null) {
      const deletion = await deleteDemoCasePermanently(
        existing.caseEvent,
        fixtureId,
        resolved,
      )
      if (deletion.status !== 'deleted' || (await findDemoCase(fixtureId, resolved.repository))) {
        throw new DemoCaseLoadError('delete_verification_failed')
      }
    }
    const manifest = parsePublicDemoFixture(await resolved.loadManifest(fixtureId))
    const result = await persistDemoCase(manifest, {
      ...resolved,
      readAsset: (relativePath) => resolved.readAsset(fixtureId, relativePath),
    })
    return { status: 'loaded', caseId: result.caseId }
  })
}
