import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { RequestUser } from '../../common/types/request-user';
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';
import { INVITE_CODE_DIGITS, generateInviteCode, normalizeInviteCode } from './invite-code';
import { InviteLinkRepository } from './invite-link.repository';

@Injectable()
export class InviteLinkService {
  private readonly logger = new Logger(InviteLinkService.name);

  constructor(private readonly repo: InviteLinkRepository) {}

  list() {
    return this.repo.findAll();
  }

  async create(actor: RequestUser, dto: CreateInviteLinkDto) {
    const row = await this.repo.create({
      code: generateInviteCode(),
      label: dto.label?.trim() ?? '',
      maxUses: dto.maxUses ?? null,
      expiresAt: dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * 86_400_000) : null,
      createdBy: actor.id,
    });
    this.logger.log(`[invite_link.create] [end] id=${row.id} createdBy=${actor.id} - invite link created`);
    return row;
  }

  async revoke(actor: RequestUser, id: number) {
    const row = await this.repo.revoke(id);
    if (!row) throw new NotFoundException('Invite link not found');
    this.logger.log(`[invite_link.revoke] [end] id=${id} revokedBy=${actor.id} - invite link revoked`);
  }

  async status(code: string) {
    const normalized = normalizeInviteCode(code);
    return { valid: normalized.length === INVITE_CODE_DIGITS && (await this.repo.isUsable(normalized)) };
  }
}
