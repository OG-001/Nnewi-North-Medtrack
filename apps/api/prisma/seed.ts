/**
 * Hub seed.
 *
 * TWO PARTS, WITH DIFFERENT SAFETY PROPERTIES.
 *
 * 1. The facility registry. Hub-authoritative configuration, needed in every
 *    environment including production.
 * 2. Demo staff accounts, mirroring the logins in RUNNING.md so the same
 *    credentials work against the API as against the offline PWA.
 *
 * Part 2 must never reach a real deployment. The PINs are four digits, they are
 * published in RUNNING.md, and they include `sysadmin` with PIN 0000 holding
 * `system_admin` across every facility in the LGA. Seeding that against a
 * database holding real patient records hands anyone who has read the
 * repository full access to all of it.
 *
 * So the demo accounts are gated on where DATABASE_URL actually points, not on
 * a flag someone has to remember. A local host gets them; anything else does
 * not, unless SEED_DEMO_USERS is set explicitly. Deciding from the target means
 * the safe outcome is the default one.
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import {
  NNEWI_NORTH_FACILITIES,
  facilityId,
  shortFacilityCode,
  type Role,
} from "@phc/shared";

const prisma = new PrismaClient();

const CENTRAL = "0062"; // Primary Health Centre Umuenem Otolo Nnewi
const SECOND = "0060"; // Obiagu Health Post, Uruagu, Nnewi

/**
 * Is DATABASE_URL pointing at this machine?
 *
 * Parsed rather than string-matched, so a database named "localhost" on a
 * remote host cannot read as local. A URL that will not parse is treated as
 * remote: when the target cannot be established, the safe answer is no.
 */
function targetIsLocal(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

function demoUsersAllowed(): boolean {
  if (process.env.SEED_DEMO_USERS === "true") return true;
  return targetIsLocal();
}

async function main() {
  // ---- Facilities: the full LGA registry (hub-authoritative config) ----
  for (const entry of NNEWI_NORTH_FACILITIES) {
    const id = facilityId(entry);
    await prisma.facility.upsert({
      where: { id },
      create: {
        id,
        code: shortFacilityCode(entry),
        name: entry.name,
        nationalCode: `04/14/1/1/${entry.number}`,
        type: entry.facilityType === "secondary" ? "referral" : "phc",
        lga: "Nnewi North",
        state: "Anambra",
        active: true,
      },
      update: { name: entry.name },
    });
  }

  const provisioned = [CENTRAL, SECOND];
  const allFacilityIds = NNEWI_NORTH_FACILITIES.map(facilityId);

  const mkUser = async (
    id: string,
    fullName: string,
    username: string,
    roles: Role[],
    pin: string,
    facilityIds: string[],
  ) => {
    const pinHash = await argon2.hash(pin);
    await prisma.user.upsert({
      where: { id },
      create: { id, username, fullName, pinHash, roles, status: "active" },
      update: { pinHash, roles, fullName },
    });
    await prisma.userFacility.deleteMany({ where: { userId: id } });
    await prisma.userFacility.createMany({
      data: facilityIds.map((facilityId) => ({ userId: id, facilityId })),
      skipDuplicates: true,
    });
  };

  if (!demoUsersAllowed()) {
    const facilities = await prisma.facility.count();
    console.log(`Seeded ${facilities} facilities.`);
    console.log("");
    console.log("Demo staff accounts were SKIPPED: DATABASE_URL is not a local host.");
    console.log("Their PINs are four digits and published in RUNNING.md, and they");
    console.log("include `sysadmin` (PIN 0000) with system_admin across every facility.");
    console.log("");
    console.log("Provision real staff through the admin screens, which hash a PIN the");
    console.log("account holder chooses. To override this deliberately, for example to");
    console.log("load a throwaway staging database, set SEED_DEMO_USERS=true.");
    return;
  }

  // Clinical staff are provisioned per facility — a nurse at one PHC cannot
  // sign in at another (RUNNING.md, scoped authentication).
  for (const number of provisioned) {
    const fid = `fac-${number}`;
    await mkUser(`u-clerk-${number}`, "Adaeze Okonkwo", "clerk", ["records_clerk"], "1111", [fid]);
    await mkUser(`u-nurse-${number}`, "Ngozi Eze", "nurse", ["nurse_midwife"], "2222", [fid]);
    await mkUser(`u-chew-${number}`, "Emeka Nwosu", "chew", ["chew"], "3333", [fid]);
    await mkUser(`u-doctor-${number}`, "Dr. Chidi Obi", "doctor", ["doctor_mo"], "4444", [fid]);
    await mkUser(`u-admin-${number}`, "Mrs. Ifeoma Udeh", "admin", ["facility_admin"], "5555", [fid]);
  }

  // Oversight roles span the LGA. `sysadmin` holds system_admin across every
  // facility, so of everything in this file it is the one that must never exist
  // on a real deployment.
  await mkUser("u-lga", "Mr. Tochukwu M&E", "lga", ["lga_authority"], "6666", allFacilityIds);
  await mkUser("u-sys", "System Admin", "sysadmin", ["system_admin"], "0000", allFacilityIds);

  const facilities = await prisma.facility.count();
  const users = await prisma.user.count();
  console.log(`Seeded ${facilities} facilities and ${users} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
