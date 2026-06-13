import { Injectable, Optional } from "@nestjs/common";
import { RequestContext, type TScope } from "../context/request.context";

export type OwnerResult =
  | { ok: true; value: string }
  | { ok: false; error: { getStatus: () => number; message: string } };

/**
 * Central access-control service. Plugs into the "error as value" pattern.
 * Every method returns a result or an error object — services check these
 * in their guard*() hooks. Consumers can provide a custom implementation.
 */
@Injectable()
export class AccessControlService {
  constructor(@Optional() private readonly ctx?: RequestContext) {}

  resolveOwnerId(bodyOwnerId: string | undefined, resource: string): OwnerResult {
    const userId = this.ctx?.getUserId();
    if (!userId) {
      return { ok: false, error: { getStatus: () => 403, message: "Not authenticated" } };
    }
    const scopes = this.ctx?.getScopesForResource(resource) ?? [];
    if (scopes.includes("all")) {
      if (!bodyOwnerId) return { ok: false, error: { getStatus: () => 400, message: "ownerId required" } };
      return { ok: true, value: bodyOwnerId };
    }
    if (bodyOwnerId && bodyOwnerId !== userId) {
      return { ok: false, error: { getStatus: () => 403, message: "Cannot set ownerId to different user" } };
    }
    return { ok: true, value: userId };
  }

  requireScope(resource: string, minScope: TScope): { getStatus: () => number; message: string } | undefined {
    const scopes = this.ctx?.getScopesForResource(resource) ?? [];
    if (scopes.includes("all")) return;
    const LEVEL: Record<TScope, number> = { own: 0, tenant: 1, all: 2 };
    if (!scopes.some((s) => (LEVEL[s as TScope] ?? 0) >= LEVEL[minScope])) {
      return { getStatus: () => 403, message: "Insufficient permissions" };
    }
  }

  guardResourceAccess(
    resource: string,
    record: { ownerId?: string | null; tenantId?: string | null },
  ): { getStatus: () => number; message: string } | undefined {
    const scopes = this.ctx?.getScopesForResource(resource) ?? [];
    if (scopes.includes("all")) return;
    const userId = this.ctx?.getUserId();
    const tenantId = this.ctx?.getTenantId();
    if (scopes.includes("own")) {
      if (!record.ownerId || record.ownerId !== userId) return { getStatus: () => 403, message: "Insufficient permissions" };
      return;
    }
    if (scopes.includes("tenant")) {
      if (!record.tenantId || record.tenantId !== tenantId) return { getStatus: () => 403, message: "Insufficient permissions" };
      return;
    }
    return { getStatus: () => 403, message: "Insufficient permissions" };
  }
}
