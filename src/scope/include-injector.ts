// ──────────────────────────────────────────────────────────────────
// Include Injector — walks include strings, injects scope WHERE clauses
//
// Given a starting table and a dot-separated include path like
// "memberships.role.permissions", this module:
//
//   1. Walks the relation graph table by table, relation by relation
//   2. For each hop, checks the scope registry for the target resource
//   3. If the user has access, injects a WHERE clause (for many relations
//      only — Drizzle doesn't support WHERE on `one` relations)
//   4. If the user does NOT have access, drops that relation/subtree
//      silently — the parent query succeeds without it
//
// Projects provide their relation graph and scope filter, and receive
// injector functions to parse include paths into Drizzle `with` configs.
// ──────────────────────────────────────────────────────────────────

import { SQL } from "drizzle-orm";
import type { ScopeContext } from "../repository/base-postgres-repository";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type RelationType = "one" | "many";

export interface RelationDef {
  /** Drizzle relation name (matches the key in the `with` config) */
  relationName: string;
  /** Target Drizzle table name */
  targetTable: string;
  /** Relation cardinality */
  type: RelationType;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Only "many" relations support WHERE injection in Drizzle `with` configs.
 */
export function supportsWhere(relation: RelationDef): boolean {
  return relation.type === "many";
}

/**
 * Check if a SQL object represents `sql`false`` (no access).
 * Uses structural check because `sql`false`` creates a new object each call.
 */
export function isFalseSQL(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const chunks = (s as Record<string, unknown>).queryChunks;
  if (!Array.isArray(chunks) || chunks.length !== 1) return false;
  const chunk = chunks[0] as Record<string, unknown> | undefined;
  return (chunk?.value as unknown[])?.[0] === "false";
}

// ──────────────────────────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────────────────────────

export interface IncludeInjectorDeps {
  /**
   * Resolve a relation from a table name and relation name.
   * Typically backed by a project's RELATION_GRAPH.
   */
  getRelation: (
    tableName: string,
    relationName: string,
  ) => RelationDef | undefined;

  /**
   * Build a scope WHERE condition for a resource.
   * Typically created via `createScopeFilter(SCOPE_COLUMNS)`.
   */
  buildScopeFilter: (resource: string, ctx: ScopeContext) => SQL | undefined;
}

export interface IncludeInjector {
  buildIncludeWith(
    startTable: string,
    dotPath: string,
    ctx: ScopeContext,
  ): Record<string, unknown> | undefined;

  parseIncludesToWith(
    startTable: string,
    include: string[],
    ctx: ScopeContext,
  ): Record<string, unknown> | undefined;
}

/**
 * Create an include injector from a relation graph and scope filter.
 *
 * Usage in project:
 * ```ts
 * import { createIncludeInjector } from "@wrk-t/nestjs-core";
 * import { getRelation } from "./relation-graph";
 * import { buildScopeFilter } from "./scope-registry";
 *
 * export const { buildIncludeWith, parseIncludesToWith } =
 *   createIncludeInjector({ getRelation, buildScopeFilter });
 * ```
 */
export function createIncludeInjector(
  deps: IncludeInjectorDeps,
): IncludeInjector {
  const { getRelation, buildScopeFilter } = deps;

  function buildIncludeWith(
    startTable: string,
    dotPath: string,
    ctx: ScopeContext,
  ): Record<string, unknown> | undefined {
    const parts = dotPath.split(".");
    if (parts.length === 0) return undefined;

    const config: Record<string, unknown> = {};
    let currentConfig = config;
    let currentTable = startTable;

    for (let i = 0; i < parts.length; i++) {
      const relationName = parts[i];
      const relation = getRelation(currentTable, relationName);

      // Relation doesn't exist — malformed include path → drop it
      if (!relation) return undefined;

      // Check scope for the target resource
      const scopeFilter = buildScopeFilter(relation.targetTable, ctx);

      // No access to this resource → drop this level (and everything below)
      if (isFalseSQL(scopeFilter)) {
        // If this is the first hop, drop the entire include
        if (i === 0) return undefined;
        // Otherwise, just stop here — the parent config is fine
        return config;
      }

      // Last part of the path
      if (i === parts.length - 1) {
        if (supportsWhere(relation) && scopeFilter) {
          currentConfig[relationName] = { where: scopeFilter };
        } else {
          currentConfig[relationName] = true;
        }
        break;
      }

      // Intermediate part — nest deeper
      const nested: Record<string, unknown> = {};
      const relationConfig: Record<string, unknown> = { with: nested };

      if (supportsWhere(relation) && scopeFilter) {
        relationConfig.where = scopeFilter;
      }

      currentConfig[relationName] = relationConfig;
      currentConfig = nested;
      currentTable = relation.targetTable;
    }

    return config;
  }

  function parseIncludesToWith(
    startTable: string,
    include: string[],
    ctx: ScopeContext,
  ): Record<string, unknown> | undefined {
    if (!include || include.length === 0) return undefined;

    const withConfig: Record<string, unknown> = {};

    for (const path of include) {
      const fragment = buildIncludeWith(startTable, path, ctx);
      if (fragment) {
        deepMerge(withConfig, fragment);
      }
    }

    return Object.keys(withConfig).length > 0 ? withConfig : undefined;
  }

  return { buildIncludeWith, parseIncludesToWith };
}

// ──────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
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
