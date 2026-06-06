// server/src/images.ts
// レシート画像のディスク保存（JSON肥大を避ける）。dev用。
// 本番はオブジェクトストレージ(GCS等)に差し替え。

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const IMAGES_DIR = process.env.IMAGES_DIR || resolve(process.cwd(), '../.data-images');

function ensureDir() {
  try { mkdirSync(IMAGES_DIR, { recursive: true }); } catch { /* noop */ }
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic') || mime.includes('heif')) return 'heic';
  return 'jpg';
}

/** base64画像を保存し、保存ファイル名(=image_id)を返す。失敗時 null。 */
export function saveImage(receiptId: string, base64: string, mediaType = 'image/jpeg'): string | null {
  try {
    ensureDir();
    const data = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
    const ext = extFromMime(mediaType);
    const filename = `${receiptId}.${ext}`;
    writeFileSync(join(IMAGES_DIR, filename), Buffer.from(data, 'base64'));
    return filename;
  } catch {
    return null;
  }
}

/** image_id から data URL を復元（詳細画面表示用）。 */
export function readImageDataUrl(imageId: string): string | null {
  try {
    const path = join(IMAGES_DIR, imageId);
    if (!existsSync(path)) return null;
    const ext = imageId.split('.').pop() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
    const b64 = readFileSync(path).toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

export function deleteImage(imageId: string | null | undefined): void {
  if (!imageId) return;
  try { rmSync(join(IMAGES_DIR, imageId), { force: true }); } catch { /* noop */ }
}
