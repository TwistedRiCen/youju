import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = join(repositoryRoot, 'apps', 'web', 'dist')

const FIRST_SCREEN_BUDGET_BYTES = 500 * 1024
const APP_SHELL_BUDGET_BYTES = 2 * 1024 * 1024
const DEMO_PREFIX = 'demo/m4-ecommerce-refund-demo-v1/'

interface ManifestChunk {
  file?: string
  css?: string[]
  assets?: string[]
  imports?: string[]
  isEntry?: boolean
}

type Manifest = Record<string, ManifestChunk>

async function gzipSizeKib(path: string): Promise<number> {
  const bytes = await readFile(path)
  return gzipSync(bytes, { level: 9 }).length / 1024
}

async function collectEntryChain(manifest: Manifest): Promise<{ files: string[]; css: string[] }> {
  const entryChunks = Object.values(manifest).filter(
    (chunk) => chunk.isEntry === true && chunk.file !== undefined,
  )
  if (entryChunks.length !== 1) {
    throw new Error(`Vite manifest must have exactly one entry chunk, found ${entryChunks.length}`)
  }
  const entry = entryChunks[0] as ManifestChunk
  const files = new Set<string>()
  const css = new Set<string>()
  const visit = (chunkName: string): void => {
    const chunk = manifest[chunkName]
    if (chunk === undefined) return
    if (chunk.file !== undefined) {
      if (files.has(chunk.file)) return
      files.add(chunk.file)
    }
    for (const asset of chunk.assets ?? []) {
      files.add(asset)
    }
    for (const cssFile of chunk.css ?? []) {
      css.add(cssFile)
    }
    for (const imported of chunk.imports ?? []) {
      visit(imported)
    }
  }
  const entryKey =
    Object.keys(manifest).find((key) => manifest[key]?.file === entry.file) ?? 'index.html'
  visit(entryKey)
  return { files: [...files], css: [...css] }
}

async function main(): Promise<void> {
  const manifestPath = join(distRoot, '.vite', 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest

  const indexHtmlPath = join(distRoot, 'index.html')
  const indexHtmlKib = await gzipSizeKib(indexHtmlPath)
  const { files, css } = await collectEntryChain(manifest)

  const firstScreenKib = (
    await Promise.all([...files, ...css].map(async (file) => gzipSizeKib(join(distRoot, file))))
  ).reduce((sum, kib) => sum + kib, indexHtmlKib)

  console.log(`first-screen: ${firstScreenKib.toFixed(1)} KiB gzip (budget ${FIRST_SCREEN_BUDGET_BYTES / 1024} KiB)`)
  if (firstScreenKib * 1024 > FIRST_SCREEN_BUDGET_BYTES) {
    const rows = await Promise.all(
      [...files, ...css].map(async (file) => ({ file, kib: await gzipSizeKib(join(distRoot, file)) })),
    )
    rows.sort((left, right) => right.kib - left.kib)
    for (const row of rows) {
      console.error(`  over-budget asset: ${row.file} (${row.kib.toFixed(1)} KiB gzip)`)
    }
    throw new Error(
      `first-screen budget exceeded: ${firstScreenKib.toFixed(1)} KiB > ${FIRST_SCREEN_BUDGET_BYTES / 1024} KiB`,
    )
  }

  const swPath = join(distRoot, 'sw.js')
  const swSource = await readFile(swPath, 'utf8')
  const precacheUrls = [...swSource.matchAll(/url:"([^"]+)"/g)].map((match) => match[1] as string)
  if (precacheUrls.length === 0) {
    throw new Error('generated service worker has no precache entries')
  }
  const shellEntries = precacheUrls.filter((url) => !url.startsWith(DEMO_PREFIX))
  const shellKib = (
    await Promise.all(shellEntries.map(async (url) => gzipSizeKib(join(distRoot, url))))
  ).reduce((sum, kib) => sum + kib, 0)

  console.log(
    `app shell precache: ${shellKib.toFixed(1)} KiB gzip excluding demo attachments (budget ${APP_SHELL_BUDGET_BYTES / 1024} KiB)`,
  )
  if (shellKib * 1024 > APP_SHELL_BUDGET_BYTES) {
    const rows = await Promise.all(
      shellEntries.map(async (url) => ({ url, kib: await gzipSizeKib(join(distRoot, url)) })),
    )
    rows.sort((left, right) => right.kib - left.kib)
    for (const row of rows) {
      console.error(`  over-budget precache entry: ${row.url} (${row.kib.toFixed(1)} KiB gzip)`)
    }
    throw new Error(
      `app shell precache budget exceeded: ${shellKib.toFixed(1)} KiB > ${APP_SHELL_BUDGET_BYTES / 1024} KiB`,
    )
  }

  await stat(join(distRoot, 'index.html'))
  console.log('web budgets OK')
}

await main()
