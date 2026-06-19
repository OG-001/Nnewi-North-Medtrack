import { useMemo } from "react";
import { useSession } from "./session";

/**
 * Data-scope helper (user-roles §3): facility-bound roles see only the selected
 * facility; LGA/system roles read across all facilities.
 */
export function useScope() {
  const { roles, facilityId, user } = useSession();
  return useMemo(() => {
    const isLgaWide = roles.includes("lga_authority") || roles.includes("system_admin");
    const facilityIds = isLgaWide ? null : user?.facility_ids ?? (facilityId ? [facilityId] : []);
    return {
      isLgaWide,
      currentFacilityId: facilityId,
      /** null => all facilities (LGA scope). */
      facilityIds,
      inScope(rec: { facility_id: string; deleted_at: string | null }): boolean {
        if (rec.deleted_at) return false;
        if (isLgaWide) return true;
        return rec.facility_id === facilityId;
      },
    };
  }, [roles, facilityId, user]);
}

export function notDeleted<T extends { deleted_at: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted_at);
}
