import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DB } from '../../db';
import * as schema from '../../db/schema';

type Db = NodePgDatabase<typeof schema>;

const t = schema.inviteLinks;

/** Not revoked, not expired, and not used up. */
function usable() {
  return and(isNull(t.revokedAt), or(isNull(t.expiresAt), gt(t.expiresAt, sql`now()`)), or(isNull(t.maxUses), lt(t.useCount, t.maxUses)));
}

@Injectable()
export class InviteLinkRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(data: { code: string; label: string; maxUses: number | null; expiresAt: Date | null; createdBy: number }) {
    const [row] = await this.db.insert(t).values(data).returning();
    return row;
  }

  async findAll() {
    const creator = alias(schema.users, 'creator');
    return this.db
      .select({
        id: t.id,
        code: t.code,
        label: t.label,
        maxUses: t.maxUses,
        useCount: t.useCount,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
        revokedAt: t.revokedAt,
        createdByUsername: creator.username,
      })
      .from(t)
      .leftJoin(creator, eq(creator.id, t.createdBy))
      .orderBy(desc(t.createdAt));
  }

  async isUsable(code: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.code, code), usable()))
      .limit(1);
    return Boolean(row);
  }

  /**
   * Takes one use of the link inside the caller's transaction, so a sign-up that fails afterwards
   * gives the use back. Returns false when the link cannot be used.
   */
  async consume(tx: Pick<Db, 'update'>, code: string): Promise<boolean> {
    const [row] = await tx
      .update(t)
      .set({ useCount: sql`${t.useCount} + 1` })
      .where(and(eq(t.code, code), usable()))
      .returning({ id: t.id });
    return Boolean(row);
  }

  async revoke(id: number) {
    const [row] = await this.db.update(t).set({ revokedAt: new Date() }).where(eq(t.id, id)).returning({ id: t.id });
    return row ?? null;
  }
}
