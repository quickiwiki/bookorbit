import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { decryptAesGcm, encryptAesGcm, parseAesGcmKey } from '../../common/secrets/aes-gcm-secret';
import type { OxfordCredentials } from './adapters/oxford.adapter';

/** Shares BOOK_REQUEST_ENCRYPTION_KEY with the other stored third-party credentials. */
@Injectable()
export class DictionarySecretsService {
  private readonly logger = new Logger(DictionarySecretsService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    this.key = parseAesGcmKey(config.get<string>('bookRequest.encryptionKey'));
  }

  encrypt(credentials: OxfordCredentials): string {
    if (!this.key) {
      throw new BadRequestException({
        message: 'Set BOOK_REQUEST_ENCRYPTION_KEY before saving dictionary credentials. Generate one with: openssl rand -hex 32',
        errorCode: 'REQUEST_ENCRYPTION_KEY_MISSING',
      });
    }
    return encryptAesGcm(this.key, JSON.stringify(credentials));
  }

  /** Null when the key is missing or changed: the source is then skipped, not crashed on. */
  decrypt(ciphertext: string, sourceId: number): OxfordCredentials | null {
    if (!this.key) {
      this.logger.warn(`[dictionary.secret] [fail] sourceId=${sourceId} errorClass=MissingKey - BOOK_REQUEST_ENCRYPTION_KEY is not set`);
      return null;
    }
    try {
      const parsed = JSON.parse(decryptAesGcm(this.key, ciphertext)) as Partial<OxfordCredentials>;
      if (typeof parsed.appId !== 'string' || typeof parsed.appKey !== 'string') return null;
      return { appId: parsed.appId, appKey: parsed.appKey };
    } catch {
      this.logger.warn(`[dictionary.secret] [fail] sourceId=${sourceId} errorClass=DecryptError - credentials could not be decrypted`);
      return null;
    }
  }
}
