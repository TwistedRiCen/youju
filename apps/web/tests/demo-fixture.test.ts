import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PUBLIC_DEMO_MAX_ASSET_BYTES,
  parsePublicDemoFixture,
  verifyPublicDemoAssets,
} from '../src/demo/demo-fixture.js'

const bytes = new TextEncoder().encode('fictional evidence')
const sha256 = createHash('sha256').update(bytes).digest('hex')

const validManifest = () => ({
  fixtureId: 'm4-ecommerce-refund-demo-v1',
  fixtureVersion: 1,
  fictional: true,
  case: {
    token: 'case-main',
    scenarioType: 'ecommerce_refund',
    title: '运输破损退款纠纷（完全虚构）',
    createdAt: '2026-07-04T02:00:00.000Z',
    updatedAt: '2026-07-04T02:30:00.000Z',
    status: 'in_progress',
    requestedResolution: '退货并退还已支付金额89900分',
    storageMode: 'local',
    schemaVersion: 2,
    dataOrigin: 'fictional_demo',
    demoFixtureId: 'm4-ecommerce-refund-demo-v1',
  },
  evidence: [
    {
      token: 'evidence-order',
      caseToken: 'case-main',
      originalName: '01-order-record.png',
      mediaType: 'image/png',
      size: bytes.length,
      sha256,
      importedAt: '2026-07-04T02:01:00.000Z',
      sourceCreatedAt: '2026-07-01T12:16:00.000Z',
      category: 'order_record',
      assetPath: 'binary/01-order-record.png',
      metadataPath: 'evidence/01-order-record.json',
      description: '完全虚构的订单记录示例',
    },
  ],
  facts: [
    {
      token: 'fact-purchase-time',
      caseToken: 'case-main',
      factType: 'order',
      fieldName: 'purchase_time',
      value: '2026-07-01T12:16:00.000Z',
      sourceTokens: ['evidence-order'],
      confirmedAt: '2026-07-04T02:10:00.000Z',
      confirmationMethod: 'manual',
      version: 1,
    },
  ],
  timeline: [
    {
      token: 'timeline-purchase',
      caseToken: 'case-main',
      occurredAt: '2026-07-01T12:16:00.000Z',
      timePrecision: 'minute',
      summary: '用户下单并完成付款',
      detail: '在示例商城购买虚构商品',
      sourceTokens: ['evidence-order'],
      contentOrigin: 'manual',
      status: 'confirmed',
      sortOrder: 1,
    },
  ],
  statement: {
    token: 'statement-confirmed',
    caseToken: 'case-main',
    content: '本人确认以上内容仅为完全虚构的公开演示案例。',
    factTokens: ['fact-purchase-time'],
    timelineTokens: ['timeline-purchase'],
    confirmedAt: '2026-07-04T02:30:00.000Z',
    confirmationMethod: 'manual',
  },
})

const cloneManifest = () => structuredClone(validManifest())

