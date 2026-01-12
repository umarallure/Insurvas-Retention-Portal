/**
 * Business Days Calculator
 * Calculates business days between dates, excluding weekends
 * All dates are calculated using Eastern Time (America/New_York)
 */

import { getTodayEastern, toEasternMidnight } from "../timezone";

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Calculate the number of business days between two dates
 * Excludes weekends (Saturday and Sunday)
 * 
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 * @returns Number of business days, or 0 if startDate is after endDate
 */
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  // Ensure dates are at midnight for accurate day calculation
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  // If start date is after end date, return 0
  if (start > end) {
    return 0;
  }
  
  let businessDays = 0;
  const current = new Date(start);
  
  // Iterate through each day from start to end
  while (current <= end) {
    if (!isWeekend(current)) {
      businessDays++;
    }
    // Move to next day
    current.setDate(current.getDate() + 1);
  }
  
  return businessDays;
}

/**
 * Calculate business days since a given date (from that date to today)
 * 
 * @param date - The date to calculate from
 * @returns Number of business days since the date, or 0 if date is in the future
 */
export function calculateBusinessDaysSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  
  // Convert to Eastern Time at midnight
  const targetDate = toEasternMidnight(date);
  if (!targetDate) return 0;
  
  // Get today in Eastern Time at midnight
  const today = getTodayEastern();
  
  // If date is in the future, return 0
  if (targetDate > today) {
    return 0;
  }
  
  return calculateBusinessDays(targetDate, today);
}

/**
 * Add business days to a date
 * 
 * @param startDate - Starting date
 * @param businessDays - Number of business days to add
 * @returns New date after adding business days
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let daysAdded = 0;
  
  while (daysAdded < businessDays) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) {
      daysAdded++;
    }
  }
  
  return result;
}

