import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validatePublicDemoAt } from '../../scripts/validate-public-demo.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('public demo release validator', () => {
  it.each([
    'binary/nested/unmanaged.pdf',
    'unmanaged.pdf',
    'extra/unmanaged.bin',
  ])('rejects unmanaged public file %s', async (relativePath) => {
    const root = await mkdtemp(join(tmpdir(), 'youju-public-demo-'))
    temporaryDirectories.push(root)
    await cp(
      resolve('apps/web/public/demo/m4-ecommerce-refund-demo-v1'),
      root,
      { recursive: true },
    )
    await mkdir(join(root, relativePath, '..'), { recursive: true })
    await writeFile(join(root, relativePath), 'not declared')

    await expect(validatePublicDemoAt(root)).rejects.toThrow(
      'Public demo contains missing or unmanaged files',
    )
  })
})
