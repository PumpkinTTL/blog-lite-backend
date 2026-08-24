import request from './request'

/**
 * R2 前端直传 API（绕过后端中转）
 *
 * 流程：前端算 sha256 → 申请 presigned URL（毫秒级）
 *      → 前端 XHR 直传 R2（真实进度）→ 回调后端 confirm 入库
 *
 * 与 r2-storage.ts 的 uploadToR2（后端中转模式）并存，本文件为新方案。
 * 上传字节走原生 XHR，不经过 request.ts 的 10s axios 实例，
 * 避免大文件被全局 timeout 掐断。
 */

/** 直传返回的媒体记录（与 R2Media 一致） */
export interface R2DirectMedia {
  id: number
  filename: string
  originalName: string
  mimeType: string
  size: number
  hash: string
  url: string
  storageType: 'oss'
  ossPlatform: 'cloudflare'
  uploaderId: number
  note: string | null
  createdAt: string
}

/** 进度回调参数：loaded/total 字节，percent 0-100 */
export interface UploadProgress {
  loaded: number
  total: number
  /** 0-100，total 未知时为 -1 */
  percent: number
}

export interface UploadOptions {
  app?: string
  folder?: string
  note?: string
  /** 进度回调（XHR upload.onprogress） */
  onProgress?: (p: UploadProgress) => void
  /** 支持中途取消（AbortController.signal） */
  signal?: AbortSignal
}

/** presign 接口响应（联合类型） */
type PresignResult =
  | { alreadyExists: true; media: R2DirectMedia }
  | { alreadyExists: false; uploadUrl: string; key: string; publicUrl: string }

/**
 * 用 WebCrypto 算文件 sha256（hex）
 * 用于秒传匹配，避免重复上传。
 */
async function computeSha256(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 步骤 1：申请 presigned PUT URL（走 request 实例，很快，10s 够）
 * 命中秒传时返回已有记录，调用方可跳过上传。
 */
async function presign(
  file: File,
  hash: string,
  opts: UploadOptions,
): Promise<PresignResult> {
  const res = await request.post<any>('/media/presign', {
    filename: file.name,
    contentType: file.type,
    size: file.size,
    hash,
    app: opts.app,
    folder: opts.folder,
    note: opts.note,
  })
  return res.data
}

/**
 * 步骤 2：原生 XHR 直传 R2（带真实进度）
 *
 * 用 XHR 而非 axios/fetch 的原因：
 * - 只有 xhr.upload.onprogress 能拿到上传字节进度
 * - 天然无超时（xhr.timeout=0），不会被 axios 10s 掐断
 *
 * @throws 上传失败时抛 Error，message 含 HTTP 状态码 + R2 返回体
 */
function uploadDirect(
  presignedUrl: string,
  file: File,
  opts: UploadOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presignedUrl, true)
    // Content-Type 已签入 presign 签名：PUT 必须携带与 presign 声明（file.type）相同的值，
    // 否则 R2 返回 403 SignatureDoesNotMatch。空 type 时不设头（与 presign 的 undefined 一致）。
    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type)
    }

    // 真实进度回调
    xhr.upload.onprogress = (e) => {
      if (!opts.onProgress) return
      const percent = e.lengthComputable ? (e.loaded / e.total) * 100 : -1
      opts.onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.min(99, percent), // 上传完成不代表响应回来，封顶 99% 留给 confirm
      })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(
          new Error(
            `R2 上传失败 (HTTP ${xhr.status}): ${xhr.responseText?.slice(0, 200) || '无响应体'}`,
          ),
        )
      }
    }

    xhr.onerror = () =>
      reject(new Error('R2 上传网络错误（可能是 CORS 被拦截或网络中断）'))
    xhr.ontimeout = () => reject(new Error('R2 上传超时'))

    // 支持中途取消
    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort()
        reject(new DOMException('上传已取消', 'AbortError'))
        return
      }
      opts.signal.addEventListener(
        'abort',
        () => {
          xhr.abort()
          reject(new DOMException('上传已取消', 'AbortError'))
        },
        { once: true },
      )
    }

    xhr.send(file)
  })
}

/**
 * 步骤 3：回调后端 confirm（HEAD 校验 + 入库）
 * 幂等：同 hash 重复 confirm 直接返回已有记录。
 */
async function confirm(
  params: {
    key: string
    originalName: string
    mimeType: string
    size: number
    hash: string
    note?: string
    app?: string
    folder?: string
  },
): Promise<R2DirectMedia> {
  const res = await request.post<any>('/media/confirm', params)
  return res.data
}

/**
 * 高层：一键 R2 直传（presign → upload → confirm）
 *
 * @returns 上传结果，包含入库后的媒体记录 + url
 * @throws 任一步失败抛 Error（含原因），秒传命中时跳过上传直接返回
 */
export async function uploadToR2Direct(
  file: File,
  opts: UploadOptions = {},
): Promise<{ media: R2DirectMedia; url: string; alreadyExisted: boolean }> {
  // 1. 算 hash（秒传匹配用）
  const hash = await computeSha256(file)

  // 2. 申请 presigned URL（或命中秒传）
  const presignResult = await presign(file, hash, opts)

  // 秒传命中：跳过上传
  if (presignResult.alreadyExists) {
    opts.onProgress?.({ loaded: file.size, total: file.size, percent: 100 })
    return {
      media: presignResult.media,
      url: presignResult.media.url,
      alreadyExisted: true,
    }
  }

  // 3. XHR 直传 R2
  await uploadDirect(presignResult.uploadUrl, file, opts)

  // 4. confirm 入库
  const media = await confirm({
    key: presignResult.key,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    hash,
    note: opts.note,
    app: opts.app,
    folder: opts.folder,
  })

  // 进度收尾到 100%
  opts.onProgress?.({ loaded: file.size, total: file.size, percent: 100 })

  return { media, url: media.url, alreadyExisted: false }
}
