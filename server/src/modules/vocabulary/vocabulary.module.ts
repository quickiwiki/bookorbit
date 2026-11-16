import { Module } from '@nestjs/common';

import { BookModule } from '../book/book.module';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyRepository } from './vocabulary.repository';
import { VocabularyService } from './vocabulary.service';

@Module({
  imports: [BookModule],
  controllers: [VocabularyController],
  providers: [VocabularyService, VocabularyRepository],
})
export class VocabularyModule {}
