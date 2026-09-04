import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CONFIG_KEYS,
  DEFAULT_CLINICAL_CONFIG,
  validateConfig,
  type ConfigKey,
} from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import type { Principal } from "../common/principal";

@Injectable()
export class ClinicalConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private assertKey(key: string): asserts key is ConfigKey {
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
      throw ApiError.notFound(`Unknown config key "${key}"`);
    }
  }

  /**
   * Read one config value.
   *
   * Falls back to the shipped default when the hub has never had it saved, so a
   * fresh deployment schedules children correctly before an admin has touched
   * anything.
   */
  async get(key: string) {
    this.assertKey(key);
    const row = await this.prisma.appConfig.findUnique({ where: { key } });
    if (!row) {
      return { key, value: DEFAULT_CLINICAL_CONFIG[key], version: 0, updatedAt: null, isDefault: true };
    }
    return {
      key,
      value: row.value,
      version: row.version,
      updatedAt: row.updatedAt,
      isDefault: false,
    };
  }

  /** The whole bundle, which is what a device caches in one request. */
  async getAll() {
    const entries = await Promise.all(CONFIG_KEYS.map((key) => this.get(key)));
    return {
      config: Object.fromEntries(entries.map((e) => [e.key, e.value])),
      versions: Object.fromEntries(entries.map((e) => [e.key, e.version])),
    };
  }

  /**
   * Save a config value.
   *
   * Validated against the shared schema before it is stored: this decides when
   * children are due vaccines, so a malformed edit must be refused at the point
   * of editing rather than discovered later in a due list.
   */
  async put(principal: Principal, key: string, value: unknown) {
    this.assertKey(key);

    const result = validateConfig(key, value);
    if (!result.ok) {
      throw ApiError.validation("Configuration failed validation", result.issues);
    }

    const existing = await this.prisma.appConfig.findUnique({ where: { key } });
    const saved = await this.prisma.appConfig.upsert({
      where: { key },
      create: {
        key,
        value: result.value as unknown as Prisma.InputJsonValue,
        version: 1,
        updatedBy: principal.userId,
      },
      update: {
        value: result.value as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedBy: principal.userId,
      },
    });

    // A schedule change alters clinical scheduling for every patient from here
    // on, so it is audited with both versions identifiable.
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action: "config_changed",
        entityType: "app_config",
        entityId: key,
        details: {
          from_version: existing?.version ?? 0,
          to_version: saved.version,
        },
      },
    });

    return saved;
  }
}
