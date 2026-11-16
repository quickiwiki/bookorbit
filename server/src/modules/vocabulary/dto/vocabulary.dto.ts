import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  VOCABULARY_CONTEXT_MAX_LENGTH,
  VOCABULARY_DEFINITION_MAX_LENGTH,
  VOCABULARY_LIST_NAME_MAX_LENGTH,
  VOCABULARY_MATCH_MAX_WORDS,
  VOCABULARY_PAGE_SIZE_MAX,
  VOCABULARY_WORD_MAX_LENGTH,
  VOCABULARY_WORD_SORTS,
} from '@bookorbit/types';
import type { VocabularyLearnedFilter, VocabularyWordSort } from '@bookorbit/types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class VocabularyListNameDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(VOCABULARY_LIST_NAME_MAX_LENGTH)
  name!: string;
}

export class CreateVocabularyWordDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  listId?: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(VOCABULARY_WORD_MAX_LENGTH)
  word!: string;

  @IsOptional()
  @IsString()
  @MaxLength(VOCABULARY_DEFINITION_MAX_LENGTH)
  definition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(VOCABULARY_CONTEXT_MAX_LENGTH)
  context?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  bookId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  bookFileId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bookFormat?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bookTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cfi?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  pageno?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  language?: string | null;
}

export class UpdateVocabularyWordDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  listId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(VOCABULARY_DEFINITION_MAX_LENGTH)
  definition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(VOCABULARY_CONTEXT_MAX_LENGTH)
  context?: string | null;

  @IsOptional()
  @IsBoolean()
  learned?: boolean;
}

export class MatchVocabularyWordsDto {
  @IsArray()
  @ArrayMaxSize(VOCABULARY_MATCH_MAX_WORDS)
  @IsString({ each: true })
  @MaxLength(VOCABULARY_WORD_MAX_LENGTH, { each: true })
  words!: string[];
}

export class VocabularyWordQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  listId?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(VOCABULARY_WORD_MAX_LENGTH)
  q?: string;

  @IsOptional()
  @IsIn(['all', 'learning', 'learned'])
  learned?: VocabularyLearnedFilter;

  @IsOptional()
  @IsIn(VOCABULARY_WORD_SORTS)
  sort?: VocabularyWordSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(VOCABULARY_PAGE_SIZE_MAX)
  pageSize?: number;
}
