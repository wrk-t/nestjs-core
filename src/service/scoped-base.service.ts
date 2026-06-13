import type { SQL } from "drizzle-orm";
import type {
  TBasePgTable,
  TPgDBTransactionAdapter,
} from "../interface/postgres";
import type { BasePostgresRepository } from "../repository/base-repository";
import type { RequestContext } from "../context/request.context";

/**
 * Optional translation service interface.
 * Projects provide their own if they want $trl_ key resolution.
 */
export interface ITranslationService {
  resolveTranslations<T>(
    record: T,
    locale: string,
    tenantId?: string | null,
  ): Promise<T>;
}

/**
 * Generic service base with CRUD operations, guard hooks, and
 * DB error mapping. Every service in the project extends this.
 */
export abstract class ScopedBaseService<
  T extends TBasePgTable,
  // biome-ignore lint/suspicious/noExplicitAny: generic repo type
  Repo extends BasePostgresRepository<any, T>,
> {
  abstract logger: any;
  repo: Repo;

  protected resourceName: string;
  protected requestContext?: RequestContext;
  translationService?: ITranslationService;

  constructor(
    repo: Repo,
    requestContext?: RequestContext,
    translationService?: ITranslationService,
  ) {
    this.repo = repo;
    this.requestContext = requestContext;
    this.translationService = translationService;
    this.resourceName =
      (repo as unknown as { tableName: string }).tableName ??
      repo.constructor.name;
  }

  // ── Guard hooks (MUST be implemented by child services) ─────

  protected abstract guardCreate(
    data: Record<string, unknown>,
  ): { getStatus: () => number; message: string } | undefined;

  protected abstract guardUpdate(
    id: string,
    existing: T["$inferSelect"],
    data: Partial<T["$inferInsert"]>,
  ): { getStatus: () => number; message: string } | undefined;

  protected abstract guardDelete(
    id: string,
    existing: T["$inferSelect"],
  ): { getStatus: () => number; message: string } | undefined;

  protected abstract guardRecover(
    id: string,
    existing: T["$inferSelect"],
  ): { getStatus: () => number; message: string } | undefined;

  // ── Error handling ──────────────────────────────────────────

  protected handleDbError(
    error: Record<string, unknown>,
  ): { getStatus: () => number; message: string } | undefined {
    if (error?.code === "23505") {
      return {
        getStatus: () => 409,
        message: "Duplicate value violates a unique constraint",
      };
    }
    if (error?.code === "23514") {
      return { getStatus: () => 400, message: "Validation failed" };
    }
    return { getStatus: () => 500, message: "Internal server error" };
  }

  // ── DELETE ──────────────────────────────────────────────────

  async softDeleteOne(query?: SQL) {
    const r = await this.repo.softDeleteOne(query);
    if (!r) return { getStatus: () => 500, message: "Internal server error" };
    return r;
  }

  async softDeleteOneById(id: string) {
    const existing = await this.repo.selectOneById(id);
    if (!existing) return { getStatus: () => 404, message: "Not found" };
    const guardErr = this.guardDelete(id, existing);
    if (guardErr) return guardErr;
    const r = await this.repo.softDeleteOneById(id);
    if (!r) return { getStatus: () => 500, message: "Internal server error" };
    return r;
  }

  async deleteBulk(query: SQL) {
    const result = await this.repo.deleteBulk(query);
    if (result.length === 0)
      return { getStatus: () => 404, message: "Not found" };
    return result;
  }

  async deleteBulkByIds(ids: string[]) {
    const result = await this.repo.deleteBulkByIds(ids);
    if (result.length === 0)
      return { getStatus: () => 404, message: "Not found" };
    return result;
  }

  // ── FIND ────────────────────────────────────────────────────

  async selectOne(query: SQL) {
    const r = await this.repo.selectOne(query);
    if (!r) return { getStatus: () => 404, message: "Not found" };
    return r;
  }

  async selectOneById(id: string) {
    const r = await this.repo.selectOneById(id);
    if (!r) return { getStatus: () => 404, message: "Not found" };
    return r;
  }

  async selectMany(query?: SQL) {
    const r = await this.repo.selectMany(query);
    if (r.length === 0) return { getStatus: () => 404, message: "Not found" };
    return r;
  }

  async selectAll() {
    const r = await this.repo.selectAll();
    if (r.length === 0) return { getStatus: () => 404, message: "Not found" };
    return r;
  }

  async findFirst(filters: {
    searchFields?: (keyof T["$inferSelect"] | (string & {}))[];
    search?: string;
    include?: string[] | readonly string[];
  }) {
    const r = await this.repo.findFirst(filters);
    if (!r) return { getStatus: () => 404, message: "Not found" };
    return r;
  }

  async findMany(filters: {
    page?: number | null;
    limit?: number | null;
    searchFields?: (keyof T["$inferSelect"] | (string & {}))[];
    search?: string;
    sortBy?: keyof T["$inferSelect"];
    sortOrder?: "asc" | "desc";
    include?: string[] | readonly string[];
    includeDeleted?: boolean;
    translation?: boolean;
  }) {
    const result = await this.repo.findMany(filters);

    if (filters.translation && this.translationService && this.requestContext) {
      const locale = this.requestContext.getLocale();
      const tenantId = this.requestContext.getTenantId();
      result.data = await Promise.all(
        result.data.map((item) =>
          this.translationService!.resolveTranslations(item, locale, tenantId),
        ),
      );
    }

    return result;
  }

  // ── CREATE ──────────────────────────────────────────────────

  async createOne(data: T["$inferInsert"]) {
    try {
      const guardErr = this.guardCreate(data);
      if (guardErr) return guardErr;
      const r = await this.repo.createOne(data);
      if (!Array.isArray(r) || r.length === 0) {
        return { getStatus: () => 500, message: "Internal server error" };
      }
      return r[0];
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }

  async createBulk(
    data: Omit<
      T["$inferInsert"],
      "createdAt" | "deletedAt" | "updatedAt" | "id"
    >[],
  ) {
    try {
      for (const item of data) {
        const guardErr = this.guardCreate(item);
        if (guardErr) return guardErr;
      }
      return await this.repo.createBulk(data);
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }

  // ── UPDATE ──────────────────────────────────────────────────

  async updateOne(
    query: SQL,
    data: Partial<
      Omit<T["$inferInsert"], "createdAt" | "deletedAt" | "updatedAt" | "id">
    >,
  ) {
    try {
      const r = await this.repo.updateOne(query, data);
      if (!r) return { getStatus: () => 500, message: "Internal server error" };
      return r;
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }

  async updateOneById(
    id: string,
    data: Partial<
      Omit<T["$inferInsert"], "createdAt" | "deletedAt" | "updatedAt" | "id">
    >,
  ) {
    try {
      const existing = await this.repo.selectOneById(id);
      if (!existing) return { getStatus: () => 404, message: "Not found" };
      const guardErr = this.guardUpdate(id, existing, data);
      if (guardErr) return guardErr;
      const r = await this.repo.updateOneById(id, data);
      if (!r) return { getStatus: () => 500, message: "Internal server error" };
      return r;
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }

  // ── RECOVER ─────────────────────────────────────────────────

  async recoverOneById(id: string) {
    try {
      const existing = await this.repo.selectOneById(id);
      if (!existing) return { getStatus: () => 404, message: "Not found" };
      const guardErr = this.guardRecover(id, existing);
      if (guardErr) return guardErr;
      const r = await this.repo.updateOneById(id, {
        // @ts-expect-error deletedAt omitted from update type
        deletedAt: null,
      });
      if (!r) return { getStatus: () => 500, message: "Internal server error" };
      return r;
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }
}
