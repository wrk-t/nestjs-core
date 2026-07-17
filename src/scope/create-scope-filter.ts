// ──────────────────────────────────────────────────────────────────
// Scope Filter Factory — builds a scope-based SQL filter function
//
// Projects provide their SCOPE_COLUMNS map (resource → table + column
// names) and receive a `buildScopeFilter` function that produces
// row-level WHERE conditions based on the current user's scope context.
// ──────────────────────────────────────────────────────────────────

import { and, eq, SQL, sql } from "drizzle-orm";
import type { TBasePgTable } from "../interface/postgres";
import type { ScopeContext } from "../repository/base-postgres-repository";
import type { TScope } from "../context/request.context";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

/** Scope column configuration for a single resource. */
export interface ScopeColumns {
  /** Table reference for building WHERE conditions */
  table: TBasePgTable;
  /** Column name for the "own" (user-level) scope */
  own?: string;
  /** Column name for the "tenant" scope */
  tenant?: string;
}

// ──────────────────────────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────────────────────────

/**
 * Create a scope filter function from a static column map.
 *
 * Usage in project:
 * ```ts
 * import { createScopeFilter } from "@wrk-t/nestjs-core";
 *
 * export const SCOPE_COLUMNS = {
 *   membership: { table: membership, own: "userId", tenant: "tenantId" },
 *   users: { table: users },
 * };
 *
 * export const buildScopeFilter = createScopeFilter(SCOPE_COLUMNS);
 * ```
 *
 * The returned function produces:
 *   undefined  → no restriction (super admin, "all" scope, or unregistered)
 *   sql`false` → no access at all
 *   SQL        → the scope WHERE condition
 */
export function createScopeFilter(
  columns: Record<string, ScopeColumns>,
): (resource: string, ctx: ScopeContext) => SQL | undefined {
  return function buildScopeFilter(
    resource: string,
    ctx: ScopeContext,
  ): SQL | undefined {
    const cols = columns[resource];
    if (!cols) return undefined; // unregistered = no scope

    if (ctx.isSuperAdmin) return undefined;

    // Scope map not yet resolved (e.g. during auth guard initialization)
    // — bypass the filter so role resolution can proceed.
    if (!ctx.scopeMap) return undefined;

    const scopes: TScope[] = ctx.scopeMap[resource] ?? [];

    // User resolved, but no permission for this resource
    if (scopes.length === 0) return sql`false`;

    // "all" scope overrides everything
    if (scopes.includes("all")) return undefined;

    const conditions: SQL[] = [];

    if (scopes.includes("own") && cols.own && ctx.userId) {
      // @ts-expect-error — dynamic column access
      conditions.push(eq(cols.table[cols.own], ctx.userId));
    }
    if (scopes.includes("tenant") && cols.tenant && ctx.tenantId) {
      // @ts-expect-error — dynamic column access
      conditions.push(eq(cols.table[cols.tenant], ctx.tenantId));
    }

    if (conditions.length === 0) {
      // No matching columns → binary access control:
      // If the resource has no scoping columns at all, any granted scope
      // means full access (e.g., system tables like "users", "permissions").
      // If columns ARE defined but the user's scopes don't match any,
      // deny access (likely a permission misconfiguration).
      if (!(cols.own || cols.tenant)) return undefined;
      return sql`false`;
    }
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  };
}
