
const STATUS_TRANSITION_MAP: Record<string, string> = {
  // Exact matches
  "Policy Dredraft/Redated": "Pending 3 Business Days → Successful Draft or Failed Payment",
  "FCR - Pending Approval": "Issued - Pending First Draft",
  "New App - Pending Approval": "Issued - Pending First Draft",
  
  // Common variations
  "Policy Dredraft": "Pending 3 Business Days → Successful Draft or Failed Payment",
  "Policy Redated": "Pending 3 Business Days → Successful Draft or Failed Payment",
  "Dredraft/Redated": "Pending 3 Business Days → Successful Draft or Failed Payment",
  "FCR Pending Approval": "Issued - Pending First Draft",
  "FCR - Pending": "Issued - Pending First Draft",
  "New App Pending Approval": "Issued - Pending First Draft",
  "New App - Pending": "Issued - Pending First Draft",
  
  // Generic "Pending" statuses (will be determined by context)
  "Pending": "Issued - Pending First Draft", // Default for pending statuses
  "Pending Approval": "Issued - Pending First Draft",
  
  // Charge Back and Payment-related statuses
  "Charge Back": "Awaiting Payment Update → Successful Draft or Failed Payment",
  "Chargeback": "Awaiting Payment Update → Successful Draft or Failed Payment",
  "Chargeback Failed Payment": "Awaiting Payment Update → Successful Draft or Failed Payment",
  "Failed Payment": "Awaiting Payment Update → Successful Draft or Failed Payment",
  
  // Declined statuses
  "Declined": "Review Required → Status Update Needed",
  "Decline": "Review Required → Status Update Needed",
};

/**
 * Get the next expected "Fixed" status based on the status when fixed
 * 
 * @param statusWhenFixed - The status when the policy was marked as Fixed
 * @returns The next expected status, or null if no mapping exists
 */
export function getNextFixedStatus(statusWhenFixed: string | null | undefined): string | null {
  if (!statusWhenFixed) return null;
  
  const normalized = statusWhenFixed.trim();
  
  // First try exact match
  if (STATUS_TRANSITION_MAP[normalized]) {
    return STATUS_TRANSITION_MAP[normalized];
  }
  
  // Try case-insensitive match
  const normalizedLower = normalized.toLowerCase();
  for (const [key, value] of Object.entries(STATUS_TRANSITION_MAP)) {
    if (key.toLowerCase() === normalizedLower) {
      return value;
    }
  }
  
  // Try pattern matching for common statuses
  if (normalizedLower.includes("dredraft") || normalizedLower.includes("redated")) {
    return "Pending 3 Business Days → Successful Draft or Failed Payment";
  }
  
  if (normalizedLower.includes("fcr") && normalizedLower.includes("pending")) {
    return "Issued - Pending First Draft";
  }
  
  if (normalizedLower.includes("new app") && normalizedLower.includes("pending")) {
    return "Issued - Pending First Draft";
  }
  
  if (normalizedLower.includes("pending approval")) {
    return "Issued - Pending First Draft";
  }
  
  if (normalizedLower === "pending") {
    return "Issued - Pending First Draft";
  }
  
  // Pattern matching for charge back / chargeback
  if (normalizedLower.includes("chargeback") || normalizedLower.includes("charge back")) {
    return "Awaiting Payment Update → Successful Draft or Failed Payment";
  }
  
  // Pattern matching for failed payment
  if (normalizedLower.includes("failed payment")) {
    return "Awaiting Payment Update → Successful Draft or Failed Payment";
  }
  
  // Pattern matching for declined
  if (normalizedLower.includes("declined") || normalizedLower.includes("decline")) {
    return "Review Required → Status Update Needed";
  }
  
  return null;
}

/**
 * Check if a status indicates a "Fixed" policy
 * 
 * @param status - The status to check
 * @returns true if the status indicates a fixed policy
 */
export function isFixedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  
  const normalized = status.trim().toLowerCase();
  
  // Check for various "Fixed" status indicators
  // These match the status values that indicate a policy has been fixed
  const fixedIndicators = [
    "fixed",
    "successfully fixed",
    "policy dredraft/redated",
    "dredraft/redated",
    "dredraft",
    "redated",
    "fcr - pending approval",
    "fcr pending approval",
    "new app - pending approval",
    "new app pending approval",
    "pending approval", // If it's FCR or New App with pending approval
  ];
  
  // Check if status contains any fixed indicator
  const containsFixed = fixedIndicators.some((indicator) => normalized.includes(indicator));
  
  // Also check for specific patterns
  const isPolicyDredraft = normalized.includes("policy") && (normalized.includes("dredraft") || normalized.includes("redated"));
  const isFCRPending = normalized.includes("fcr") && normalized.includes("pending");
  const isNewAppPending = normalized.includes("new app") && normalized.includes("pending");
  
  return containsFixed || isPolicyDredraft || isFCRPending || isNewAppPending;
}

/**
 * Get all possible "Fixed" status values
 * 
 * @returns Array of status values that indicate a fixed policy
 */
export function getFixedStatusValues(): string[] {
  return Object.keys(STATUS_TRANSITION_MAP);
}

/**
 * Check if a status requires 3 business days wait (Policy Dredraft/Redated)
 * 
 * @param status - The status to check
 * @returns true if the status requires 3 business days wait
 */
export function requiresThreeBusinessDaysWait(status: string | null | undefined): boolean {
  if (!status) return false;
  
  const normalized = status.trim().toLowerCase();
  return normalized.includes("policy dredraft/redated") || normalized.includes("dredraft");
}

