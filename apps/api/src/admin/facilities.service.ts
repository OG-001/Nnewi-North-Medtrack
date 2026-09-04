import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import type { Principal } from "../common/principal";
import type { CreateFacilityDto, UpdateFacilityDto } from "./admin.dto";

/**
 * Facility administration. System administrator only: a facility is the unit of
 * data isolation, so creating or renaming one changes who can see what.
 *
 * A facility is never deleted. Staff accounts, patients and an audit trail hang
 * off it, so it is deactivated instead and stops appearing as a sign-in option.
 */
@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeInactive = false) {
    return this.prisma.facility.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: "asc" },
    });
  }

  async create(principal: Principal, dto: CreateFacilityDto) {
    const existing = await this.prisma.facility.findFirst({
      where: { OR: [{ id: dto.id }, { code: dto.code }] },
    });
    if (existing) {
      throw ApiError.validation(
        existing.id === dto.id
          ? `A facility with id "${dto.id}" already exists`
          : `Facility code "${dto.code}" is already in use`,
      );
    }

    const facility = await this.prisma.facility.create({
      data: {
        id: dto.id,
        code: dto.code,
        name: dto.name,
        nationalCode: dto.national_code,
        type: dto.type,
        ward: dto.ward,
        town: dto.town,
        lga: dto.lga,
        state: dto.state,
        contactPhone: dto.contact_phone,
        active: true,
      },
    });

    await this.audit(principal, "facility_created", facility.id, { name: dto.name, code: dto.code });
    return facility;
  }

  async update(principal: Principal, id: string, dto: UpdateFacilityDto) {
    const existing = await this.prisma.facility.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Facility not found");

    // Deactivating a facility removes a sign-in option for its staff, so it is
    // worth being explicit that it is not a delete and nothing is lost.
    const facility = await this.prisma.facility.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        nationalCode: dto.national_code,
        type: dto.type,
        ward: dto.ward,
        town: dto.town,
        lga: dto.lga,
        state: dto.state,
        contactPhone: dto.contact_phone,
        active: dto.active,
      },
    });

    await this.audit(principal, "facility_updated", id, {
      from_active: existing.active,
      to_active: facility.active,
      name: facility.name,
    });
    return facility;
  }

  /** Staff counts per facility, for the admin list. */
  async staffCounts() {
    const rows = await this.prisma.userFacility.groupBy({
      by: ["facilityId"],
      _count: { userId: true },
    });
    return Object.fromEntries(rows.map((r) => [r.facilityId, r._count.userId]));
  }

  private async audit(
    principal: Principal,
    action: string,
    facilityId: string,
    details: Record<string, unknown>,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action,
        entityType: "facility",
        entityId: facilityId,
        facilityId,
        deviceId: principal.deviceId,
        details: details as Prisma.InputJsonValue,
      },
    });
  }
}
