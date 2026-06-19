/**
 * Official health-facility registry for Nnewi North LGA (Anambra State).
 *
 * Source: LGA facility master list. Each facility's national code is
 *   <STATE>/<LGA>/<FACILITY_TYPE>/<OWNERSHIP>/<FACILITY_NUMBER>
 * e.g. 04/14/1/1/0055 — Anambra(04) · Nnewi North(14) · Primary(1) · Public(1) · 0055.
 *
 * This list is the authoritative set the user picks from at the door
 * (facility-selection screen). Selecting a facility scopes the whole session to
 * it; staff can only sign in against accounts provisioned for that facility, and
 * every read is filtered by facility_id (see apps/web/src/lib/scope.ts).
 */

export const ANAMBRA_STATE_CODE = "04";
export const NNEWI_NORTH_LGA_CODE = "14";

export type FacilityTypeLabel = "primary" | "secondary";
export type OwnershipLabel = "public" | "private";

export interface FacilityRegistryEntry {
  /** 4-digit facility number, unique within the LGA (e.g. "0055"). */
  number: string;
  name: string;
  facilityType: FacilityTypeLabel;
  ownership: OwnershipLabel;
}

/** Facility-type digit used in the national code (1 = Primary, 2 = Secondary). */
export function facilityTypeCode(t: FacilityTypeLabel): "1" | "2" {
  return t === "primary" ? "1" : "2";
}

/** Ownership digit used in the national code (1 = Public, 2 = Private). */
export function ownershipCode(o: OwnershipLabel): "1" | "2" {
  return o === "public" ? "1" : "2";
}

/** Full national facility code, e.g. "04/14/1/1/0055". */
export function nationalFacilityCode(e: FacilityRegistryEntry): string {
  return [
    ANAMBRA_STATE_CODE,
    NNEWI_NORTH_LGA_CODE,
    facilityTypeCode(e.facilityType),
    ownershipCode(e.ownership),
    e.number,
  ].join("/");
}

/** Short, MRN-friendly code, e.g. "NNW0055". */
export function shortFacilityCode(e: FacilityRegistryEntry): string {
  return `NNW${e.number}`;
}

/** Best-effort ward/area parsed from the facility name (display only). */
export function facilityArea(name: string): string {
  const areas = ["Umudim", "Nnewichi", "Uruagu", "Otolo"];
  const hit = areas.find((a) => name.toLowerCase().includes(a.toLowerCase()));
  return hit ?? "Nnewi";
}

/** Stable id for a registry facility (used as the DB primary key). */
export function facilityId(e: FacilityRegistryEntry): string {
  return `fac-${e.number}`;
}

/**
 * The registry, in source order. Use {@link sortedFacilities} for the
 * alphabetical list shown to users.
 */
