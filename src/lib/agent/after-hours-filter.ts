/**
 * After Hours Filter for Assigned Leads
 * 
 * Hides leads from agents after 5 PM NY time if:
 * - Category is "Failed Payment" or "Pending Lapse"
 * - Carrier is Aetna, RNA, or Transamerica
 * 
 * These carriers don't work after 5 PM, so agents shouldn't see these leads
 * to avoid dialing leads that can't be handled.
 */

import { getDealCategoryAndTagFromGhlStage } from "@/lib/monday-deal-category-tags";

/**
 * Check if current NY time is in the restricted hours (5 PM - 9 AM next day)
 * Leads are hidden from 5 PM until 9 AM the next morning
 */
function isInRestrictedHoursNY(): boolean {
  const now = new Date();
  
  // Get hour in NY timezone
  // Format: "HH:MM:SS" or "H:MM:SS"
  const nyTimeString = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  
  // Extract hour (first part before colon)
  const hourStr = nyTimeString.split(":")[0];
  const hour = parseInt(hourStr || "0", 10);
  
  // Hide from 5 PM (17:00) until 9 AM (09:00) next day
  // This means: hour >= 17 OR hour < 9
  return hour >= 17 || hour < 9;
}

/**
 * Check if carrier is one of the restricted carriers
 */
function isRestrictedCarrier(carrier: string | null | undefined): boolean {
  if (!carrier) return false;
  const normalized = carrier.trim().toUpperCase();
  return (
    normalized === "AETNA" ||
    normalized === "RNA" ||
    normalized === "TRANSAMERICA" ||
    normalized.includes("AETNA") ||
    normalized.includes("RNA") ||
    normalized.includes("TRANSAMERICA")
  );
}

/**
 * Check if a lead should be hidden during restricted hours (5 PM - 9 AM NY time)
 * 
 * @param ghlStage - The GHL stage from the deal
 * @param carrier - The carrier name
 * @returns true if the lead should be hidden, false otherwise
 */
export function shouldHideLeadAfterHours(
  ghlStage: string | null | undefined,
  carrier: string | null | undefined
): boolean {
  // Only hide during restricted hours (5 PM - 9 AM NY time)
  if (!isInRestrictedHoursNY()) {
    return false;
  }

  // Check if carrier is restricted
  if (!isRestrictedCarrier(carrier)) {
    return false;
  }

  // Check if category is "Failed Payment" or "Pending Lapse"
  const categoryMapping = getDealCategoryAndTagFromGhlStage(ghlStage);
  if (!categoryMapping) {
    return false;
  }

  const category = categoryMapping.category;
  return category === "Failed Payment" || category === "Pending Lapse";
}

