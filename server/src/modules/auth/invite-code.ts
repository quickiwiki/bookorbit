import { randomInt } from 'crypto';

export const INVITE_CODE_DIGITS = 12;

/** Twelve random digits: easy to read out or type, and far too many to guess at the sign-up rate limit. */
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_DIGITS; i++) code += randomInt(10).toString();
  return code;
}

/** Codes are shown in groups ("4827-1930-5561"); anything that is not a digit is ignored. */
export function normalizeInviteCode(code: string): string {
  return code.replace(/\D/g, '');
}
