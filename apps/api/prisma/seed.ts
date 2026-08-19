/**
 * Hub seed — mirrors the demo logins in RUNNING.md so the same credentials work
 * against the API as against the offline PWA. PINs are argon2-hashed here; the
 * plaintext PINs live only in the demo docs.
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

  // Oversight roles span the LGA.
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
