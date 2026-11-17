import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateInviteLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}
