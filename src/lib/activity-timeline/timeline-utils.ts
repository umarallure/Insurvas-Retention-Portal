/**
 * Activity Timeline Utilities
 * Fetches and formats activity timeline from call_update_logs
 */

import { supabase } from "@/lib/supabase";
import { format, parseISO } from "date-fns";

export type TimelineEvent = {
  id: string;
  timestamp: Date;
  eventType: string;
  agentName: string;
  agentType: string;
  eventDetails: Record<string, unknown>;
  customerName: string;
  leadVendor: string;
  isRetentionCall: boolean;
  formattedTime: string;
  formattedDate: string;
  description: string;
};

export type ActivityTimeline = {
  submissionId: string;
  events: TimelineEvent[];
  totalEvents: number;
  firstEvent?: Date;
  lastEvent?: Date;
  duration?: string; // Human-readable duration
};

/**
 * Fetch activity timeline for a submission
 */
export async function getActivityTimeline(
  submissionId: string
): Promise<ActivityTimeline | null> {
  try {
    const { data, error } = await supabase
      .from("call_update_logs")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        submissionId,
        events: [],
        totalEvents: 0,
      };
    }

    // Format events
    const events: TimelineEvent[] = data.map((log) => {
      const timestamp = parseISO(log.created_at);
      const eventDetails = (log.event_details as Record<string, unknown>) || {};

      // Generate human-readable description
      const description = formatEventDescription(log.event_type, eventDetails, log.agent_name);

      return {
        id: log.id,
        timestamp,
        eventType: log.event_type,
        agentName: log.agent_name || "Unknown",
        agentType: log.agent_type || "unknown",
        eventDetails,
        customerName: log.customer_name || "Unknown",
        leadVendor: log.lead_vendor || "Unknown",
        isRetentionCall: log.is_retention_call || false,
        formattedTime: format(timestamp, "h:mm a"),
        formattedDate: format(timestamp, "MMM d, yyyy"),
        description,
      };
    });

    const firstEvent = events[0]?.timestamp;
    const lastEvent = events[events.length - 1]?.timestamp;
    const duration = firstEvent && lastEvent ? calculateDuration(firstEvent, lastEvent) : undefined;

    return {
      submissionId,
      events,
      totalEvents: events.length,
      firstEvent,
      lastEvent,
      duration,
    };
  } catch (error) {
    console.error("[activity-timeline] Error fetching timeline:", error);
    return null;
  }
}

/**
 * Format event description for display
 */
function formatEventDescription(
  eventType: string,
  eventDetails: Record<string, unknown>,
  agentName: string
): string {
  const eventTypeLower = eventType.toLowerCase();

  if (eventTypeLower.includes("verification_started")) {
    return `Verification session started by ${agentName}`;
  }

  if (eventTypeLower.includes("call_claimed")) {
    return `Call claimed by ${agentName}`;
  }

  if (eventTypeLower.includes("application_submitted")) {
    const status = eventDetails.status as string;
    const carrier = eventDetails.carrier as string;
    if (carrier) {
      return `Application submitted to ${carrier}${status ? ` - Status: ${status}` : ""}`;
    }
    return `Application submitted${status ? ` - Status: ${status}` : ""}`;
  }

  if (eventTypeLower.includes("status_changed")) {
    const fromStatus = eventDetails.from_status as string;
    const toStatus = eventDetails.to_status as string;
    if (fromStatus && toStatus) {
      return `Status changed from "${fromStatus}" to "${toStatus}"`;
    }
    return `Status changed to "${toStatus || eventDetails.status || "unknown"}"`;
  }

  if (eventTypeLower.includes("notes_added")) {
    return `Notes added by ${agentName}`;
  }

  if (eventTypeLower.includes("field_updated")) {
    const fieldName = eventDetails.field_name as string;
    if (fieldName) {
      return `${fieldName} updated by ${agentName}`;
    }
    return `Field updated by ${agentName}`;
  }

  if (eventTypeLower.includes("assigned")) {
    const assignee = eventDetails.assignee_name as string;
    if (assignee) {
      return `Assigned to ${assignee} by ${agentName}`;
    }
    return `Assigned by ${agentName}`;
  }

  // Default: format event type
  return eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Calculate human-readable duration
 */
function calculateDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""}, ${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""}, ${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`;
  }
  return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`;
}

/**
 * Get activity timeline for multiple submissions
 */
export async function getBulkActivityTimelines(
  submissionIds: string[]
): Promise<Map<string, ActivityTimeline>> {
  const results = new Map<string, ActivityTimeline>();

  // Process in batches
  const batchSize = 20;
  for (let i = 0; i < submissionIds.length; i += batchSize) {
    const batch = submissionIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((submissionId) => getActivityTimeline(submissionId))
    );

    batchResults.forEach((result) => {
      if (result) {
        results.set(result.submissionId, result);
      }
    });
  }

  return results;
}


