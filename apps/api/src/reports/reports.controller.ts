import { Body, Controller, Get, Header, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ReportsService } from "./reports.service";
import { adjustmentSchema, type AdjustmentDto } from "./reports.dto";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ApiError } from "../common/api-error";
import type { Principal } from "../common/principal";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("monthly")
  list(
    @CurrentUser() user: Principal,
    @Query("year") year?: string,
    @Query("month") month?: string,
  ) {
    return this.reports.list(user, Number(year) || undefined, Number(month) || undefined);
  }

  /** Generate or refresh a facility's month. Draft until locked. */
  @Get("monthly/generate")
  generate(
    @CurrentUser() user: Principal,
    @Query("facility") facility: string,
    @Query("year") year: string,
    @Query("month") month: string,
  ) {
    if (!facility) throw ApiError.validation("facility is required");
    return this.reports.generate(user, facility, Number(year), Number(month));
  }

  /** The rows behind one figure. This is what makes a number auditable. */
  @Get("monthly/:id/figures/:key")
  drillDown(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ) {
    return this.reports.drillDown(user, id, key);
  }

  /** Sign-off belongs to the officer-in-charge. */
  @Roles("facility_admin", "system_admin")
  @Post("monthly/:id/lock")
  lock(@CurrentUser() user: Principal, @Param("id") id: string) {
    return this.reports.lock(user, id);
  }

  @Roles("facility_admin", "system_admin")
  @Post("monthly/:id/adjustments")
  adjust(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adjustmentSchema)) dto: AdjustmentDto,
  ) {
    return this.reports.addAdjustment(user, id, {
      figureKey: dto.figure_key,
      toValue: dto.to_value,
      reason: dto.reason,
    });
  }

  @Get("monthly/:id/export")
  @Header("cache-control", "no-store")
  async export(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Query("format") format = "csv",
    @Res() res: Response,
  ) {
    const result = await this.reports.export(user, id, format);
    res.setHeader("content-type", result.contentType);
    res.setHeader(
      "content-disposition",
      `attachment; filename="phc-track-report-${id}.${format === "csv" ? "csv" : "json"}"`,
    );
    res.send(result.body);
  }

  /** LGA rollup: oversight roles only, and locked reports only. */
  @Roles("lga_authority", "system_admin")
  @Get("lga")
  lga(
    @CurrentUser() user: Principal,
    @Query("year") year: string,
    @Query("month") month: string,
  ) {
    return this.reports.lgaRollup(user, Number(year), Number(month));
  }
}
