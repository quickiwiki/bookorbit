import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import {
  dictionaryEntries,
  dictionaryForms,
  dictionarySources,
  type DictionarySourceRow,
  type NewDictionaryEntry,
  type NewDictionaryForm,
  type NewDictionarySource,
  users,
} from '../../db/schema';

type Db = NodePgDatabase<typeof schema>;

const MAX_ROWS_PER_CANDIDATE = 10;
const FORM_INSERT_CHUNK = 5000;

@Injectable()
export class DictionaryRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The user's own dictionaries, then ready ones other users shared, with who shared them. */
  async listVisibleSources(userId: number): Promise<{ source: DictionarySourceRow; ownerName: string }[]> {
    return this.db
      .select({ source: dictionarySources, ownerName: users.name })
      .from(dictionarySources)
      .innerJoin(users, eq(users.id, dictionarySources.userId))
      .where(or(eq(dictionarySources.userId, userId), and(eq(dictionarySources.shared, true), eq(dictionarySources.status, 'ready'))))
      .orderBy(desc(sql`${dictionarySources.userId} = ${userId}`), asc(dictionarySources.id));
  }

  async findSource(sourceId: number): Promise<DictionarySourceRow | null> {
    const [row] = await this.db.select().from(dictionarySources).where(eq(dictionarySources.id, sourceId)).limit(1);
    return row ?? null;
  }

  async createSource(data: NewDictionarySource): Promise<DictionarySourceRow> {
    const [row] = await this.db.insert(dictionarySources).values(data).returning();
    return row!;
  }

  async updateSource(sourceId: number, data: Partial<NewDictionarySource>): Promise<DictionarySourceRow> {
    const [row] = await this.db.update(dictionarySources).set(data).where(eq(dictionarySources.id, sourceId)).returning();
    return row!;
  }

  async deleteSource(sourceId: number): Promise<void> {
    await this.db.delete(dictionarySources).where(eq(dictionarySources.id, sourceId));
  }

  /**
   * Inserts cards and the forms that find them. Ids are reserved from the sequence first so each
   * form can point at its card without relying on the order Postgres returns inserted rows in.
   */
  async insertEntries(sourceId: number, cards: { headword: string; body: string; forms: string[] }[]): Promise<void> {
    if (cards.length === 0) return;
    const reserved = await this.db.execute<{ id: string }>(
      sql`select nextval(pg_get_serial_sequence('dictionary_entries', 'id')) as id from generate_series(1, ${cards.length})`,
    );
    const ids = reserved.rows.map((r) => Number(r.id));
    const entries: NewDictionaryEntry[] = cards.map((card, i) => ({ id: ids[i]!, sourceId, headword: card.headword, body: card.body }));
    const forms: NewDictionaryForm[] = cards.flatMap((card, i) =>
      card.forms.map((normalizedForm) => ({ sourceId, entryId: ids[i]!, normalizedForm })),
    );

    await this.db.transaction(async (tx) => {
      await tx.insert(dictionaryEntries).values(entries);
      for (let i = 0; i < forms.length; i += FORM_INSERT_CHUNK) {
        await tx.insert(dictionaryForms).values(forms.slice(i, i + FORM_INSERT_CHUNK));
      }
    });
  }

  async deleteEntries(sourceId: number): Promise<void> {
    await this.db.delete(dictionaryEntries).where(eq(dictionaryEntries.sourceId, sourceId));
  }

  /** Imports cut off by a restart can never finish; they are marked failed so the user re-uploads. */
  async failInterruptedImports(message: string): Promise<number> {
    const rows = await this.db
      .update(dictionarySources)
      .set({ status: 'failed', error: message })
      .where(eq(dictionarySources.status, 'importing'))
      .returning({ id: dictionarySources.id });
    return rows.length;
  }

  /**
   * Dictionaries a lookup may use: the user's own and shared ones, own first so a user's choice
   * wins. A shared dictionary its owner switched off is off for everyone.
   */
  async enabledReadySources(userId: number): Promise<DictionarySourceRow[]> {
    return this.db
      .select()
      .from(dictionarySources)
      .where(
        and(
          or(eq(dictionarySources.userId, userId), eq(dictionarySources.shared, true)),
          eq(dictionarySources.enabled, true),
          eq(dictionarySources.status, 'ready'),
        ),
      )
      .orderBy(desc(sql`${dictionarySources.userId} = ${userId}`), asc(dictionarySources.id));
  }

  /** Cards matching any candidate, best candidate first; the caller picks the final few. */
  async findEntries(sourceId: number, candidates: string[]) {
    if (candidates.length === 0) return [];
    const rows = await this.db
      .select({ id: dictionaryEntries.id, headword: dictionaryEntries.headword, body: dictionaryEntries.body, form: dictionaryForms.normalizedForm })
      .from(dictionaryForms)
      .innerJoin(dictionaryEntries, eq(dictionaryEntries.id, dictionaryForms.entryId))
      .where(and(eq(dictionaryForms.sourceId, sourceId), inArray(dictionaryForms.normalizedForm, candidates)))
      .orderBy(asc(dictionaryEntries.id))
      .limit(MAX_ROWS_PER_CANDIDATE * candidates.length);

    const best = new Map<number, { headword: string; body: string; rank: number }>();
    for (const row of rows) {
      const rank = candidates.indexOf(row.form);
      const seen = best.get(row.id);
      if (!seen || rank < seen.rank) best.set(row.id, { headword: row.headword, body: row.body, rank });
    }
    return [...best.values()].sort((a, b) => a.rank - b.rank);
  }
}
