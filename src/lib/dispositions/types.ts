/**
 * Disposition System Type Definitions
 * Defines all disposition types, policy statuses, and related types
 */

// Agent Types
export type AgentType = "retention_agent" | "licensed_agent";

// Policy Status Categories (from GHL stages)
export type PolicyStatus =
  | "Failed Payment"
  | "Pending Lapse"
  | "Chargeback"
  | "Needs to be Sold"
  | "Pending Manual Action";

// Retention Agent Dispositions
export type RADisposition =
  | "New Sale"
  | "Updating Banking/Draft Date"
  | "Not Interested"
  | "Needs Callback"
  | "No Pickup"
  | "DQ";

// Licensed Agent Dispositions
export type LADisposition =
  | "Needs Callback"
  | "Not Interested"
  | "Chargeback DQ"
  | "DQ"
  | "Submitted";

// All possible dispositions
export type Disposition = RADisposition | LADisposition;

// Disposition metadata
export type DispositionMetadata = {
  requiresNotes?: boolean;
  requiresCallback?: boolean;
  affectsGHL?: boolean;
  licensedAgentOnly?: boolean;
  label: string;
  description?: string;
};

// Disposition action result
export type DispositionActionResult = {
  success: boolean;
  message?: string;
  ghlAction?: GHLAction;
  error?: string;
};

// GHL Actions (placeholder for future implementation)
export type GHLAction =
  | { type: "move_stage"; stage: string; notes?: string }
  | { type: "create_opportunity"; data: Record<string, unknown> }
  | { type: "update_contact"; data: Record<string, unknown> }
  | { type: "no_action" };

// Disposition save request
export type DispositionSaveRequest = {
  dealId: number;
  mondayItemId?: string;
  policyNumber?: string;
  disposition: Disposition;
  notes?: string;
  callbackDatetime?: string;
  agentId: string;
  agentName: string;
  agentType: AgentType;
  policyStatus?: string;
  ghlStage?: string;
};

// Disposition history record
export type DispositionHistoryRecord = {
  id: string;
  deal_id: number;
  monday_item_id: string | null;
  policy_number: string | null;
  disposition: string;
  disposition_notes: string | null;
  callback_datetime: string | null;
  agent_id: string;
  agent_name: string;
  agent_type: string | null;
  policy_status: string | null;
  ghl_stage: string | null;
  previous_disposition: string | null;
  created_at: string;
};

// Disposition validation result
export type DispositionValidationResult = {
  valid: boolean;
  error?: string;
  warnings?: string[];
};
