/**
 * Disposition Validation Utilities
 * Validates disposition requests based on agent type, policy status, and business rules
 */

import type {
  AgentType,
  Disposition,
  DispositionValidationResult,
} from "./types";
import { isDispositionValid, requiresCallback, requiresNotes } from "./rules";

/**
 * Validate if agent can set a specific disposition
 */
export function validateAgentDisposition(
  disposition: Disposition,
  agentType: AgentType,
  policyStatus: string
): DispositionValidationResult {
  // Check if disposition is valid for this policy status and agent type
  if (!isDispositionValid(disposition, policyStatus, agentType)) {
    return {
      valid: false,
      error: `Disposition "${disposition}" is not available for ${agentType} with policy status "${policyStatus}"`,
    };
  }

  // Licensed agent only dispositions
  const licensedAgentOnlyDispositions: Disposition[] = [
    "Chargeback DQ",
  ];

  if (
    licensedAgentOnlyDispositions.includes(disposition) &&
    agentType !== "licensed_agent"
  ) {
    return {
      valid: false,
      error: `Disposition "${disposition}" is only available to Licensed Agents`,
    };
  }

  return { valid: true };
}

/**
 * Validate disposition form data
 */
export function validateDispositionForm(
  disposition: Disposition,
  notes: string | undefined,
  callbackDatetime: string | undefined
): DispositionValidationResult {
  const warnings: string[] = [];

  // Check if notes are required but not provided
  if (requiresNotes(disposition) && !notes?.trim()) {
    return {
      valid: false,
      error: `Notes are required for "${disposition}" disposition`,
    };
  }

  // Check if callback datetime is required but not provided
  if (requiresCallback(disposition) && !callbackDatetime?.trim()) {
    return {
      valid: false,
      error: `Callback date and time are required for "${disposition}" disposition`,
    };
  }

  // Validate callback datetime format if provided
  if (callbackDatetime?.trim()) {
    const callbackDate = new Date(callbackDatetime);
    if (isNaN(callbackDate.getTime())) {
      return {
        valid: false,
        error: "Invalid callback date/time format",
      };
    }

    // Check if callback is in the past
    if (callbackDate < new Date()) {
      warnings.push("Callback date/time is in the past");
    }
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Get agent type from user profile
 */
export async function getAgentType(_userId: string): Promise<AgentType | null> {
  // This will be implemented based on your agent tables
  // For now, return a placeholder
  // TODO: Query retention_agents table and agent_status table to determine type
  return "retention_agent";
}

/**
 * Check if user is a retention agent
 */
export async function isRetentionAgent(_userId: string): Promise<boolean> {
  // TODO: Query retention_agents table
  // SELECT EXISTS(SELECT 1 FROM retention_agents WHERE profile_id = _userId AND active = true)
  return true;
}

/**
 * Check if user is a licensed agent
 */
export async function isLicensedAgent(_userId: string): Promise<boolean> {
  // TODO: Query agent_status table
  // SELECT EXISTS(SELECT 1 FROM agent_status WHERE user_id = _userId AND agent_type = 'licensed' AND status = 'available')
  return false;
}