describe('public demo fixture contract', () => {
  it('accepts the approved fictional template manifest', () => {
    expect(parsePublicDemoFixture(validManifest())).toEqual(validManifest())
  })

  it.each([
    '../outside.png',
    '/absolute.png',
    String.raw`binary\\outside.png`,
    'https://example.test/evidence.png',
    '//example.test/evidence.png',
    'binary/file.png?download=1',
    'binary/file.png#fragment',
  ])('rejects unsafe public asset path %s', (assetPath) => {
    const manifest = cloneManifest()
    manifest.evidence[0]!.assetPath = assetPath

    expect(() => parsePublicDemoFixture(manifest)).toThrow('Public demo fixture is invalid')
  })

  it('rejects unknown fields at every contract boundary', () => {
    const topLevel = { ...validManifest(), provider: 'forbidden' }
    const nested = cloneManifest() as ReturnType<typeof validManifest> & {
      case: ReturnType<typeof validManifest>['case'] & { unknown?: boolean }
    }
    nested.case.unknown = true

    expect(() => parsePublicDemoFixture(topLevel)).toThrow('Public demo fixture is invalid')
    expect(() => parsePublicDemoFixture(nested)).toThrow('Public demo fixture is invalid')
  })

  it('rejects non-fictional identity and persisted UUID template ids', () => {
    const notFictional = cloneManifest()
    notFictional.case.dataOrigin = 'user_created'
    const uuidToken = cloneManifest()
    uuidToken.case.token = '00000000-0000-4000-8000-000000000001'

    expect(() => parsePublicDemoFixture(notFictional)).toThrow('Public demo fixture is invalid')
    expect(() => parsePublicDemoFixture(uuidToken)).toThrow('Public demo fixture is invalid')
  })

  it('rejects duplicate tokens and broken references', () => {
    const duplicate = cloneManifest()
    duplicate.facts[0]!.token = duplicate.evidence[0]!.token
    const brokenCase = cloneManifest()
    brokenCase.timeline[0]!.caseToken = 'missing-case'
    const brokenSource = cloneManifest()
    brokenSource.facts[0]!.sourceTokens = ['missing-evidence']
    const brokenStatement = cloneManifest()
    brokenStatement.statement.timelineTokens = ['missing-timeline']

    for (const invalid of [duplicate, brokenCase, brokenSource, brokenStatement]) {
      expect(() => parsePublicDemoFixture(invalid)).toThrow('Public demo fixture is invalid')
    }
  })

  it('rejects duplicate tokens within the same template collection', () => {
    const manifest = cloneManifest()
    manifest.evidence.push({
      ...manifest.evidence[0]!,
      assetPath: 'binary/02-order-record.png',
      metadataPath: 'evidence/02-order-record.json',
    })

    expect(() => parsePublicDemoFixture(manifest)).toThrow('Public demo fixture is invalid')
  })

  it('accepts only manually confirmed timeline content and valid fact discriminators', () => {
    const candidateTimeline = cloneManifest()
    candidateTimeline.timeline[0]!.contentOrigin = 'candidate_confirmed'
    const mismatchedFact = cloneManifest()
    mismatchedFact.facts[0]!.factType = 'payment'

    expect(() => parsePublicDemoFixture(candidateTimeline)).toThrow(
      'Public demo fixture is invalid',
    )
    expect(() => parsePublicDemoFixture(mismatchedFact)).toThrow('Public demo fixture is invalid')
  })

  it('rejects personal-data and secret-like text without echoing the value', () => {
    const manifest = cloneManifest()
    const secret = 'sk-' + 'a'.repeat(32)
    manifest.statement.content = secret

    let error: unknown
    try {
      parsePublicDemoFixture(manifest)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('Public demo fixture is invalid')
    expect(String(error)).not.toContain(secret)
  })
})

describe('public demo asset verification', () => {
  it('accepts bytes whose size and SHA-256 match the manifest', async () => {
    const manifest = parsePublicDemoFixture(validManifest())

    await expect(verifyPublicDemoAssets(manifest, async () => bytes)).resolves.toEqual({
      assetCount: 1,
      totalBytes: bytes.length,
    })
  })

  it('rejects size and SHA-256 mismatches', async () => {
    const sizeMismatch = cloneManifest()
    sizeMismatch.evidence[0]!.size += 1
    const hashMismatch = cloneManifest()
    hashMismatch.evidence[0]!.sha256 = '0'.repeat(64)

    await expect(
      verifyPublicDemoAssets(parsePublicDemoFixture(sizeMismatch), async () => bytes),
    ).rejects.toThrow('Public demo asset verification failed')
    await expect(
      verifyPublicDemoAssets(parsePublicDemoFixture(hashMismatch), async () => bytes),
    ).rejects.toThrow('Public demo asset verification failed')
  })

  it('rejects manifests whose declared assets exceed the public budget', async () => {
    const manifest = cloneManifest()
    manifest.evidence[0]!.size = PUBLIC_DEMO_MAX_ASSET_BYTES + 1

    await expect(
      verifyPublicDemoAssets(parsePublicDemoFixture(manifest), async () => bytes),
    ).rejects.toThrow('Public demo asset verification failed')
  })
})
