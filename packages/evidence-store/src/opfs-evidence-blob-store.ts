import type { UuidV4 } from '@youju/domain'
import { EvidenceBlobStoreError } from './evidence-blob-store.js'
import type { EvidenceBlobStore, StagedEvidenceBlob } from './evidence-blob-store.js'
import { evidenceStoragePath, temporaryStoragePath } from './opfs-paths.js'

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

function toStoreError(error: unknown): EvidenceBlobStoreError {
  if (error instanceof EvidenceBlobStoreError) {
    return error
  }
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') {
    return new EvidenceBlobStoreError('not_allowed', '浏览器拒绝了本地文件存储')
  }
  if (name === 'QuotaExceededError') {
    return new EvidenceBlobStoreError('quota_exceeded', '本地存储空间不足')
  }
  return new EvidenceBlobStoreError('storage_unavailable', '本地文件存储不可用')
}

async function resolveDirectoryHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let current: FileSystemDirectoryHandle = root
  for (const segment of path.split('/')) {
    if (segment === '') {
      continue
    }
    try {
      current = await current.getDirectoryHandle(segment, { create })
    } catch (error) {
      if (!create && isNotFoundError(error)) {
        return null
      }
      throw toStoreError(error)
    }
  }
  return current
}

async function resolveFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle | null> {
  const segments = path.split('/').filter((segment) => segment !== '')
  const name = segments.at(-1)
  if (name === undefined) {
    throw new EvidenceBlobStoreError('storage_unavailable', '无效的存储路径')
  }
  const parent = await resolveDirectoryHandle(root, segments.slice(0, -1).join('/'), create)
  if (parent === null) {
    return null
  }
  try {
    return await parent.getFileHandle(name, { create })
  } catch (error) {
    if (!create && isNotFoundError(error)) {
      return null
    }
    throw toStoreError(error)
  }
}

async function removePath(
  root: FileSystemDirectoryHandle,
  path: string,
  recursive: boolean,
): Promise<void> {
  const segments = path.split('/').filter((segment) => segment !== '')
  const name = segments.at(-1)
  if (name === undefined) {
    return
  }
  const parent = await resolveDirectoryHandle(root, segments.slice(0, -1).join('/'), false)
  if (parent === null) {
    return
  }
  try {
    await parent.removeEntry(name, { recursive })
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw toStoreError(error)
    }
  }
}

interface AsyncIterableDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

export class OpfsEvidenceBlobStore implements EvidenceBlobStore {
  private rootPromise: Promise<FileSystemDirectoryHandle> | null = null

  private root(): Promise<FileSystemDirectoryHandle> {
    if (this.rootPromise === null) {
      try {
        this.rootPromise = navigator.storage.getDirectory().catch((error: unknown) => {
          throw toStoreError(error)
        })
      } catch (error) {
        throw toStoreError(error)
      }
    }
    return this.rootPromise
  }

  async stage(
    operationId: UuidV4,
    chunks: AsyncIterable<Uint8Array>,
  ): Promise<StagedEvidenceBlob> {
    const root = await this.root()
    const path = temporaryStoragePath(operationId)
    const fileHandle = await resolveFileHandle(root, path, true)
    if (fileHandle === null) {
      throw new EvidenceBlobStoreError('storage_unavailable', '无法创建临时文件')
    }

    const writable = await fileHandle.createWritable()
    let size = 0
    try {
      for await (const chunk of chunks) {
        await writable.write(chunk as Uint8Array<ArrayBuffer>)
        size += chunk.byteLength
      }
      await writable.close()
    } catch (error) {
      await writable.close().catch(() => undefined)
      throw toStoreError(error)
    }

    return { operationId, temporaryStorageRef: path, size }
  }

  async commit(
    staged: StagedEvidenceBlob,
    caseId: UuidV4,
    evidenceId: UuidV4,
  ): Promise<string> {
    const root = await this.root()
    const temporaryHandle = await resolveFileHandle(root, staged.temporaryStorageRef, false)
    if (temporaryHandle === null) {
      throw new EvidenceBlobStoreError('storage_unavailable', '临时文件不存在')
    }
    const temporaryFile = await temporaryHandle.getFile()
    if (temporaryFile.size !== staged.size) {
      throw new EvidenceBlobStoreError('storage_unavailable', '临时文件大小不匹配')
    }

    const finalPath = evidenceStoragePath(caseId, evidenceId)
    const finalHandle = await resolveFileHandle(root, finalPath, true)
    if (finalHandle === null) {
      throw new EvidenceBlobStoreError('storage_unavailable', '无法创建正式文件')
    }
    const writable = await finalHandle.createWritable()
    try {
      const stream = temporaryFile.stream() as unknown as AsyncIterable<Uint8Array>
      for await (const chunk of stream) {
        await writable.write(chunk as Uint8Array<ArrayBuffer>)
      }
      await writable.close()
    } catch (error) {
      await writable.close().catch(() => undefined)
      throw toStoreError(error)
    }

    const finalFile = await finalHandle.getFile()
    if (finalFile.size !== staged.size) {
      await removePath(root, finalPath, false).catch(() => undefined)
      throw new EvidenceBlobStoreError('storage_unavailable', '正式文件大小不匹配')
    }
    await removePath(root, staged.temporaryStorageRef, false)
    return finalPath
  }

  async read(storageRef: string): Promise<Blob> {
    const root = await this.root()
    const fileHandle = await resolveFileHandle(root, storageRef, false)
    if (fileHandle === null) {
      throw new EvidenceBlobStoreError('storage_unavailable', '文件不存在')
    }
    return fileHandle.getFile()
  }

  async exists(storageRef: string): Promise<boolean> {
    const root = await this.root()
    const fileHandle = await resolveFileHandle(root, storageRef, false)
    return fileHandle !== null
  }

  async delete(storageRef: string): Promise<void> {
    const root = await this.root()
    await removePath(root, storageRef, false)
  }

  async deleteTemporary(operationId: UuidV4): Promise<void> {
    const root = await this.root()
    await removePath(root, temporaryStoragePath(operationId), false)
  }

  async listCaseStorageRefs(caseId: UuidV4): Promise<readonly string[]> {
    const root = await this.root()
    const directory = await resolveDirectoryHandle(
      root,
      `cases/${caseId}/evidence`,
      false,
    )
    if (directory === null) {
      return []
    }
    const refs: string[] = []
    const entries = (directory as unknown as AsyncIterableDirectoryHandle).entries()
    for await (const [name] of entries) {
      refs.push(`cases/${caseId}/evidence/${name}`)
    }
    return refs.sort()
  }

  async deleteCase(caseId: UuidV4): Promise<void> {
    const root = await this.root()
    await removePath(root, `cases/${caseId}`, true)
  }
}
