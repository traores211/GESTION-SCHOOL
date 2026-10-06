import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/** RFC 1035-ish: labels of 1..63 chars, separated by dots, total ≤ 253. We reject uppercase up-front. */
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export class CreateDomainDto {
  @IsString()
  @Length(4, 253)
  @Matches(HOSTNAME_RE, { message: 'Nom de domaine invalide (ex: mon-ecole-1.ci)' })
  hostname!: string;

  @IsOptional()
  @IsIn(['CUSTOM_DOMAIN', 'CUSTOM_DOMAIN_ALIAS', 'SUBDOMAIN'])
  kind?: 'CUSTOM_DOMAIN' | 'CUSTOM_DOMAIN_ALIAS' | 'SUBDOMAIN';

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateDomainDto {
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
