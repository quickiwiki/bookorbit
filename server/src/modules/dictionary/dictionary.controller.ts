import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Permission } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForbidPermission } from '../../common/decorators/forbid-permission.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { MultipartRequest } from '../../common/types/multipart-request';
import type { RequestUser } from '../../common/types/request-user';
import { DictionaryService } from './dictionary.service';
import {
  CreateOxfordSourceDto,
  DictionaryLookupQueryDto,
  DictionaryUploadQueryDto,
  ShareDictionarySourceDto,
  UpdateDictionarySourceDto,
} from './dto/dictionary.dto';

export const MAX_DICTIONARY_UPLOAD_BYTES = 1024 * 1024 * 1024;

@Controller('dictionaries')
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get()
  listSources(@CurrentUser() user: RequestUser) {
    return this.dictionaryService.listSources(user);
  }

  @Get('lookup')
  lookup(@Query() query: DictionaryLookupQueryDto, @CurrentUser() user: RequestUser) {
    return this.dictionaryService.lookup(user, query.word, query.lang);
  }

  @Post('oxford')
  @ForbidPermission(Permission.DemoRestricted, 'Demo-restricted account cannot add dictionaries')
  createOxford(@Body() dto: CreateOxfordSourceDto, @CurrentUser() user: RequestUser) {
    return this.dictionaryService.createOxfordSource(user, dto);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ForbidPermission(Permission.DemoRestricted, 'Demo-restricted account cannot add dictionaries')
  async upload(@CurrentUser() user: RequestUser, @Req() req: MultipartRequest, @Query() query: DictionaryUploadQueryDto) {
    const data = await req.file({ limits: { fileSize: MAX_DICTIONARY_UPLOAD_BYTES } });
    if (!data) throw new BadRequestException('No file provided');
    return this.dictionaryService.importFile(user, {
      file: data.file,
      filename: data.filename,
      isTruncated: () => data.file.truncated,
      sourceLang: query.sourceLang,
      targetLang: query.targetLang,
    });
  }

  @Patch(':sourceId/sharing')
  @RequirePermission(Permission.ManageAppSettings)
  setSharing(@Param('sourceId', ParseIntPipe) sourceId: number, @Body() dto: ShareDictionarySourceDto, @CurrentUser() user: RequestUser) {
    return this.dictionaryService.setShared(user, sourceId, dto.shared);
  }

  @Patch(':sourceId')
  updateSource(@Param('sourceId', ParseIntPipe) sourceId: number, @Body() dto: UpdateDictionarySourceDto, @CurrentUser() user: RequestUser) {
    return this.dictionaryService.updateSource(user, sourceId, dto);
  }

  @Delete(':sourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSource(@Param('sourceId', ParseIntPipe) sourceId: number, @CurrentUser() user: RequestUser) {
    await this.dictionaryService.deleteSource(user, sourceId);
  }
}
