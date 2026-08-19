import { Body, Controller, Post, UsePipes } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { loginSchema, refreshSchema, type LoginDto, type RefreshDto } from "./auth.dto";
import { ZodValidationPipe } from "../common/zod.pipe";
import { Public } from "../common/decorators/roles.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.pin, dto.facility_id, dto.device_id);
  }

  /** PIN re-auth on a shared device is the same check, scoped to the facility. */
  @Public()
  @Post("pin")
  @UsePipes(new ZodValidationPipe(loginSchema))
  pin(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.pin, dto.facility_id, dto.device_id);
  }

  @Public()
  @Post("refresh")
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Public()
  @Post("logout")
  @UsePipes(new ZodValidationPipe(refreshSchema))
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refresh_token);
  }
}
