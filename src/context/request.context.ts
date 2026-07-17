import { Injectable, Logger } from "@nestjs/common";
import { ClsService } from "nestjs-cls";

export type TScope = "own" | "tenant" | "all";

export type ScopeMap = Record<string, TScope[]>;

export interface RequestContextData {
  userId?: string;
  tenantId?: string;
  workspaceType?: "personal" | "organization";
  roles?: Array<{ id: string; name?: string; displayName?: string }>;
  isSuperAdmin?: boolean;
  locale?: string;
}

@Injectable()
export class RequestContext {
  private readonly logger = new Logger(RequestContext.name);

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

  getWorkspaceType(): "personal" | "organization" | undefined {
    return this.cls.get<"personal" | "organization">("workspaceType");
  }

  isPersonalWorkspace(): boolean {
    return this.getWorkspaceType() === "personal";
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

  setWorkspaceType(type: "personal" | "organization"): void {
    this.cls.set("workspaceType", type);
  }

  setScopeMap(scopeMap: ScopeMap): void {
    this.cls.set("scopeMap", scopeMap);
  }

  setFromRequest(data: RequestContextData): void {
    if (data.userId) this.setUserId(data.userId);
    if (data.tenantId) this.setTenantId(data.tenantId);
    if (data.workspaceType) this.setWorkspaceType(data.workspaceType);
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
