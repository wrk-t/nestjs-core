import { ForbiddenDto } from "@wrk-t/ts-exc";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY, Role } from "../decorator/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const hasAccess = requiredRoles.some((role) => user?.role === role);
    if (!hasAccess) {
      throw new ForbiddenDto("errors.insufficient_scope").details({
        requiredRoles,
        userRole: user?.role,
      });
    }

    return true;
  }
}
