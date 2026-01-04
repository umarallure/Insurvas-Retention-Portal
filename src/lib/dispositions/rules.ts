/**
 * Disposition Rules Engine
 * Maps policy statuses to available dispositions and their metadata
 */

import type {
  PolicyStatus,
  Disposition,
  DispositionMetadata,
  AgentType,
} from "./types";

// Disposition metadata definitions
export const DISPOSITION_METADATA: Record<Disposition, DispositionMetadata> = {
  // Retention Agent Dispositions
  "New Sale": {
    requiresNotes: false,
    requiresCallback: false,
    affectsGHL: true,
    licensedAgentOnly: false,
    label: "New Sale",
    description: "Client wants to purchase a new policy",
  },
  "Updating Banking/Draft Date": {
    requiresNotes: false,
    requiresCallback: false,
    affectsGHL: true,
    licensedAgentOnly: false,
    label: "Updating Banking/Draft Date",
    description: "Update banking information or draft date",
  },
  "Not Interested": {
    requiresNotes: false,
    requiresCallback: false,
    affectsGHL: false,
    licensedAgentOnly: false,
    label: "Not Interested",
    description: "Client is not interested at this time",
  },
  "Needs Callback": {
    requiresNotes: false,
    requiresCallback: true,
    affectsGHL: false,
    licensedAgentOnly: false,
    label: "Needs Callback",
    description: "Client requested a callback at specific date/time",
  },
  "No Pickup": {
    requiresNotes: false,
    requiresCallback: false,
    affectsGHL: false,
    licensedAgentOnly: false,
    label: "No Pickup",
    description: "Client did not answer the call",
  },
  "DQ": {
    requiresNotes: false,
    requiresCallback: false,
    affectsGHL: true,
    licensedAgentOnly: false,
    label: "DQ (Disqualified)",
    description: "Disqualify and move to chargeback DQ",
  },

  // Licensed Agent Dispositions
  "Chargeback DQ": {
    requiresNotes: false,
    requiresCallback: false,
    affectsGHL: true,
    licensedAgentOnly: true,
    label: "Chargeback DQ",
    description: "Move to chargeback disqualified",
  },
  "Submitted": {
    requiresNotes: false,
    requiresCallback: false,
    affectsGHL: true,
    licensedAgentOnly: true,
    label: "Submitted",
    description: "Application has been submitted",
  },
};

// Map policy statuses to available RA dispositions
export const RA_DISPOSITIONS_BY_STATUS: Record<PolicyStatus, Disposition[]> = {
  "Failed Payment": [
    "New Sale",
    "Updating Banking/Draft Date",
    "Not Interested",
    "Needs Callback",
    "No Pickup",
    "DQ",
  ],
  "Pending Lapse": [
    "New Sale",
    "Updating Banking/Draft Date",
    "Not Interested",
    "Needs Callback",
    "No Pickup",
    "DQ",
  ],
  "Chargeback": [
    "New Sale",
    "Not Interested",
    "Needs Callback",
    "No Pickup",
    "DQ",
  ],
  "Needs to be Sold": [
    "New Sale",
    "Not Interested",
    "Needs Callback",
    "No Pickup",
    "DQ",
  ],
  "Pending Manual Action": [
    "New Sale",
    "Not Interested",
    "Needs Callback",
    "No Pickup",
    "DQ",
  ],
};

// Map policy statuses to available LA dispositions
export const LA_DISPOSITIONS_BY_STATUS: Record<PolicyStatus, Disposition[]> = {
  "Failed Payment": [
    "Needs Callback",
    "Not Interested",
    "Chargeback DQ",
    "DQ",
    "Submitted",
  ],
  "Pending Lapse": [
    "Needs Callback",
    "Not Interested",
    "Chargeback DQ",
    "DQ",
    "Submitted",
  ],
  "Chargeback": [
    "Needs Callback",
    "Not Interested",
    "Chargeback DQ",
    "DQ",
    "Submitted",
  ],
  "Needs to be Sold": [
    "Needs Callback",
    "Not Interested",
    "Chargeback DQ",
    "DQ",
    "Submitted",
  ],
  "Pending Manual Action": [
    "Needs Callback",
    "Not Interested",
    "Chargeback DQ",
    "DQ",
    "Submitted",
  ],
};

/**
 * Get available dispositions for a given policy status and agent type
 */
export function getAvailableDispositions(
  policyStatus: PolicyStatus | string,
  agentType: AgentType
): Disposition[] {
  // Normalize policy status
  const normalizedStatus = normalizePolicyStatus(policyStatus);
  
  if (!normalizedStatus) {
    // Default dispositions if status is unknown
    return agentType === "retention_agent"
      ? ["Not Interested", "Needs Callback", "No Pickup"]
      : ["Needs Callback", "Not Interested"];
  }

  if (agentType === "licensed_agent") {
    return LA_DISPOSITIONS_BY_STATUS[normalizedStatus] || [];
  }

  return RA_DISPOSITIONS_BY_STATUS[normalizedStatus] || [];
}

export function normalizePolicyStatus(status: string | null | undefined): PolicyStatus | null {
  if (!status) return null;
  
  const normalized = status.trim().toLowerCase();

  if (
    normalized.includes("fdpf") ||
    normalized.includes("failed payment") ||
    normalized === "fdpf pending reason" ||
    normalized === "fdpf incorrect banking info" ||
    normalized === "fdpf insufficient funds" ||
    normalized === "fdpf unauthorized draft"
  ) {
    return "Failed Payment";
  }

  // Pending Lapse stages
  if (
    normalized.includes("pending lapse") ||
    normalized === "pending lapse pending reason" ||
    normalized === "pending lapse incorrect banking info" ||
    normalized === "pending lapse insufficient funds" ||
    normalized === "pending lapse unauthorized draft"
  ) {
    return "Pending Lapse";
  }

  // Chargeback stages
  if (
    normalized.includes("chargeback") ||
    normalized.includes("charge back") ||
    normalized === "chargeback cancellation" ||
    normalized === "chargeback payment failure" ||
    normalized === "chargeback failed payment"
  ) {
    return "Chargeback";
  }

  // Pending Manual Action
  if (normalized.includes("pending manual action")) {
    return "Pending Manual Action";
  }

  // Needs to be Sold (if you have this stage)
  if (normalized.includes("needs to be sold") || normalized === "unsold") {
    return "Needs to be Sold";
  }

  return null;
}

/**
 * Get disposition metadata
 */
export function getDispositionMetadata(disposition: Disposition): DispositionMetadata {
  return DISPOSITION_METADATA[disposition];
}

/**
 * Check if a disposition is valid for given policy status and agent type
 */
export function isDispositionValid(
  disposition: Disposition,
  policyStatus: PolicyStatus | string,
  agentType: AgentType
): boolean {
  const available = getAvailableDispositions(policyStatus, agentType);
  return available.includes(disposition);
}

/**
 * Check if disposition requires callback datetime
 */
export function requiresCallback(disposition: Disposition): boolean {
  return DISPOSITION_METADATA[disposition]?.requiresCallback ?? false;
}

/**
 * Check if disposition requires notes
 */
export function requiresNotes(disposition: Disposition): boolean {
  return DISPOSITION_METADATA[disposition]?.requiresNotes ?? false;
}

/**
 * Check if disposition affects GHL
 */
export function affectsGHL(disposition: Disposition): boolean {
  return DISPOSITION_METADATA[disposition]?.affectsGHL ?? false;
}
