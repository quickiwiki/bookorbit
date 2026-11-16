import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import {
  CreateVocabularyWordDto,
  MatchVocabularyWordsDto,
  UpdateVocabularyWordDto,
  VocabularyListNameDto,
  VocabularyWordQueryDto,
} from './dto/vocabulary.dto';
import { VocabularyService } from './vocabulary.service';

@Controller('vocabulary')
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get('lists')
  getLists(@CurrentUser() user: RequestUser) {
    return this.vocabularyService.getLists(user);
  }

  @Post('lists')
  createList(@Body() dto: VocabularyListNameDto, @CurrentUser() user: RequestUser) {
    return this.vocabularyService.createList(user, dto.name);
  }

  @Patch('lists/:listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async renameList(@Param('listId', ParseIntPipe) listId: number, @Body() dto: VocabularyListNameDto, @CurrentUser() user: RequestUser) {
    await this.vocabularyService.renameList(user, listId, dto.name);
  }

  @Delete('lists/:listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteList(@Param('listId', ParseIntPipe) listId: number, @CurrentUser() user: RequestUser) {
    await this.vocabularyService.deleteList(user, listId);
  }

  @Get('words')
  getWords(@Query() query: VocabularyWordQueryDto, @CurrentUser() user: RequestUser) {
    return this.vocabularyService.getWords(user, query);
  }

  @Post('words/match')
  @HttpCode(HttpStatus.OK)
  matchWords(@Body() dto: MatchVocabularyWordsDto, @CurrentUser() user: RequestUser) {
    return this.vocabularyService.matchWords(user, dto.words);
  }

  @Post('words')
  addWord(@Body() dto: CreateVocabularyWordDto, @CurrentUser() user: RequestUser) {
    return this.vocabularyService.addWord(user, dto);
  }

  @Patch('words/:wordId')
  updateWord(@Param('wordId', ParseIntPipe) wordId: number, @Body() dto: UpdateVocabularyWordDto, @CurrentUser() user: RequestUser) {
    return this.vocabularyService.updateWord(user, wordId, dto);
  }

  @Delete('words/:wordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWord(@Param('wordId', ParseIntPipe) wordId: number, @CurrentUser() user: RequestUser) {
    await this.vocabularyService.deleteWord(user, wordId);
  }
}
