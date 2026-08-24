/**
 * Regression: an LGA-wide scope is `null`, and it has to survive the round trip
 * through the JWT into the Principal.
 *
 * Collapsing `null` to `[]` reads as "authorised for no facilities", so an LGA
 * officer or system admin is denied everything rather than granted oversight.
 * It fails closed, which is why it went unnoticed: nothing errors, the data is
 * simply absent.
 */
import { describe, expect, it } from "vitest";
import { inScope, isCrossFacility, type Principal } from "../src/common/principal";

const principal = (facilityScope: string[] | null, roles: Principal["roles"] = []): Principal => ({
  userId: "u1",
  username: "u",
  roles,
  facilityScope,
});

describe("facility scope semantics", () => {
  it("treats null as every facility", () => {
    const lga = principal(null, ["lga_authority"]);
    expect(inScope(lga, "fac-0062")).toBe(true);
    expect(inScope(lga, "fac-0060")).toBe(true);
    expect(inScope(lga, "fac-9999")).toBe(true);
  });

  it("treats an empty array as no facility at all", () => {
    const stranded = principal([]);
    expect(inScope(stranded, "fac-0062")).toBe(false);
  });

  it("keeps a facility-bound principal inside its own facilities", () => {
    const nurse = principal(["fac-0062"], ["nurse_midwife"]);
    expect(inScope(nurse, "fac-0062")).toBe(true);
    expect(inScope(nurse, "fac-0060")).toBe(false);
  });

  it("identifies the cross-facility roles", () => {
    expect(isCrossFacility(["lga_authority"])).toBe(true);
    expect(isCrossFacility(["system_admin"])).toBe(true);
    expect(isCrossFacility(["nurse_midwife"])).toBe(false);
    expect(isCrossFacility(["facility_admin"])).toBe(false);
  });

  it("distinguishes null from empty, which is the whole bug", () => {
    // If these two were treated alike, oversight silently sees nothing.
    expect(inScope(principal(null), "anywhere")).toBe(true);
    expect(inScope(principal([]), "anywhere")).toBe(false);
  });
});
