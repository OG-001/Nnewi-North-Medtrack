# 2026-06-09 — Facility selection door screen + per-facility data isolation

**Author:** Build model
**Phases touched:** 1 (identity — facility-scoped auth), 9 (admin — registry-backed facility list)
**Status:** Done

---

## What shipped

### Full LGA facility registry (`packages/shared/src/facilities.ts`)

All 76 health facilities in Nnewi North LGA are now the canonical source of truth
for the facility list. Each entry carries:
- Name (corrected spelling, title-cased)
- National code components: state `04`, LGA `14`, facility-type digit, ownership
  digit, and 4-digit facility number (e.g. `04/14/1/1/0062`)
- Facility type: `primary` / `secondary`
- Ownership: `public` / `private`

Helper functions (`nationalFacilityCode`, `shortFacilityCode`, `facilityArea`,
`sortedFacilities`) live in `packages/shared` and are re-exported from the index,
ready for the NestJS API to use directly.

### Facility-selection door screen (`apps/web/src/pages/FacilitySelect.tsx`)

- Alphabetically sorted list of all active facilities (live from IndexedDB)
- Search bar filters by name, national code, or ward/area
- Toggle filters: **All** / **Public** / **Primary**
- Displays name, national code, facility type, and ownership badge per row
- Selecting a facility persists the choice (`localStorage`) and navigates to sign-in

### Facility-scoped sign-in (`apps/web/src/pages/Login.tsx` + `src/lib/session.tsx`)

- **Chosen facility banner** shown on the sign-in page with a "Change PHC" link
- **Demo account chips** are filtered to only accounts provisioned at the selected
  facility — non-provisioned facilities show "No staff accounts yet"
- **Login is facility-gated:** `session.tsx` now rejects a correct username/PIN if
  the account's `facility_ids` does not include the selected facility, returning
  "That account is not provisioned for this facility." Client-side enforcement only
  (server-side scope is Phase 3)

### Seed update (`apps/web/src/db/seed.ts`)

- All 76 registry facilities are seeded into IndexedDB on first run
- Two real public PHCs provisioned with demo staff + clinical data:
  - **Primary Health Centre Umuenem Otolo Nnewi** (`NNW0062`) — full demo dataset
  - **Obiagu Health Post, Uruagu** (`NNW0060`) — small, distinct patient set
- Clinical staff are scoped to exactly one facility in `facility_ids`; oversight
  roles (`lga_authority`, `system_admin`) carry all facility IDs
- Seed-version guard (`SEED_VERSION = "2"` in `localStorage`) triggers an automatic
  one-time local reseed and clears stale session keys when the seed shape changes

### Facility type extended (`apps/web/src/db/types.ts`)

`Facility` interface gains optional fields: `facility_type`, `ownership`,
`national_code`, `facility_number`; `ward`, `town`, `contact_phone` relaxed to
optional (the registry is the authority, not free-text entry).

### Admin → Facilities tab (`apps/web/src/pages/Admin.tsx`)

Add-facility form updated to match the registry schema (facility number,
facility-type dropdown, ownership dropdown); national code rendered in the list.

---

## Data isolation: how it works

Three layers, first two active now:

| Layer | Mechanism | Status |
|---|---|---|
| Scoped authentication | `login()` cross-checks `account.facility_ids` vs. the selected facility. Wrong facility → rejection. | Active (client) |
| Client-side data-scope | All reads filtered by `facilityId` via `useScope()`. LGA/system oversight roles are the deliberate cross-facility exception. | Active (client) |
| Server-side sync scope | NestJS hub ships only a facility's rows to its device. Tamper-proof, network-layer enforcement. | Deferred — Phase 3 |

Client checks are a usability and UX fence. The production guarantee requires the
server-side sync scope from Phase 3; do not consider isolation "complete" until
the hub enforces it.

---

## Decisions taken

- All 76 facilities in the registry are seeded unconditionally. Most start empty
  (no staff). This is intentional: the door screen shows the real LGA picture,
  and facility admins/system admins provision staff as needed.
- Spelling and formatting in the registry was lightly corrected (e.g. "Hosp."
  instead of "hosp", "Mat." instead of "Mat"). The facility numbers and ownership/
  type classifications are verbatim from the source list.
- Facility number `0109` in the source ("Ezekwuabor PHC III Otolo Nnewi") is
  listed as `ownership: public` in the source despite an ownership-code column of
  `2` (private). Kept as `public` to match the source's ownership column text.

## Deviations

None. This work is additive to what Phase 1 (identity) and Phase 9 (admin) call
for; it does not break any plan constraint.

## Open questions updated

- **Q1 (facility list):** Closed — the full registry is now seeded and the UI
  uses it. Admin can add facilities using the updated form.
- **Cross-facility isolation (client-only):** The plan's §3 server-side scope
  requirement remains open until Phase 3. Document in the sync hub phase.

## Next

1. Build the NestJS sync hub (`apps/api`) and add server-side scope enforcement
   to the pull/push endpoints — this is the production isolation guarantee.
2. Provision admin UX to add/edit staff for any facility (currently only works
   for the signed-in facility; LGA admin needs cross-facility provisioning).
3. Offline e2e (Playwright): add a test that selects a facility, signs in, registers
   a patient, goes offline, reloads, confirms data persists.
