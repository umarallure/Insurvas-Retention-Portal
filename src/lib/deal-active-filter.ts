/**
 * Deal Active Status Filter
 * 
 * Utility functions to filter deals based on active status criteria.
 * This ensures certain policies are excluded from the retention portal.
 * 
 * Exclusion Rules:
 * 1. Carrier is GTL (any GTL deal, regardless of other conditions)
 * 2. Carrier is CICA (any CICA deal, regardless of other conditions)
 * 3. Carrier is Corebridge AND policy_type is GI AND GHL stage contains 'Chargeback'
 *    (failed payments are OK, only chargeback makes it inactive)
 */

/**
 * Check if a deal should be active based on exclusion criteria
 */
export function shouldDealBeActive(
  carrier: string | null | undefined,
  policyType: string | null | undefined,
  ghlStage: string | null | undefined
): boolean {
  const carrierNormalized = (carrier ?? "").trim().toUpperCase();
  const policyTypeNormalized = (policyType ?? "").trim().toUpperCase();
  const ghlStageNormalized = (ghlStage ?? "").trim().toUpperCase();

  // Rule 1: GTL carrier - always inactive (regardless of other conditions)
  if (carrierNormalized.includes("GTL")) {
    return false;
  }

  // Rule 2: CICA carrier - always inactive (regardless of other conditions)
  if (carrierNormalized.includes("CICA")) {
    return false;
  }

  // Rule 3: Corebridge with GI product type and Chargeback (failed payments can be included)
  // Only chargeback makes it inactive, failed payments are OK
  if (carrierNormalized.includes("COREBRIDGE")) {
    // Check if policy_type is "GI" (exact match or starts with "GI ")
    // This excludes "Non GI" which contains "GI" but doesn't start with it
    if (
      (policyTypeNormalized === "GI" || policyTypeNormalized.startsWith("GI ")) &&
      ghlStageNormalized.includes("CHARGEBACK")
    ) {
      return false;
    }
  }

  // If none of the exclusion rules match, deal is active
  return true;
}

/**
 * Add active filter to Supabase query builder
 * This is a helper to ensure consistent filtering across all queries
 */
export function addActiveDealFilter<T extends { eq: (column: string, value: unknown) => T }>(
  query: T
): T {
  return query.eq("is_active", true) as T;
}

