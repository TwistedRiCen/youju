export interface BrowserCapabilities {
  readonly indexedDb: boolean
  readonly opfs: boolean
  readonly webCrypto: boolean
  readonly webLocks: boolean
  readonly broadcastChannel: boolean
  readonly quotaEstimate: boolean
  readonly storagePersistence: boolean
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  return {
    indexedDb: typeof indexedDB !== 'undefined',
    opfs:
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage?.getDirectory === 'function',
    webCrypto:
      typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
    webLocks:
      typeof navigator !== 'undefined' &&
      (navigator as { locks?: LockManager }).locks !== undefined,
    broadcastChannel: typeof BroadcastChannel !== 'undefined',
    quotaEstimate:
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage?.estimate === 'function',
    storagePersistence:
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage?.persist === 'function',
  }
}
