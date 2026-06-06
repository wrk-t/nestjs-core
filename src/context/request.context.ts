import type { ClsService } from "nestjs-cls";

/**
 * Permission scope levels used for access control.
 */
export type TScope = "own" | "tenant" | "all";

/**
 * A map of resource name → effective scopes for the current user.
 * Built by AuthGuard after resolving role_permission assignments.
 */
export type ScopeMap = Record<string, TScope[]>;

/**
 * RequestContext — CLS-based storage for the current request's
 * user, tenant, roles, locale, and permission scope map.
 *
 * Populated by AuthGuard during request authentication.
 * Read by repositories and services to apply data scoping.
 */
export class RequestContext {
  constructor(private readonly cls: ClsService) {}

  // ── Getters ────────────────────────────────────────────────

  getUserId(): string | undefined {
    return this.cls.get<string>("userId");
  }

  getTenantId(): string | undefined {
    return this.cls.get<string>("tenantId");
  }

  getRoles(): Array<{ id: string; name?: string; displayName?: string }> {
    return (
      this.cls.get<Array<{ id: string; name?: string; displayName?: string }>>(
        "roles",
      ) ?? []
    );
  }

  getIsSuperAdmin(): boolean {
    return this.cls.get<boolean>("isSuperAdmin") ?? false;
  }

  getLocale(): string {
    return this.cls.get<string>("locale") ?? "en";
  }

  getScopesForResource(resource: string): TScope[] {
    return this.getScopeMap()[resource] ?? [];
  }

  getScopeMap(): ScopeMap {
    return this.cls.get<ScopeMap>("scopeMap") ?? {};
  }

  // ── Setters ────────────────────────────────────────────────

  setUserId(userId: string): void {
    this.cls.set("userId", userId);
  }

  setTenantId(tenantId: string): void {
    this.cls.set("tenantId", tenantId);
  }

  setRoles(
    roles: Array<{ id: string; name?: string; displayName?: string }>,
  ): void {
    this.cls.set("roles", roles);
  }

  setIsSuperAdmin(isSuperAdmin: boolean): void {
    this.cls.set("isSuperAdmin", isSuperAdmin);
  }

  setLocale(locale: string): void {
    this.cls.set("locale", locale);
  }

  setScopeMap(scopeMap: ScopeMap): void {
    this.cls.set("scopeMap", scopeMap);
  }

  // ── Bulk ───────────────────────────────────────────────────

  setFromRequest(data: {
    userId?: string;
    tenantId?: string;
    roles?: Array<{ id: string; name?: string; displayName?: string }>;
    isSuperAdmin?: boolean;
    locale?: string;
  }): void {
    if (data.userId) this.setUserId(data.userId);
    if (data.tenantId) this.setTenantId(data.tenantId);
    if (data.roles) this.setRoles(data.roles);
    if (data.isSuperAdmin !== undefined)
      this.setIsSuperAdmin(data.isSuperAdmin);
    if (data.locale) this.setLocale(data.locale);
  }

  clear(): void {
    this.cls.set("userId", undefined);
    this.cls.set("tenantId", undefined);
    this.cls.set("roles", undefined);
    this.cls.set("isSuperAdmin", undefined);
    this.cls.set("scopeMap", undefined);
    this.cls.set("locale", undefined);
  }
}
