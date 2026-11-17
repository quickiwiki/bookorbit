import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { generateInviteCode, normalizeInviteCode } from './invite-code';
import { InviteLinkService } from './invite-link.service';

function makeService() {
  const repo = {
    create: vi.fn().mockImplementation((data: object) => Promise.resolve({ id: 1, ...data })),
    findAll: vi.fn().mockResolvedValue([]),
    isUsable: vi.fn().mockResolvedValue(true),
    revoke: vi.fn().mockResolvedValue({ id: 1 }),
  };
  return { service: new InviteLinkService(repo as never), repo };
}

const admin = { id: 3 } as never;

describe('invite codes', () => {
  it('are twelve digits', () => {
    expect(generateInviteCode()).toMatch(/^\d{12}$/);
  });

  it('read the same with or without the separators', () => {
    expect(normalizeInviteCode('4827-1930 5561')).toBe('482719305561');
  });
});

describe('InviteLinkService', () => {
  it('creates a link with a fresh code, a use limit and an expiry', async () => {
    const { service, repo } = makeService();
    const before = Date.now();
    await service.create(admin, { label: ' Book club ', maxUses: 5, expiresInDays: 7 });
    const data = repo.create.mock.calls[0][0];
    expect(data).toMatchObject({ label: 'Book club', maxUses: 5, createdBy: 3 });
    expect(data.code).toMatch(/^\d{12}$/);
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * 86_400_000);
  });

  it('creates an open-ended link when no limits are given', async () => {
    const { service, repo } = makeService();
    await service.create(admin, {});
    expect(repo.create.mock.calls[0][0]).toMatchObject({ label: '', maxUses: null, expiresAt: null });
  });

  it('reports a malformed code as invalid without a lookup', async () => {
    const { service, repo } = makeService();
    await expect(service.status('123')).resolves.toEqual({ valid: false });
    expect(repo.isUsable).not.toHaveBeenCalled();
  });

  it('checks a well-formed code against the stored links', async () => {
    const { service, repo } = makeService();
    await expect(service.status('4827-1930-5561')).resolves.toEqual({ valid: true });
    expect(repo.isUsable).toHaveBeenCalledWith('482719305561');
  });

  it('reports revoking an unknown link', async () => {
    const { service, repo } = makeService();
    repo.revoke.mockResolvedValue(null);
    await expect(service.revoke(admin, 9)).rejects.toThrow(NotFoundException);
  });
});
