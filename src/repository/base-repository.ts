import type { SQL } from "drizzle-orm";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { IBaseDrizzleRepository } from "../interface/drizzle";
import type { TBasePgTable } from "../interface/postgres";
import type { ScopeMap } from "../context/request.context";
import {
  AbstractBaseDrizzleRepository,
  type ILogService,
} from "./abstract-drizzle-repository";

/** A map of resource name → effective scopes for the current user. */
export type { ScopeMap } from "../context/request.context";

export interface ScopeContext {
  userId?: string;
  tenantId?: string;
  isSuperAdmin?: boolean;
  scopeMap?: ScopeMap;
}

/**
 * An include value can be either:
 * - A static Drizzle `with` config fragment (backward-compatible)
 * - A function that receives scope context and returns the config fragment
 */
type IncludeValue =
  | Record<string, unknown>
  | ((scope: ScopeContext) => Record<string, unknown>);

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const key of Object.keys(source)) {
    const val = source[key];
    const isPlainObj = val && typeof val === "object" && !Array.isArray(val);
    if (
      isPlainObj &&
      key in target &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      deepMerge(
        target[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      target[key] = val;
    }
  }
}

export abstract class BasePostgresRepository<
  D extends NodePgDatabase<Record<string, unknown>>,
  T extends TBasePgTable,
>
  extends AbstractBaseDrizzleRepository<T, D>
  implements IBaseDrizzleRepository<T>
{
  /**
   * Apply scope-based filtering to every read/write query.
   * Each repository MUST implement this.
   */
  abstract applyScope(condition: SQL | undefined): SQL | undefined;

  // ── Config (overridden by subclasses) ──────────────────────

  // biome-ignore lint/suspicious/noExplicitAny: generic infrastructure
  protected filterableFields: Record<string, (value: any) => SQL> = {};

  protected searchableColumns: (keyof T["$inferSelect"])[] = [];

  protected defaultSortColumn: keyof T["$inferSelect"] = "createdAt";

  protected tableName: string = "";

  protected includeMap: Record<string, IncludeValue> = {};

  protected getScopeContext(): ScopeContext {
    return {};
  }

  /**
   * Parse a comma-separated include string into a Drizzle `with` config.
   */
  parseInclude(include?: string[]): Record<string, unknown> | undefined {
    if (!include || include.length === 0) return undefined;

    const ctx = this.getScopeContext();
    const withConfig: Record<string, unknown> = {};

    for (const item of include) {
      const value = this.includeMap[item];
      if (!value) continue;
      const fragment = typeof value === "function" ? value(ctx) : value;
      if (fragment) deepMerge(withConfig, fragment);
    }

    return Object.keys(withConfig).length > 0 ? withConfig : undefined;
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic filters
  createConditionalFilters(filters: Record<string, any>) {
    const conds: SQL[] = [];
    for (const [key, buildCondition] of Object.entries(this.filterableFields)) {
      if (filters[key] !== undefined) conds.push(buildCondition(filters[key]));
    }
    return conds.length > 0 ? and(...conds) : undefined;
  }

  // ── CREATE ──────────────────────────────────────────────────

  async createOne(data: T["$inferInsert"]): Promise<T["$inferSelect"][]> {
    return await this.execute(async (db) => {
      // @ts-expect-error Drizzle insert type
      return await db.insert(this.table).values(data).returning();
    }, "create");
  }

  async createBulk(data: T["$inferInsert"][]): Promise<T["$inferSelect"][]> {
    return await this.execute(async (db) => {
      // @ts-expect-error Drizzle insert type
      return await db.insert(this.table).values(data).returning();
    }, "create");
  }

  // ── UPDATE ──────────────────────────────────────────────────

  async updateOne(
    query: SQL,
    data: Partial<T["$inferInsert"]>,
  ): Promise<T["$inferSelect"] | null> {
    return await this.execute(async (db) => {
      const result = await db
        .update(this.table)
        // @ts-expect-error Drizzle update type
        .set(data)
        .where(this.applyScope(query))
        .returning();
      return result.length > 0 ? result[0] : null;
    }, "update");
  }

  async updateOneById(id: string, data: Partial<T["$inferInsert"]>) {
    return await this.updateOne(eq(this.table.id, id), data);
  }

  // ── SOFT DELETE ─────────────────────────────────────────────

  async softDeleteOne(query?: SQL): Promise<T["$inferSelect"] | null> {
    // @ts-expect-error deletedAt on base table
    return await this.updateOne(query, { deletedAt: new Date() });
  }

  async softDeleteOneById(id: string) {
    return await this.softDeleteOne(eq(this.table.id, id));
  }

  // ── DELETE ──────────────────────────────────────────────────

  async deleteOne(query?: SQL): Promise<T["$inferSelect"] | null> {
    return await this.execute(async (db) => {
      const result = await db
        .delete(this.table)
        .where(this.applyScope(query))
        .returning();
      return result.length > 0 ? result[0] : null;
    }, "delete");
  }

  async deleteOneById(id: string) {
    return await this.deleteOne(eq(this.table.id, id));
  }

  async deleteBulk(query?: SQL): Promise<T["$inferSelect"][]> {
    return await this.execute(async (db) => {
      return await db
        .delete(this.table)
        .where(this.applyScope(query))
        .returning();
    }, "delete");
  }

  async deleteBulkByIds(ids: string[]) {
    return await this.deleteBulk(inArray(this.table.id, ids));
  }

  // ── FIND ────────────────────────────────────────────────────

  async selectOne(query: SQL | undefined): Promise<T["$inferSelect"] | null> {
    return await this.execute(async (db) => {
      const result = await db
        .select()
        // @ts-expect-error Drizzle select type
        .from(this.table)
        .where(this.applyScope(query))
        .limit(1);
      return result.length > 0 ? result[0] : null;
    }, "read");
  }

  async selectOneById(id: string): Promise<T["$inferSelect"] | null> {
    return await this.selectOne(eq(this.table.id, id));
  }

  async selectMany(query: SQL | undefined): Promise<T["$inferSelect"][]> {
    return await this.execute(async (db) => {
      // @ts-expect-error Drizzle select type
      return await db.select().from(this.table).where(this.applyScope(query));
    }, "read");
  }

  async selectAll(): Promise<T["$inferSelect"][]> {
    return await this.execute(async (db) => {
      // @ts-expect-error Drizzle select type
      return await db.select().from(this.table).where(this.applyScope());
    }, "read");
  }

  async findMany({
    page,
    limit,
    searchFields = [],
    search,
    sortBy,
    sortOrder,
    include,
    includeDeleted,
    ...rest
  }: {
    page?: number | null;
    limit?: number | null;
    searchFields?: (keyof T["$inferSelect"] | (string & {}))[];
    search?: string;
    sortBy?: keyof T["$inferSelect"];
    sortOrder?: "asc" | "desc";
    include?: string[] | readonly string[];
    includeDeleted?: boolean;
  }): Promise<{
    data: T["$inferSelect"][];
    total: number | null;
    page: number;
    limit: number | null;
    totalPages: number | null;
  }> {
    return await this.execute(async (db) => {
      const conditions: SQL[] = [];
      const queryOptions: Record<string, unknown> = {};
      const withRelations = this.parseInclude(include as string[]);
      const orderFn = sortOrder === "asc" ? asc : desc;
      const conditionalFilters = this.createConditionalFilters(rest);

      if (conditionalFilters) conditions.push(conditionalFilters);

      if (!includeDeleted && "deletedAt" in this.table) {
        conditions.push(isNull(this.table.deletedAt));
      }

      if (limit) {
        const offset = ((page ?? 1) - 1) * limit;
        queryOptions.limit = limit;
        queryOptions.offset = offset;
      }

      const effectiveFields =
        searchFields.length > 0 ? searchFields : this.searchableColumns;
      if (search && effectiveFields.length > 0) {
        const searchConditions = effectiveFields.map((field) =>
          // @ts-expect-error
          ilike(this.table[field], `%${search}%`),
        );
        const searchFilter = or(...searchConditions);
        if (searchFilter) conditions.push(searchFilter);
      }

      if (sortBy && this.table[sortBy]) {
        // @ts-expect-error
        queryOptions.orderBy = orderFn(this.table[sortBy]);
      }

      const whereCondition =
        conditions.length > 0 ? and(...conditions) : undefined;

      // @ts-expect-error Drizzle query API
      const dataQuery = db.query[this.tableName].findMany({
        where: this.applyScope(whereCondition),
        with: withRelations,
        ...queryOptions,
      });

      const countResultQuery = db
        .select({ count: count() })
        // @ts-expect-error Drizzle select type
        .from(this.table)
        .where(this.applyScope(whereCondition));

      const [data, countResult] = await Promise.all([
        dataQuery,
        countResultQuery,
      ]);

      const total = Number(countResult[0].count);
      const totalPages = limit ? Math.ceil(total / limit) : null;

      return { data, total, page: page ?? 1, limit: limit ?? null, totalPages };
    }, "read");
  }

  async findFirst({
    searchFields = [],
    search,
    sortBy,
    sortOrder,
    include,
    ...rest
  }: {
    searchFields?: (keyof T["$inferSelect"] | (string & {}))[];
    search?: string;
    sortBy?: keyof T["$inferSelect"];
    sortOrder?: "asc" | "desc";
    include?: string[] | readonly string[];
  }): Promise<T["$inferSelect"] | null> {
    return await this.execute(async (db) => {
      const conditions: SQL[] = [];
      const queryOptions: Record<string, unknown> = {};
      const withRelations = this.parseInclude(include as string[]);
      const orderFn = sortOrder === "asc" ? asc : desc;
      const conditionalFilters = this.createConditionalFilters(rest);

      if (conditionalFilters) conditions.push(conditionalFilters);

      const effectiveFields =
        searchFields.length > 0 ? searchFields : this.searchableColumns;
      if (search && effectiveFields.length > 0) {
        const searchConditions = effectiveFields.map((field) =>
          // @ts-expect-error
          ilike(this.table[field], `%${search}%`),
        );
        const searchFilter = or(...searchConditions);
        if (searchFilter) conditions.push(searchFilter);
      }

      if (sortBy && this.table[sortBy]) {
        // @ts-expect-error
        queryOptions.orderBy = orderFn(this.table[sortBy]);
      }

      queryOptions.limit = 1;
      const whereCondition =
        conditions.length > 0 ? and(...conditions) : undefined;

      // @ts-expect-error Drizzle query API
      const data = await db.query[this.tableName].findFirst({
        where: this.applyScope(whereCondition),
        with: withRelations,
        ...queryOptions,
      });

      return data ?? null;
    }, "read");
  }
}
