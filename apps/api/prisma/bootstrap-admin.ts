/**
 * Create the first administrator on an empty database.
 *
 * WHY THIS EXISTS. Staff accounts are created through `POST /admin/staff`, which
 * requires `facility_admin` or `system_admin`. That needs a signed-in user, which
 * needs a user to exist. On a production database, where `prisma/seed.ts`
 * deliberately skips the demo accounts, there are none. Without this script the
 * only ways in are to re-run the seed with `SEED_DEMO_USERS=true`, which plants
 * accounts whose four-digit PINs are published in RUNNING.md, or to write rows
 * by hand. Both are worse than a narrow, audited bootstrap.
 *
 * It is deliberately a one-shot: it refuses to run if any user already exists,
 * so it cannot be used to quietly add a second platform-wide administrator to a
 * live system. Every later account is created through the admin screens, where
 * the grant is checked against the caller's own roles and scope.
 *
 * Usage, from the repository root:
 *
 *   DATABASE_URL="<pooled>" \
 *   BOOTSTRAP_ADMIN_USERNAME="your.name" \
 *   BOOTSTRAP_ADMIN_PIN="<8 to 12 characters>" \
 *     pnpm db:bootstrap-admin
 *
 * The PIN comes from the environment rather than an argument, because an
 * argument is visible to anything that can read the process table and lands in
 * shell history.
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { BREAK_GLASS_PIN_MAX, BREAK_GLASS_PIN_MIN, breakGlassPinSchema } from "@phc/shared";

const prisma = new PrismaClient();

// Bounds and the rule itself live in packages/shared/src/pin.ts, so this
// script, the admin screen and the login endpoint cannot drift apart again.

async function main() {
  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? "").trim();
  const pin = process.env.BOOTSTRAP_ADMIN_PIN ?? "";

  if (!username) {
    throw new Error("BOOTSTRAP_ADMIN_USERNAME is required.");
  }
  const checked = breakGlassPinSchema.safeParse(pin);
  if (!checked.success) {
    throw new Error(
      `BOOTSTRAP_ADMIN_PIN: ${checked.error.issues.map((i) => i.message).join(" ")}\n` +
        `This account reaches every facility in the LGA, so it needs ` +
        `${BREAK_GLASS_PIN_MIN} to ${BREAK_GLASS_PIN_MAX} characters, not a clinic PIN.`,
    );
  }

  // One-shot. A database with any user in it is not being bootstrapped, and
  // this script must never be a way to add a second platform-wide admin.
  const existing = await prisma.user.count();
  if (existing > 0) {
    throw new Error(
      `Refusing to run: the database already has ${existing} user(s).\n` +
        "This script only initialises an empty database. Create further accounts\n" +
        "through the admin screens, where the grant is checked against the\n" +
        "caller's own roles and scope and is audited to a named actor.",
    );
  }

  // Scoped to every facility, because this account's first job is to create the
  // per-facility admins, and it cannot administer a facility it cannot see.
  const facilities = await prisma.facility.findMany({ select: { id: true } });
  if (facilities.length === 0) {
    throw new Error(
      "No facilities found. Run `pnpm db:deploy` then `pnpm db:seed` first, so\n" +
        "the facility registry exists for this account to be scoped to.",
    );
  }

  const id = `u-bootstrap-${Date.now()}`;
  const pinHash = await argon2.hash(pin);

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: { id, username, fullName: username, pinHash, roles: ["system_admin"], status: "active" },
    });
    await tx.userFacility.createMany({
      data: facilities.map((f) => ({ userId: id, facilityId: f.id })),
      skipDuplicates: true,
    });
    // Audited like any other permission grant. There is no signed-in actor to
    // attribute it to, which is itself the thing worth recording.
    await tx.auditEvent.create({
      data: {
        actorUserId: null,
        action: "bootstrap_admin_created",
        entityType: "user",
        entityId: id,
        details: {
          username,
          roles: ["system_admin"],
          facility_count: facilities.length,
          note: "First administrator, created by prisma/bootstrap-admin.ts on an empty database. No signed-in actor.",
        },
      },
    });
  });

  console.log(`Created system_admin "${username}" scoped to ${facilities.length} facilities.`);
  console.log("");
  console.log("Next:");
  console.log("  1. Sign in as this account and create the per-facility admins.");
  console.log("  2. Have each person set their own PIN.");
  console.log("  3. Keep this account for break-glass use only, not daily work.");
  console.log("");
  console.log("This script will now refuse to run again while any user exists.");
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
