import { BadRequestDto, ForbiddenDto } from "@wrk-t/ts-exc";
import { Injectable, Optional } from "@nestjs/common";
import { I18nContext } from "nestjs-i18n";
import { RequestContext, type TScope } from "../context/request.context";

export type OwnerResult =
  | { ok: true; value: string }
  | { ok: false; error: BadRequestDto | ForbiddenDto };

@Injectable()
export class AccessControlService {
  constructor(@Optional() private readonly ctx?: RequestContext) {}

  private get i18n(): I18nContext | undefined {
    return I18nContext.current();
  }

  private t(key: string, fallback: string): string {
    return this.i18n?.t(key as any) ?? fallback;
  }

  resolveOwnerId(
    bodyOwnerId: string | undefined,
    resource: string,
  ): OwnerResult {
    const userId = this.ctx?.getUserId();
    if (!userId) {
      return {
        ok: false,
        error: new ForbiddenDto(
          this.t("errors.not_authenticated", "Not authenticated"),
        ),
      };
    }

    const scopes = this.ctx?.getScopesForResource(resource) ?? [];
    const isAllScope = scopes.includes("all");

    if (isAllScope) {
      if (!bodyOwnerId) {
        return {
          ok: false,
          error: new BadRequestDto(
            this.t(
              "errors.owner_id_required",
              "ownerId is required when you have full scope access",
            ),
          ),
        };
      }
      return { ok: true, value: bodyOwnerId };
    }

    if (bodyOwnerId && bodyOwnerId !== userId) {
      return {
        ok: false,
        error: new ForbiddenDto(
          this.t(
            "errors.cannot_set_owner",
            "You cannot set ownerId to a different user",
          ),
        ),
      };
    }

    return { ok: true, value: userId };
  }

  /**
   * Check that the user has at least `minScope` for the given resource.
   * Returns undefined if allowed, or an error object if denied.
   */
  requireScope(
    resource: string,
    minScope: TScope,
  ): { getStatus: () => number; message: string } | undefined {
    const scopes = this.ctx?.getScopesForResource(resource) ?? [];
    if (scopes.includes("all")) return;
    const LEVEL: Record<TScope, number> = { own: 0, tenant: 1, all: 2 };
    if (!scopes.some((s) => (LEVEL[s as TScope] ?? 0) >= LEVEL[minScope])) {
      return { getStatus: () => 403, message: "Insufficient permissions" };
    }
  }

  /**
   * Guard access to an existing record.
   * Returns undefined if allowed, or an error if denied.
   */
  guardResourceAccess(
    resource: string,
    existing: Record<string, unknown>,
  ): { getStatus: () => number; message: string } | undefined {
    const userId = this.ctx?.getUserId();
    const tenantId = this.ctx?.getTenantId();
    const scopes = this.ctx?.getScopesForResource(resource) ?? [];

    if (scopes.includes("all")) return;

    if (scopes.includes("tenant") && tenantId) {
      if ((existing as any).tenantId && (existing as any).tenantId !== tenantId) {
        return { getStatus: () => 403, message: "Tenant scope violation" };
      }
      return;
    }

    if (scopes.includes("own") && userId) {
      if ((existing as any).userId && (existing as any).userId !== userId) {
        return { getStatus: () => 403, message: "Own scope violation" };
      }
      return;
    }

    return { getStatus: () => 403, message: "Access denied" };
  }
}
