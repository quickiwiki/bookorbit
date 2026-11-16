import { Module } from '@nestjs/common';

import { DictionaryController } from './dictionary.controller';
import { DictionaryRepository } from './dictionary.repository';
import { DictionarySecretsService } from './dictionary-secrets.service';
import { DictionaryService } from './dictionary.service';

@Module({
  controllers: [DictionaryController],
  providers: [DictionaryService, DictionaryRepository, DictionarySecretsService],
})
export class DictionaryModule {}
