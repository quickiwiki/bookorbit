import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { OxfordEnvironment } from '@bookorbit/types';

import { VOCABULARY_WORD_MAX_LENGTH } from '@bookorbit/types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/;

export class CreateOxfordSourceDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  appId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  appKey!: string;

  @IsIn(['sandbox', 'production'])
  environment!: OxfordEnvironment;

  @Transform(trim)
  @Matches(LANGUAGE_PATTERN)
  sourceLang!: string;

  @IsOptional()
  @Transform(trim)
  @Matches(LANGUAGE_PATTERN)
  targetLang?: string | null;
}

export class ShareDictionarySourceDto {
  @IsBoolean()
  shared!: boolean;
}

export class UpdateDictionarySourceDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Transform(trim)
  @Matches(LANGUAGE_PATTERN)
  sourceLang?: string | null;

  @IsOptional()
  @Transform(trim)
  @Matches(LANGUAGE_PATTERN)
  targetLang?: string | null;
}

export class DictionaryLookupQueryDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(VOCABULARY_WORD_MAX_LENGTH)
  word!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(35)
  lang?: string;
}

export class DictionaryUploadQueryDto {
  @IsOptional()
  @Transform(trim)
  @Matches(LANGUAGE_PATTERN)
  sourceLang?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(LANGUAGE_PATTERN)
  targetLang?: string;
}
