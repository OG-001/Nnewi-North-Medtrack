import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Principal } from "../principal";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal =>
    ctx.switchToHttp().getRequest().principal,
);
