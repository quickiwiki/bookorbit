import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import type { Readable } from 'stream';
import type { DictionarySource, ExternalDictionaryResult } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import type { DictionarySourceRow } from '../../db/schema';
import { dictionaryKey } from './adapters/dictionary-key';
import { displayHeadword, languageCode, indexHeadword, parseDsl, type DslHeader } from './adapters/dsl-parser';
import { renderDslBody } from './adapters/dsl-render';
import { lookupOxford } from './adapters/oxford.adapter';
import { languagesFromFilename, parseTabfile, renderTabfileBody } from './adapters/tabfile';
import { DictionaryRepository } from './dictionary.repository';
import { DictionarySecretsService } from './dictionary-secrets.service';
import { CreateOxfordSourceDto, UpdateDictionarySourceDto } from './dto/dictionary.dto';

const IMPORT_BATCH_SIZE = 1000;
const IMPORT_BATCH_FORMS = 20000;
const MAX_HEADWORD_LENGTH = 500;
const MAX_LOOKUP_SOURCES = 10;
const MAX_LOOKUP_CANDIDATES = 6;
const MAX_CARDS_PER_SOURCE = 5;
const INTERRUPTED_IMPORT_MESSAGE = 'Import was interrupted by a server restart. Upload the file again.';

function toSource(row: DictionarySourceRow, viewerId: number, ownerName: string | null = null): DictionarySource {
  const owned = row.userId === viewerId;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    enabled: row.enabled,
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    status: row.status,
    entryCount: row.entryCount,
    error: row.error,
    hasCredentials: row.encryptedCredentials !== null,
    oxfordEnvironment: row.oxfordEnvironment,
    shared: row.shared,
    owned,
    ownerName: owned ? null : ownerName,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `en-US`, `EN` and `en_GB` all mean `en` for picking a dictionary. */
export function primaryLanguage(lang: string | null | undefined): string | null {
  const primary = lang?.trim().toLowerCase().split(/[-_]/)[0];
  return primary ? primary : null;
}

/**
 * Lookup keys for a stored dictionary: the word itself first, then, for English, naive base
 * forms so "running" or "studies" still reach a card when only lemmas are indexed. Russian and
 * Turkish Wiktionary exports list their inflected forms, so those need no guessing.
 */
export function lookupCandidates(word: string, lang: string | null = null): string[] {
  const base = dictionaryKey(word, lang);
  const candidates = [base];
  if (lang !== null && lang !== 'en') return candidates;
  const add = (value: string) => {
    if (value.length >= 2 && !candidates.includes(value)) candidates.push(value);
  };
  if (base.endsWith('ies')) add(`${base.slice(0, -3)}y`);
  if (base.endsWith('es')) add(base.slice(0, -2));
  if (base.endsWith('s')) add(base.slice(0, -1));
  for (const suffix of ['ing', 'ed']) {
    if (!base.endsWith(suffix)) continue;
    const stem = base.slice(0, -suffix.length);
    add(stem);
    if (/([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1));
    add(`${stem}e`);
  }
  return candidates.slice(0, MAX_LOOKUP_CANDIDATES);
}

/**
 * Many cards list the same inflected form ("running" is a form of both "run" and the dialectal
 * "rin"). A card titled with the looked-up word itself is the most direct answer, so it goes
 * first; the rest keep candidate order, then file order.
 */
export function rankCards<T extends { headword: string; rank: number }>(cards: T[], candidates: string[], lang: string | null, word = ''): T[] {
  const titled = (card: T) => (dictionaryKey(card.headword, lang) === candidates[card.rank] ? 0 : 1);
  const shouted = word.length > 1 && word === word.toLocaleUpperCase() && word !== word.toLocaleLowerCase();
  const spelled = (card: T) => {
    if (!shouted && card.headword === word) return 0;
    return card.headword === card.headword.toLocaleLowerCase() ? 1 : 2;
  };
  return cards
    .map((card, order) => ({ card, order, titled: titled(card), spelled: spelled(card) }))
    .sort((a, b) => a.card.rank - b.card.rank || a.titled - b.titled || a.spelled - b.spelled || a.order - b.order)
    .slice(0, MAX_CARDS_PER_SOURCE)
    .map((x) => x.card);
}

const DSL_FILE = /\.dsl(\.dz)?$/i;
const TABFILE_FILE = /\.(tsv|tab|txt)(\.gz)?$/i;

export function uploadKind(filename: string): 'dsl' | 'tabfile' | null {
  if (DSL_FILE.test(filename)) return 'dsl';
  if (TABFILE_FILE.test(filename)) return 'tabfile';
  return null;
}

export interface DictionaryUpload {
  file: Readable;
  filename: string;
  isTruncated: () => boolean;
  /** Overrides what the file header or name says. */
  sourceLang?: string | null;
  targetLang?: string | null;
}

interface ParsedCard {
  headword: string;
  body: string;
  forms: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class DictionaryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DictionaryService.name);

  constructor(
    private readonly repository: DictionaryRepository,
    private readonly secrets: DictionarySecretsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const failed = await this.repository.failInterruptedImports(INTERRUPTED_IMPORT_MESSAGE);
    if (failed > 0) this.logger.warn(`[dictionary.import_recovery] [end] failed=${failed} - interrupted dictionary imports marked failed`);
  }

  async listSources(user: RequestUser): Promise<DictionarySource[]> {
    return (await this.repository.listVisibleSources(user.id)).map(({ source, ownerName }) => toSource(source, user.id, ownerName));
  }

  async createOxfordSource(user: RequestUser, dto: CreateOxfordSourceDto): Promise<DictionarySource> {
    const row = await this.repository.createSource({
      userId: user.id,
      kind: 'oxford',
      name: dto.name,
      sourceLang: primaryLanguage(dto.sourceLang),
      targetLang: primaryLanguage(dto.targetLang),
      oxfordEnvironment: dto.environment,
      encryptedCredentials: this.secrets.encrypt({ appId: dto.appId.trim(), appKey: dto.appKey.trim() }),
    });
    return toSource(row, user.id);
  }

  async updateSource(user: RequestUser, sourceId: number, dto: UpdateDictionarySourceDto): Promise<DictionarySource> {
    const source = await this.ownedSource(user, sourceId);
    this.assertLanguageEditable(source, dto);
    const row = await this.repository.updateSource(sourceId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.sourceLang !== undefined ? { sourceLang: primaryLanguage(dto.sourceLang) } : {}),
      ...(dto.targetLang !== undefined ? { targetLang: primaryLanguage(dto.targetLang) } : {}),
    });
    return toSource(row, user.id);
  }

  /**
   * Shares a file dictionary with every user (the controller requires the app-settings permission).
   * Oxford sources stay private: sharing one would spend its owner's API quota on everyone's lookups.
   */
  async setShared(user: RequestUser, sourceId: number, shared: boolean): Promise<DictionarySource> {
    const source = await this.ownedSource(user, sourceId);
    if (source.kind === 'oxford') throw new BadRequestException('Oxford dictionaries use personal API keys and cannot be shared');
    if (shared && source.status !== 'ready') throw new BadRequestException('Only a fully imported dictionary can be shared');
    const row = await this.repository.updateSource(sourceId, { shared });
    this.logger.log(`[dictionary.share] [end] sourceId=${sourceId} userId=${user.id} shared=${shared} - dictionary sharing changed`);
    return toSource(row, user.id);
  }

  async deleteSource(user: RequestUser, sourceId: number): Promise<void> {
    const source = await this.ownedSource(user, sourceId);
    if (source.status === 'importing') throw new BadRequestException('Wait for the import to finish before deleting this dictionary');
    const startedAt = Date.now();
    this.logger.log(
      `[dictionary.delete] [start] sourceId=${sourceId} userId=${user.id} kind=${source.kind} entries=${source.entryCount} - deleting dictionary`,
    );
    await this.repository.deleteSource(sourceId);
    this.logger.log(`[dictionary.delete] [end] sourceId=${sourceId} userId=${user.id} durationMs=${Date.now() - startedAt} - dictionary deleted`);
  }

  /**
   * Streams the upload straight into the database in batches, so a dictionary of any size
   * imports in bounded memory. `entryCount` is updated per batch for progress polling.
   */
  async importFile(user: RequestUser, upload: DictionaryUpload): Promise<DictionarySource> {
    const kind = uploadKind(upload.filename);
    if (!kind) throw new BadRequestException('Upload a Lingvo .dsl/.dsl.dz file or a tab-separated .tsv/.txt dictionary');

    const fallbackName = upload.filename.replace(DSL_FILE, '').replace(TABFILE_FILE, '').trim() || 'Dictionary';
    const fromName = kind === 'tabfile' ? languagesFromFilename(upload.filename) : { sourceLang: null, targetLang: null };
    let sourceLang = primaryLanguage(upload.sourceLang) ?? fromName.sourceLang;
    let targetLang = primaryLanguage(upload.targetLang) ?? fromName.targetLang;
    let name = fallbackName.slice(0, 200);

    const source = await this.repository.createSource({ userId: user.id, kind, name, status: 'importing', sourceLang, targetLang });
    const startedAt = Date.now();
    this.logger.log(
      `[dictionary.import] [start] sourceId=${source.id} userId=${user.id} kind=${kind} lang=${sourceLang ?? 'unknown'} file="${sanitizeLogValue(upload.filename)}" - dictionary import started`,
    );

    let imported = 0;
    let batch: ParsedCard[] = [];
    let batchForms = 0;

    const flush = async () => {
      await this.repository.insertEntries(source.id, batch);
      imported += batch.length;
      batch = [];
      batchForms = 0;
      await this.repository.updateSource(source.id, { entryCount: imported });
    };

    const onDslHeader = (header: DslHeader) => {
      name = header.name?.slice(0, 200) || name;
      sourceLang ??= languageCode(header.indexLanguage);
      targetLang ??= languageCode(header.contentsLanguage);
    };

    try {
      const cards = kind === 'dsl' ? parseDsl(upload.file, onDslHeader) : parseTabfile(upload.file);
      for await (const card of cards) {
        const parsed = this.toCard(kind, card.headwords, card.body, sourceLang);
        if (!parsed) continue;
        batch.push(parsed);
        batchForms += parsed.forms.length;
        if (batch.length >= IMPORT_BATCH_SIZE || batchForms >= IMPORT_BATCH_FORMS) await flush();
      }
      await flush();

      if (upload.isTruncated()) throw new BadRequestException('The dictionary file is larger than the upload limit');
      if (imported === 0) throw new BadRequestException('No dictionary entries were found in this file');

      const row = await this.repository.updateSource(source.id, { status: 'ready', entryCount: imported, name, sourceLang, targetLang });
      this.logger.log(
        `[dictionary.import] [end] sourceId=${source.id} userId=${user.id} durationMs=${Date.now() - startedAt} entries=${imported} - dictionary import completed`,
      );
      return toSource(row, user.id);
    } catch (error) {
      const message = error instanceof BadRequestException ? error.message : 'The dictionary file could not be read';
      this.logger.warn(
        `[dictionary.import] [fail] sourceId=${source.id} userId=${user.id} durationMs=${Date.now() - startedAt} entries=${imported} errorClass=${(error as Error)?.name ?? 'Error'} error="${sanitizeLogValue(errorMessage(error))}" - dictionary import failed`,
      );
      await this.repository.deleteEntries(source.id);
      await this.repository.updateSource(source.id, { status: 'failed', entryCount: 0, error: message.slice(0, 500) });
      throw error instanceof BadRequestException ? error : new BadRequestException(message);
    }
  }

  private toCard(kind: 'dsl' | 'tabfile', headwords: string[], body: string, lang: string | null): ParsedCard | null {
    const display = kind === 'dsl' ? displayHeadword(headwords[0] ?? '') : (headwords[0] ?? '');
    const indexed = kind === 'dsl' ? headwords.map(indexHeadword) : headwords;
    const forms = [...new Set(indexed.map((h) => dictionaryKey(h, lang).slice(0, MAX_HEADWORD_LENGTH)).filter(Boolean))];
    if (!display.trim() || forms.length === 0) return null;
    return { headword: display.trim().slice(0, MAX_HEADWORD_LENGTH), body, forms };
  }

  /** Re-indexing every form is what a language change would need; refuse it instead of leaving stale keys. */
  private assertLanguageEditable(source: DictionarySourceRow, dto: UpdateDictionarySourceDto) {
    if (source.kind === 'oxford' || dto.sourceLang === undefined) return;
    if (primaryLanguage(dto.sourceLang) !== source.sourceLang) {
      throw new BadRequestException('The word language of an imported dictionary is fixed. Upload the file again to change it.');
    }
  }

  async lookup(user: RequestUser, word: string, lang: string | undefined): Promise<ExternalDictionaryResult[]> {
    const wanted = primaryLanguage(lang);
    const sources = (await this.repository.enabledReadySources(user.id))
      .filter((s) => !wanted || !s.sourceLang || s.sourceLang === wanted)
      .slice(0, MAX_LOOKUP_SOURCES);

    const results = await Promise.all(sources.map((source) => this.lookupInSource(source, word, wanted)));
    return results.filter((r): r is ExternalDictionaryResult => r !== null);
  }

  private async lookupInSource(source: DictionarySourceRow, word: string, lang: string | null): Promise<ExternalDictionaryResult | null> {
    const base = { sourceId: source.id, sourceName: source.name, provider: source.kind, targetLang: source.targetLang };
    try {
      if (source.kind !== 'oxford') {
        const candidates = lookupCandidates(word, source.sourceLang);
        const rows = rankCards(await this.repository.findEntries(source.id, candidates), candidates, source.sourceLang, word.trim());
        if (rows.length === 0) return null;
        const render = source.kind === 'dsl' ? renderDslBody : renderTabfileBody;
        const entries = rows.flatMap((row) => render(row.headword, row.body));
        if (entries.length === 0) return null;
        return { ...base, word: rows[0]!.headword, phonetic: null, audioUrl: null, entries };
      }

      const credentials = source.encryptedCredentials ? this.secrets.decrypt(source.encryptedCredentials, source.id) : null;
      if (!credentials || !source.oxfordEnvironment) return null;
      const sourceLang = source.sourceLang ?? lang ?? 'en';
      const result = await lookupOxford({ environment: source.oxfordEnvironment, credentials, word, sourceLang, targetLang: source.targetLang });
      return result ? { ...base, ...result } : null;
    } catch (error) {
      this.logger.warn(
        `[dictionary.lookup] [fail] sourceId=${source.id} kind=${source.kind} errorClass=${(error as Error)?.name ?? 'Error'} error="${sanitizeLogValue(errorMessage(error))}" - dictionary lookup failed`,
      );
      return null;
    }
  }

  private async ownedSource(user: RequestUser, sourceId: number): Promise<DictionarySourceRow> {
    const source = await this.repository.findSource(sourceId);
    if (!source) throw new NotFoundException('Dictionary not found');
    if (source.userId !== user.id) throw new ForbiddenException('No access to this dictionary');
    return source;
  }
}
