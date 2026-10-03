import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Hard ceiling of rows returned by a legacy (non-paged) list, so no request loads a table unbounded. */
export const MAX_LIST = 2000;

export class PageQueryDto {
  /** 1-based page; when present the response is { items, total, page, pageSize }. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  /** Free-text search (name, number, reference…). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Prisma skip/take for a query: paged when `page` is given, capped otherwise. */
export function pageArgs(q: PageQueryDto | undefined, defaultSize = 50): { skip?: number; take: number } {
  if (!q?.page) return { take: MAX_LIST };
  const pageSize = q.pageSize ?? defaultSize;
  return { skip: (q.page - 1) * pageSize, take: pageSize };
}

/** Wraps rows in the paged shape when `page` was requested, returns the bare array otherwise. */
export function pageResult<T>(q: PageQueryDto | undefined, items: T[], total: number, defaultSize = 50): T[] | Page<T> {
  if (!q?.page) return items;
  const pageSize = q.pageSize ?? defaultSize;
  return { items, total, page: q.page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
