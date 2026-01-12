/**
 * Timezone Utilities
 * All date calculations and displays use Eastern Time (America/New_York)
 */

/**
 * Get the current date in Eastern Time, set to midnight
 * @returns Date object representing today at midnight Eastern Time
 */
export function getTodayEastern(): Date {
  const now = new Date();
  
  // Get date components in Eastern Time
  const easternDateParts = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Parse date parts (format: "MM/DD/YYYY")
  const [month, day, year] = easternDateParts.split("/").map(Number);

  // Create date at midnight Eastern Time (in local timezone)
  // This represents the start of the day in Eastern Time
  const easternDate = new Date(year, month - 1, day);
  easternDate.setHours(0, 0, 0, 0);
  
  return easternDate;
}

/**
 * Convert a date string or Date object to Eastern Time at midnight
 * @param date - Date string or Date object
 * @returns Date object at midnight Eastern Time
 */
export function toEasternMidnight(date: Date | string | null | undefined): Date | null {
  if (!date) return null;

  const inputDate = typeof date === "string" ? new Date(date) : date;

  // Get the date components in Eastern Time
  const easternString = inputDate.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Parse date parts (format: "MM/DD/YYYY")
  const parts = easternString.split("/").map(Number);
  if (parts.length !== 3) return null;

  const [month, day, year] = parts;
  const easternDate = new Date(year, month - 1, day);
  easternDate.setHours(0, 0, 0, 0);

  return easternDate;
}

/**
 * Format a date to display in Eastern Time
 * @param date - Date to format
 * @param format - Format string (default: "MMM d, yyyy")
 * @returns Formatted date string in Eastern Time
 */
export function formatEasternDate(
  date: Date | string | null | undefined,
  format: string = "MMM d, yyyy"
): string {
  if (!date) return "—";

  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Use Intl.DateTimeFormat to format in Eastern Time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return formatter.format(dateObj);
}

/**
 * Get current date/time in Eastern Time as ISO string
 * @returns ISO string of current time in Eastern Time
 */
export function getNowEasternISO(): string {
  const now = new Date();
  const easternString = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const [datePart, timePart] = easternString.split(", ");
  const [month, day, year] = datePart.split("/");
  const [hours, minutes, seconds] = timePart.split(":");

  const easternDate = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds)
  );

  return easternDate.toISOString();
}