export const NNEWI_NORTH_FACILITIES: FacilityRegistryEntry[] = [
  { number: "0055", name: "Obiuno Akamili Health Post, Umudim Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0056", name: "Akamili Health Clinic Umudim Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0057", name: "Okpuno-Egbu Health Centre, Umudim Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0058", name: "Abubo-Nnewichi Health Centre Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0059", name: "Eme Court Health Centre Umudimkwa Umudim", facilityType: "primary", ownership: "public" },
  { number: "0060", name: "Obiagu Health Post, Uruagu, Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0061", name: "Ndiezenwankwo Health Centre Uruagu Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0062", name: "Primary Health Centre Umuenem Otolo Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0063", name: "Mbanagu Health Centre, Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0064", name: "F. A. Okolo Mem. Hospital, Umudim Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0065", name: "The Light Maternity Hospital, Umudim Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0066", name: "Cith Med Centre Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0067", name: "Mainland Hospital, Nnewichi", facilityType: "secondary", ownership: "private" },
  { number: "0068", name: "St. Anthony's Maternity Otolo Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0069", name: "Zenith Maternity Hospital, Otolo Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0070", name: "Chisom Hospital, Nnewichi Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0071", name: "Trinity Hosp. Nnobi Rd. Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0072", name: "First Maternity Hospital, Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0073", name: "Family Care Clinic & Mat. Obinagu Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0074", name: "Mbanagu Hosp. Otolo", facilityType: "primary", ownership: "private" },
  { number: "0075", name: "Ibeto Factory Clinic Igwe Orizu Rd Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0076", name: "Hope House Clinic Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0077", name: "Hope Spec. Hosp. 100 Igwe Orizu Rd Otolo", facilityType: "primary", ownership: "private" },
  { number: "0078", name: "Anglican Dioceses Hosp/Mat Otolo", facilityType: "secondary", ownership: "private" },
  { number: "0079", name: "Immaculate Heart Mat. Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0080", name: "Christ the King Mat. Otolo", facilityType: "secondary", ownership: "private" },
  { number: "0081", name: "Sanamaritain Clinic Obiagu Rd", facilityType: "secondary", ownership: "private" },
  { number: "0082", name: "Uchenna Mat. Home Ndimgbu Otolo", facilityType: "secondary", ownership: "private" },
  { number: "0083", name: "Anaedo Hosp. Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0084", name: "Father Damian Mem. Cath. Leprosy Otolo", facilityType: "secondary", ownership: "private" },
  { number: "0085", name: "Uchenna Hosp. Okpuno Nnewichi", facilityType: "primary", ownership: "private" },
  { number: "0086", name: "Mary Queen Hosp./Mat. Odida, Nnewichi", facilityType: "primary", ownership: "private" },
  { number: "0087", name: "Isaac Ucheagwu Mem. Mat. Obi Ofia Rd Nnewichi Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0088", name: "Chimese Clinic St. Ezimewi Rd Nnewichi", facilityType: "primary", ownership: "private" },
  { number: "0089", name: "St. Thomas Spec. Hosp. Otolo", facilityType: "primary", ownership: "private" },
  { number: "0090", name: "Ogweleka's Clinic Nnewichi", facilityType: "primary", ownership: "private" },
  { number: "0091", name: "Alponso Chikezie Mem. Hosp. Obiofia Nnewichi", facilityType: "primary", ownership: "private" },
  { number: "0092", name: "Christ the King Hosp/Mat Afor Ubu, Otolo Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0093", name: "Afoma Mat. Home Mbanakwu Nnewichi Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0094", name: "Charity Clinic No.35 Muoneke St Okpuno-Otolo", facilityType: "primary", ownership: "private" },
  { number: "0095", name: "Isaac C. Ibeanu Mem. Hosp/Mat Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0096", name: "Love World Spec. Hosp. Otolo", facilityType: "primary", ownership: "private" },
  { number: "0097", name: "St. Anthony's Clinic Otolo", facilityType: "primary", ownership: "private" },
  { number: "0098", name: "Childera Hosp./Mat Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0099", name: "Dominion Child Health Services Otolo", facilityType: "primary", ownership: "private" },
  { number: "0100", name: "Shalom Med. Clinic Otolo", facilityType: "primary", ownership: "private" },
  { number: "0101", name: "Mbaname Mat. Home Otolo", facilityType: "primary", ownership: "private" },
  { number: "0102", name: "Chinaeme Mat. Home Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0103", name: "Obinma Spec. Hosp./Mat. Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0104", name: "New Spring Hosp. Nkwo-Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0105", name: "Onyekachukwu Clinic Otolo", facilityType: "primary", ownership: "private" },
  { number: "0106", name: "Okwudili Children's Hosp. Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0107", name: "Chicason Mannyo Spec. Hosp. Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0108", name: "Symbol Spec. Hosp. Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0109", name: "Ezekwuabor PHC III Otolo Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0110", name: "Edorji Primary Health Centre Uruagu Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0111", name: "Akaboukwu Health Post, Uruagu Nnewi", facilityType: "primary", ownership: "public" },
  { number: "0112", name: "Umumejiaku Health Post, Uruagu", facilityType: "primary", ownership: "public" },
  { number: "0113", name: "Inyaba Maternity Hospital, Umudim Nnewi", facilityType: "secondary", ownership: "public" },
  { number: "0114", name: "Arize Nathrycdia Mat. Umudim", facilityType: "primary", ownership: "private" },
  { number: "0115", name: "All Saints Mat. Umudim", facilityType: "primary", ownership: "private" },
  { number: "0116", name: "Grace & Truth Spec. Hosp. Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0117", name: "Adimis Hosp/Mat Onitsha Rd Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0118", name: "Peace Hosp/Mat Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0119", name: "Ngozichukwu Hosp/Mat Umudim", facilityType: "primary", ownership: "private" },
  { number: "0120", name: "Chukwudum Hosp. No.39 Eme Court Rd Umudim", facilityType: "secondary", ownership: "private" },
  { number: "0121", name: "Immaculate Heart Hosp/Mat Okwuani-Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0122", name: "Anaedo Mat. Home Nnewi", facilityType: "primary", ownership: "private" },
  { number: "0123", name: "Obinna Clinic No.23 Chief Izundu Rd Umudim", facilityType: "primary", ownership: "private" },
  { number: "0124", name: "Life Spec. Hosp/Mat No.3 Ikemba Drive Umudim", facilityType: "primary", ownership: "private" },
  { number: "0125", name: "Piex Hosp/Mat. Amukor Umudim Nnewi", facilityType: "secondary", ownership: "private" },
  { number: "0126", name: "Myles Spec. Hosp. Umudim", facilityType: "primary", ownership: "private" },
  { number: "0127", name: "Inyaba Hosp. Umudim", facilityType: "primary", ownership: "private" },
  { number: "0128", name: "Amex Spec. Hosp. Umudim", facilityType: "primary", ownership: "private" },
  { number: "0129", name: "Osita Mat. Home Umudim", facilityType: "primary", ownership: "private" },
  { number: "0130", name: "The Okonkwo Med. Clinic Umudim", facilityType: "primary", ownership: "private" },
];

/** The registry sorted alphabetically by name (case-insensitive). */
export function sortedFacilities(
  list: FacilityRegistryEntry[] = NNEWI_NORTH_FACILITIES,
): FacilityRegistryEntry[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}
