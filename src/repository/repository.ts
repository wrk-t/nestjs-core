import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ClsService } from "nestjs-cls";
import type { TScope } from "../context/request.context";
import type {
  TBasePgTable,
  TPgDBTransactionAdapter,
} from "../interface/postgres";
import type { ILogService } from "./abstract-drizzle-repository";
import { BasePostgresRepository } from "./base-postgres-repository";

/**
 * CLS-aware repository with automatic scope resolution from the
 * current request context (userId, tenantId, scopeMap).
 *
 * Concrete repos override `applyScope` and call `resolveScopeFilter`.
 */
export abstract class Repository<
    D extends NodePgDatabase<Record<string, unknown>>,
    T extends TBasePgTable = TBasePgTable,
  >
  extends BasePostgresRepository<D, T>
{
  constructor(
    table: T,
    txHost: TransactionHost<TPgDBTransactionAdapter>,
    eventEmitter?: EventEmitter2,
    logService?: ILogService,
    protected readonly cls?: ClsService,
  ) {
    super(table, txHost, eventEmitter, logService);
  }

  protected resourceName: string = this.tableName;

  protected override getScopeContext() {
    return {
      userId: this.cls?.get<string>("userId"),
      tenantId: this.cls?.get<string>("tenantId"),
      isSuperAdmin: this.cls?.get<boolean>("isSuperAdmin") ?? false,
      scopeMap: this.cls?.get<Record<string, TScope[]>>("scopeMap"),
    };
  }

  /**
   * Resolve scope-based SQL filter from CLS.
   * Concrete repos call this from their `applyScope()` implementation.
   */
  protected resolveScopeFilter(
    condition: SQL | undefined,
    columns?: { own?: SQL.Aliased | unknown; tenant?: SQL.Aliased | unknown },
  ): SQL | undefined {
    if (!this.cls) return condition;

    const isSuperAdmin = this.cls.get<boolean>("isSuperAdmin") ?? false;
    if (isSuperAdmin) return condition;

    const scopeMap = this.cls.get<Record<string, TScope[]>>("scopeMap");
    const scopes = scopeMap?.[this.resourceName] ?? [];

    const conditions: SQL[] = [];
    if (condition) conditions.push(condition);

    if (columns) {
      if (scopes.includes("own") && columns.own) {
        const userId = this.cls.get<string>("userId");
        if (userId) {
          // @ts-expect-error Drizzle eq type
          conditions.push(eq(columns.own, userId));
        }
      }

      if (scopes.includes("tenant") && columns.tenant) {
        const tenantId = this.cls.get<string>("tenantId");
        if (tenantId) {
          // @ts-expect-error Drizzle eq type
          conditions.push(eq(columns.tenant, tenantId));
        }
      }
    }

    // Fallback: if no scopes were resolved, apply default tenant scoping
    if (scopes.length === 0 && columns?.tenant) {
      const tenantId = this.cls.get<string>("tenantId");
      if (tenantId) {
        // @ts-expect-error Drizzle eq type
        conditions.push(eq(columns.tenant, tenantId));
      }
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  }
}
