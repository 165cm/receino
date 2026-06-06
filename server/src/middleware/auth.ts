// server/src/middleware/auth.ts
// MVP認証: ヘッダ x-user-id でユーザーを識別（本番はトークン検証に差し替え）。

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Context } from '../context.js';
import type { User } from '@taberec/core';

export function requireUser(
  ctx: Context,
  req: FastifyRequest,
  reply: FastifyReply,
): User | null {
  const id = req.headers['x-user-id'];
  if (typeof id !== 'string' || !id) {
    reply.code(401).send({ error: 'unauthorized', message: 'x-user-id ヘッダが必要です' });
    return null;
  }
  const user = ctx.repo.getUser(id);
  if (!user) {
    reply.code(401).send({ error: 'unknown_user', message: 'ユーザーが存在しません' });
    return null;
  }
  return user;
}
