// server/src/routes/receipts.ts
// POST /receipts : ドラフト確定保存（★ここで1枚消費）。GET /receipts?month= : 月次取得。
// SSOT §5.3 / §4.2 / §6。

import type { FastifyInstance } from 'fastify';
import { normalizeCategory, reliability, RELIABILITY_DISCLAIMER, isValidL2, l1OfL2, inferL2, type Receipt, type ReceiptItem } from '@receino/core';
import type { Context } from '../context.js';
import { requireUser } from '../middleware/auth.js';
import { newId } from '../util.js';
import { track } from '../track.js';
import { saveImage, readImageDataUrl, deleteImage } from '../images.js';

interface SaveBody {
  store?: string;
  store_address?: string;
  store_phone?: string;
  date?: string;
  total?: number;
  items?: { name?: string; amount?: number; category?: string; canonical_name?: string; l2?: string }[];
  image?: string; // base64（任意）
  mediaType?: string;
}

function normalizeItems(raw: SaveBody['items']): ReceiptItem[] {
  return (raw ?? []).map((i) => {
    const canonical = i.canonical_name?.trim() || undefined;
    const name = i.name ?? '';
    const l2 = isValidL2(i.l2) ? i.l2 : inferL2(canonical || name); // 指定L2優先、無ければ辞書推定
    return {
      name,
      amount: typeof i.amount === 'number' ? i.amount : 0,
      category: normalizeCategory(i.category),
      canonical_name: canonical,
      l2,
      l1: l2 ? l1OfL2(l2) : undefined,
    };
  });
}
function isRealImage(img?: string): boolean {
  return !!img && img.length > 200 && !img.endsWith('SAMPLE') && img !== 'BASE64';
}

export function registerReceiptRoutes(app: FastifyInstance, ctx: Context) {
  // 確定保存。保存成功時のみ1枚消費（§4.2）。
  app.post('/receipts', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const now = ctx.now();
    const body = (req.body ?? {}) as SaveBody;

    // プレミアムは消費しない（無制限）。無料は残高から消費。
    let consumedKind: string | null = null;
    if (!user.is_premium) {
      const res = ctx.credits.consumeOnSave(user.id, now);
      if (!res.consumed) {
        // ★残高0 → 保存せず PayWall（§4.6）
        return reply.code(402).send({
          error: 'no_credits',
          paywall: true,
          message: 'クレジットが不足しています',
          credits: res.view,
        });
      }
      consumedKind = res.kind;
    }

    const items = normalizeItems(body.items);
    const id = newId();
    // 画像があればディスク保存（任意）
    const imageId = isRealImage(body.image) ? saveImage(id, body.image!, body.mediaType) : null;
    const receipt: Receipt = {
      id,
      user_id: user.id,
      store: body.store ?? '',
      store_address: body.store_address?.trim() || undefined,
      store_phone: body.store_phone?.trim() || undefined,
      date: body.date || now.toISOString().slice(0, 10),
      total: typeof body.total === 'number' ? body.total : items.reduce((s, i) => s + i.amount, 0),
      items,
      image_id: imageId,
      created_at: now.toISOString(),
    };
    ctx.repo.addReceipt(receipt);
    track(ctx, user.id, 'receipt_saved', { consumed_kind: consumedKind, premium: user.is_premium, total: receipt.total, items: items.length }); // §8

    const count = ctx.repo.countReceipts(user.id);
    return reply.code(201).send({
      receipt,
      consumed_kind: consumedKind,
      credits: ctx.credits.getBalance(user.id, now),
      reliability: { score: reliability(count), n: count, disclaimer: RELIABILITY_DISCLAIMER },
    });
  });

  // 記録の削除。SSOT §3.2。
  app.delete('/receipts/:id', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const existing = ctx.repo.getReceipt(user.id, id);
    const ok = ctx.repo.deleteReceipt(user.id, id);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    deleteImage(existing?.image_id); // 画像も削除
    return reply.send({ deleted: true });
  });

  // 個別取得（詳細画面用）。画像は data URL で同梱。SSOT §3.2。
  app.get('/receipts/:id', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const receipt = ctx.repo.getReceipt(user.id, id);
    if (!receipt) return reply.code(404).send({ error: 'not_found' });
    const image = receipt.image_id ? readImageDataUrl(receipt.image_id) : null;
    return reply.send({ receipt, image });
  });

  // 再編集（記録の更新）。SSOT §3.2。
  app.patch('/receipts/:id', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as SaveBody;
    const patch: Record<string, unknown> = { updated_at: ctx.now().toISOString() };
    if (body.store !== undefined) patch.store = body.store;
    if (body.store_address !== undefined) patch.store_address = body.store_address.trim() || undefined;
    if (body.store_phone !== undefined) patch.store_phone = body.store_phone.trim() || undefined;
    if (body.date !== undefined) patch.date = body.date;
    if (body.items !== undefined) {
      const items = normalizeItems(body.items);
      patch.items = items;
      patch.total = typeof body.total === 'number' ? body.total : items.reduce((s, i) => s + i.amount, 0);
    } else if (body.total !== undefined) {
      patch.total = body.total;
    }
    const updated = ctx.repo.updateReceipt(user.id, id, patch);
    if (!updated) return reply.code(404).send({ error: 'not_found' });
    track(ctx, user.id, 'receipt_edited'); // §8
    return reply.send({ receipt: updated });
  });

  // 取得 + 合計 + 信頼度。SSOT §3.2 ホーム/記録一覧, §6。
  //  month="YYYY-MM" を指定 → その月。month="all" または未指定 → 全期間。
  app.get('/receipts', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const q = req.query as { month?: string };
    const all = ctx.repo.listReceipts(user.id);
    // 利用可能な月の一覧（新しい順）。月切替UI用。
    const months = Array.from(new Set(all.map((r) => r.date.slice(0, 7)).filter(Boolean))).sort().reverse();

    const useAll = q.month === 'all' || !q.month;
    const month = useAll ? 'all' : q.month!;
    const receipts = useAll ? all : all.filter((r) => r.date.startsWith(month));
    const total = receipts.reduce((s, r) => s + r.total, 0);
    const n = receipts.length;
    const byCategory: Record<string, number> = {};
    for (const r of receipts)
      for (const it of r.items)
        byCategory[it.category] = (byCategory[it.category] ?? 0) + it.amount;

    return reply.send({
      month,
      months,
      count: n,
      total,
      receipts,
      by_category: byCategory,
      reliability: { score: reliability(n), n, disclaimer: RELIABILITY_DISCLAIMER },
    });
  });
}
