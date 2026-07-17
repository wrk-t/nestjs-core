import {
  BadRequestDto,
  ConflictDto,
  ForbiddenDto,
  HttpException,
  InternalServerErrorDto,
  NotFoundDto,
} from "@wrk-t/ts-exc";
import type { SQL } from "drizzle-orm";

// ── Minimal logger interface ─────────────────────────────────
// Structurally compatible with @nestjs/common Logger across versions.
export interface ILogger {
  log(message: any, ...optionalParams: any[]): void;
  warn(message: any, ...optionalParams: any[]): void;
  error(message: any, ...optionalParams: any[]): void;
  debug?(message: any, ...optionalParams: any[]): void;
  verbose?(message: any, ...optionalParams: any[]): void;
}
import { I18nContext } from "nestjs-i18n";
import type { TBasePgTable } from "../interface/postgres";
import type { BasePostgresRepository } from "../repository/base-postgres-repository";
import type { RequestContext } from "../context/request.context";

/**
 * Optional translation service interface.
 * Projects provide their own if they want $trl_ key resolution on findMany results.
 */
export interface ITranslationService {
  resolveTranslations<T>(
    record: T,
    locale: string,
    tenantId?: string | null,
  ): Promise<T>;
}

/**
 * Generic CRUD service with translated error handling and DB error mapping.
 *
 * Row-level scoping is handled at the repository layer via the scope registry.
 * No permission checks are performed here — access control is enforced by
 * the scope filter (`buildScopeFilter`) which returns `sql`false`` when
 * a user lacks permissions on a resource.
 *
 * @example
 * ```ts
 * @Injectable()
 * export class UsersService extends ScopedBaseService<typeof users, UsersPgRepository> {
 *   logger = new Logger(UsersService.name);
 *   constructor(repo: UsersPgRepository, requestContext: RequestContext) {
 *     super(repo, requestContext);
 *   }
 * }
 * ```
 */
export abstract class ScopedBaseService<
  T extends TBasePgTable,
  // biome-ignore lint/suspicious/noExplicitAny: generic repo type
  Repo extends BasePostgresRepository<any, T>,
