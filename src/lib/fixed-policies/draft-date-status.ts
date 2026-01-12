/**
 * Draft Date Status Utilities
 * Provides user-friendly status information about draft dates
 * All dates are calculated using Eastern Time (America/New_York)
 */

import { calculateBusinessDaysSince, addBusinessDays } from "./business-days";
import { requiresThreeBusinessDaysWait } from "./status-transitions";
import { getTodayEastern, toEasternMidnight } from "../timezone";

export type DraftDateStatus = {
  isFuture: boolean;
  businessDaysSince: number;
  businessDaysUntil: number;
  needsConfirmation: boolean;
  statusMessage: string;
  statusVariant: "default" | "secondary" | "destructive" | "warning" | "success";
  confirmationMessage: string | null;
};

/**
 * Get user-friendly status information for a draft date
 * 
 * @param draftDate - The draft date
 * @param statusWhenFixed - The status when the policy was fixed (to determine if 3-day rule applies)
 * @returns DraftDateStatus with user-friendly information
 */
export function getDraftDateStatus(
  draftDate: string | null | undefined,
  statusWhenFixed: string | null | undefined
): DraftDateStatus {
  if (!draftDate) {
    return {
      isFuture: false,
      businessDaysSince: 0,
      businessDaysUntil: 0,
      needsConfirmation: false,
      statusMessage: "No draft date",
      statusVariant: "secondary",
      confirmationMessage: null,
    };
  }

  // Convert draft date to Eastern Time at midnight
  const draft = toEasternMidnight(draftDate);
  if (!draft) {
    return {
      isFuture: false,
      businessDaysSince: 0,
      businessDaysUntil: 0,
      needsConfirmation: false,
      statusMessage: "No draft date",
      statusVariant: "secondary",
      confirmationMessage: null,
    };
  }
  
  // Get today in Eastern Time at midnight
  const today = getTodayEastern();

  const isFuture = draft > today;
  const businessDaysSince = calculateBusinessDaysSince(draftDate);
  
  // Calculate business days until draft date (if future)
  let businessDaysUntil = 0;
  if (isFuture) {
    let current = new Date(today);
    let days = 0;
    while (current < draft) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) { // Not weekend
        days++;
      }
      current.setDate(current.getDate() + 1);
    }
    businessDaysUntil = days;
  }

  // Check if this status requires 3 business days wait
  const requires3DayWait = requiresThreeBusinessDaysWait(statusWhenFixed);
  
  // Needs confirmation if:
  // 1. Draft date has passed
  // 2. 2 or more business days have elapsed since draft date
  // Manager needs to confirm status after 2+ business days from draft date
  const needsConfirmation = !isFuture && businessDaysSince >= 2;

  let statusMessage: string;
  let statusVariant: "default" | "secondary" | "destructive" | "warning" | "success";
  let confirmationMessage: string | null = null;

  if (isFuture) {
    if (businessDaysUntil === 0) {
      statusMessage = "Draft today";
      statusVariant = "success";
    } else if (businessDaysUntil === 1) {
      statusMessage = "Draft tomorrow";
      statusVariant = "success";
    } else {
      statusMessage = `Draft in ${businessDaysUntil} business days`;
      statusVariant = "default";
    }
  } else {
    // Draft date has passed
    if (businessDaysSince === 0) {
      statusMessage = "Draft date today";
      statusVariant = "warning";
    } else if (businessDaysSince === 1) {
      statusMessage = "1 business day past draft";
      statusVariant = "warning";
    } else if (businessDaysSince < 2) {
      statusMessage = `${businessDaysSince} business day${businessDaysSince !== 1 ? "s" : ""} past draft`;
      statusVariant = "warning";
    } else {
      // 2 or more business days past - needs confirmation
      statusMessage = `${businessDaysSince} business days past draft`;
      statusVariant = "destructive";
      
      // Show confirmation message based on status when fixed
      if (requires3DayWait) {
        confirmationMessage = `⚠️ Confirm status: Should be "Successful Draft" or "Failed Payment after Fix"`;
      } else {
        confirmationMessage = `⚠️ Confirm status: Check if policy status needs update`;
      }
    }
  }

  return {
    isFuture,
    businessDaysSince,
    businessDaysUntil,
    needsConfirmation,
    statusMessage,
    statusVariant,
    confirmationMessage,
  };
}

