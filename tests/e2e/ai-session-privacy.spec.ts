import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const sentinel = 'fictional-api-key-sentinel-browser-task-7'

async function readPersistentSurfaces(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const values = [
      ...Array.from({ length: localStorage.length }, (_, index) => {
        const storageKey = localStorage.key(index)
        return storageKey === null ? '' : `${storageKey}=${localStorage.getItem(storageKey) ?? ''}`
      }),
      ...Array.from({ length: sessionStorage.length }, (_, index) => {
        const storageKey = sessionStorage.key(index)
        return storageKey === null ? '' : `${storageKey}=${sessionStorage.getItem(storageKey) ?? ''}`
      }),
      document.cookie,
      JSON.stringify(history.state),
      document.documentElement.outerHTML,
    ]

    if ('caches' in window) {
      for (const cacheName of await caches.keys()) {
        values.push(cacheName)
        const cache = await caches.open(cacheName)
        for (const request of await cache.keys()) {
          values.push(request.url)
          values.push(await (await cache.match(request))?.text() ?? '')
        }
      }
    }

    if ('indexedDB' in window && 'databases' in indexedDB) {
      for (const database of await indexedDB.databases()) {
        if (database.name === undefined) {
          continue
        }
        values.push(database.name)
        await new Promise<void>((resolve) => {
          const request = indexedDB.open(database.name as string)
          request.onerror = () => resolve()
          request.onsuccess = () => {
            const opened = request.result
            const storeNames = Array.from(opened.objectStoreNames)
            if (storeNames.length === 0) {
              opened.close()
              resolve()
              return
            }
            let remaining = storeNames.length
            for (const storeName of storeNames) {
              const transaction = opened.transaction(storeName, 'readonly')
              const getAll = transaction.objectStore(storeName).getAll()
              getAll.onsuccess = () => {
                values.push(JSON.stringify(getAll.result))
                remaining -= 1
                if (remaining === 0) {
                  opened.close()
                  resolve()
                }
              }
              getAll.onerror = () => {
                remaining -= 1
                if (remaining === 0) {
                  opened.close()
                  resolve()
                }
              }
            }
          }
        })
      }
    }

    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
      const walk = async (directory: FileSystemDirectoryHandle): Promise<void> => {
        for await (const entry of directory.values()) {
          if (entry.kind === 'file') {
            values.push(await (await entry.getFile()).text())
          } else {
            await walk(entry)
          }
        }
      }
      await walk(await navigator.storage.getDirectory())
    }

    return values.join('\n')
  })
}

test('keeps BYOK session in memory and clears it after a full reload', async ({ page }) => {
  await page.goto('/')

  const beforeReload = await page.evaluate(async (apiKey) => {
    const module = await import('/src/ai/index.ts')
    module.disableAi()
    module.setAiSession({
      providerPreset: 'openai',
      protocol: 'responses',
      baseUrl: 'https://api.example.test/v1',
      modelName: 'fictional-model',
      apiKey,
      capabilities: {
        text: true,
        vision: true,
        jsonMode: true,
        jsonSchema: true,
        streaming: true,
      },
      consentMode: 'session_convenience',
      connectionTestedAt: '2026-08-12T08:00:00.000Z',
    })
    return {
      apiKey: module.getAiSession()?.apiKey ?? null,
      consentMode: module.getAiConsentMode(),
    }
  }, sentinel)

  expect(beforeReload).toEqual({ apiKey: sentinel, consentMode: 'session_convenience' })
  expect(await readPersistentSurfaces(page)).not.toContain(sentinel)

  await page.reload()
  const afterReload = await page.evaluate(async () => {
    const module = await import('/src/ai/index.ts')
    return {
      session: module.getAiSession(),
      consentMode: module.getAiConsentMode(),
    }
  })

  expect(afterReload).toEqual({ session: null, consentMode: 'strict' })
  expect(await readPersistentSurfaces(page)).not.toContain(sentinel)
})