> {
  abstract logger: ILogger;
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
      (repo as unknown as { resourceName?: string }).resourceName ??
      (repo as unknown as { tableName?: string }).tableName ??
      repo.constructor.name;
  }

  // ──────────────────────────────────────────────────────────────
  // Error helpers — produce translated, resource-aware error DTOs
  //
  // Subclasses use these to return typed errors instead of throwing.
  // Controllers unwrap with `unwrapOrThrow` to convert errors to HTTP
  // responses.
  // ──────────────────────────────────────────────────────────────

  /**
   * Convert camelCase resource name to snake_case for translation keys.
   * e.g. "tenantSettings" → "tenant_setting"
   */
  private get resourceKey(): string {
    return this.resourceName
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "");
  }

  /**
   * Try a specific translation key, fall back to a generic one,
   * then to a hardcoded English literal.
   */
  protected trl(
    specificKey: string,
    genericKey: string,
    fallback: string,
  ): string {
    const i18n = I18nContext.current();
    return (
      (i18n?.t(specificKey) as unknown as string) ??
      (i18n?.t(genericKey) as unknown as string) ??
      fallback
    );
  }

  /**
   * Return a NotFoundDto with a resource-aware translated message.
   */
  protected notFoundErr(detail?: Record<string, unknown>): NotFoundDto {
    const message = this.trl(
      `errors.${this.resourceKey}_not_found`,
      "errors.not_found",
      "Resource not found",
    );
    return new NotFoundDto(message).details({
      resource: this.resourceName,
      ...(detail ?? {}),
    });
  }

  /**
   * Return an InternalServerErrorDto with a resource+operation-aware message.
   */
  protected internalErr(
    operation: string,
    detail?: Record<string, unknown>,
  ): InternalServerErrorDto {
    const message = this.trl(
      `errors.${this.resourceKey}_${operation}_failed`,
      "errors.internal_server_error",
      "An internal server error occurred",
    );
    return new InternalServerErrorDto(message).details({
      resource: this.resourceName,
      operation,
      ...(detail ?? {}),
    });
  }

  /**
   * Return a ForbiddenDto with a resource-aware translated message.
   */
  protected forbiddenErr(detail?: Record<string, unknown>): ForbiddenDto {
    const message = this.trl(
      `errors.${this.resourceKey}_forbidden`,
      "errors.forbidden",
      "Access denied",
    );
    return new ForbiddenDto(message).details({
      resource: this.resourceName,
      ...(detail ?? {}),
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Error handling
  // ──────────────────────────────────────────────────────────────

  protected handleConflictError(error: Record<string, unknown>) {
    if (this.pgCode(error) === "23505") {
      const constraint = this.pgConstraint(error) ?? "";
      const i18n = I18nContext.current();
      const key = `constraints.${constraint}` as const;
      const message =
        (i18n?.t(key) as unknown as string) ??
        (i18n?.t("errors.duplicate_entry") as unknown as string) ??
        "Duplicate value violates a unique constraint";
      return new ConflictDto(message);
    }
    return this.internalErr("create", { cause: error, reason: "db_error" });
  }

  protected handleValidationError(error: Record<string, unknown>) {
    if (this.pgCode(error) === "23514") {
      const constraint = this.pgConstraint(error) ?? "";
      const i18n = I18nContext.current();
      const key = `constraints.${constraint}` as const;
      const message =
        (i18n?.t(key) as unknown as string) ??
        (i18n?.t("errors.bad_request") as unknown as string) ??
        "Validation failed";
      return new BadRequestDto(message);
    }
    return this.internalErr("validate", { cause: error, reason: "db_error" });
  }

  /**
   * Extract the PostgreSQL error code from a DB error, accounting for
   * Drizzle transaction wrappers that nest the original error under `cause`.
   */
  private pgCode(error: Record<string, unknown>): string | undefined {
    const code = error?.code as string | undefined;
    if (code) return code;
    const cause = error?.cause as Record<string, unknown> | undefined;
    return cause?.code as string | undefined;
  }

  /**
   * Extract the PostgreSQL constraint name, handling nested errors.
   */
  private pgConstraint(error: Record<string, unknown>): string | undefined {
    const c = error?.constraint as string | undefined;
    if (c) return c;
    const cause = error?.cause as Record<string, unknown> | undefined;
    return cause?.constraint as string | undefined;
  }

  protected handleDbError(error: Record<string, unknown>) {
    if (error instanceof HttpException) throw error;
    if (this.pgCode(error) === "23505") return this.handleConflictError(error);
    if (this.pgCode(error) === "23514")
      return this.handleValidationError(error);
    return this.internalErr("db_operation", {
      cause: error,
      reason: "db_error",
    });
  }

  // ──────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────

  async softDeleteOne(query?: SQL | undefined) {
    const r = await this.repo.softDeleteOne(query);
    if (!r) return this.internalErr("soft_delete");
    return r;
  }

  async softDeleteOneById(id: string) {
    const existing = await this.repo.selectOneById(id);
    if (!existing) return this.notFoundErr({ id });
    const r = await this.repo.softDeleteOneById(id);
    if (!r) return this.internalErr("soft_delete", { id });
    return r;
  }

  async deleteBulk(query: SQL) {
    const result = await this.repo.deleteBulk(query);
    if (result.length === 0) return this.notFoundErr({ query: String(query) });
    return result;
  }

  async deleteBulkByIds(ids: string[]) {
    const result = await this.repo.deleteBulkByIds(ids);
    if (result.length === 0) return this.notFoundErr({ ids });
    return result;
  }

  // ──────────────────────────────────────────────────────────────
  // FIND (row-level scoping handles access control)
  // ──────────────────────────────────────────────────────────────

  async selectOne(query: SQL) {
    const r = await this.repo.selectOne(query);
    if (!r) return this.notFoundErr({ query: String(query) });
    return r;
  }

  async selectOneById(id: string) {
    const r = await this.repo.selectOneById(id);
    if (!r) return this.notFoundErr({ id });
    return r;
  }

  async selectMany(query?: SQL | undefined) {
    const r = await this.repo.selectMany(query);
    if (r.length === 0) return this.notFoundErr();
    return r;
  }

  async selectAll() {
    const r = await this.repo.selectAll();
    if (r.length === 0) return this.notFoundErr();
    return r;
  }

  async findFirst(filters: {
    searchFields?: (keyof T["$inferSelect"] | (string & {}))[];
    search?: string;
    include?: string[] | readonly string[];
  }) {
    const r = await this.repo.findFirst(filters);
    if (!r) return this.notFoundErr({ filters });
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

  // ──────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────

  async createOne(data: T["$inferInsert"]) {
    try {
      const r = await this.repo.createOne(data);
      if (!Array.isArray(r) || r.length === 0) {
        return this.internalErr("create");
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
      return await this.repo.createBulk(data);
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────

  async updateOne(
    query: SQL,
    data: Partial<
      Omit<T["$inferInsert"], "createdAt" | "deletedAt" | "updatedAt" | "id">
    >,
  ) {
    try {
      const r = await this.repo.updateOne(query, data);
      if (!r) return this.internalErr("update");
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
      if (!existing) return this.notFoundErr({ id });
      const r = await this.repo.updateOneById(id, data);
      if (!r) return this.internalErr("update", { id });
      return r;
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // RECOVER (undo soft-delete)
  // ──────────────────────────────────────────────────────────────

  async recoverOneById(id: string) {
    try {
      const existing = await this.repo.selectOneById(id);
      if (!existing) return this.notFoundErr({ id });
      const r = await this.repo.updateOneById(id, {
        // @ts-expect-error FIXME: deletedAt is omitted from the update type
        deletedAt: null,
      });
      if (!r) return this.internalErr("recover", { id });
      return r;
    } catch (error) {
      return this.handleDbError(error as Record<string, unknown>);
    }
  }
}
