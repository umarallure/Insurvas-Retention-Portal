import { getVerificationFieldList } from "@/lib/call-back-deals/build-verification-items";

const VERIFICATION_FIELD_TO_LEAD_COLUMN: Record<string, string> = {
  applied_to_life_insurance_last_two_years: "previous_applications",
};

const NUMERIC_LEAD_COLUMNS = new Set(["monthly_premium", "coverage_amount"]);

const ALLOWED = new Set<string>(getVerificationFieldList() as unknown as string[]);

export type CallBackVerificationItemRow = {
  field_name: string;
  verified_value: string | null;
  original_value: string | null;
};

function effectiveValue(row: CallBackVerificationItemRow): string {
  const v = typeof row.verified_value === "string" ? row.verified_value.trim() : "";
  if (v.length > 0) return v;
  const o = typeof row.original_value === "string" ? row.original_value.trim() : "";
  return o;
}

/**
 * Maps rows from `call_back_deal_verification_items` onto `leads` column names,
 * using verified_value when set, otherwise original_value.
 */
export function leadPatchFromCallBackVerificationItems(
  items: CallBackVerificationItemRow[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const item of items) {
    if (!ALLOWED.has(item.field_name)) continue;
    const value = effectiveValue(item);
    if (!value) continue;

    const column = VERIFICATION_FIELD_TO_LEAD_COLUMN[item.field_name] ?? item.field_name;

    if (NUMERIC_LEAD_COLUMNS.has(column)) {
      const n = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) patch[column] = n;
      continue;
    }

    if (column === "age") {
      const n = parseInt(value.replace(/\D/g, ""), 10);
      patch[column] = Number.isFinite(n) ? n : value;
      continue;
    }

    patch[column] = value;
  }

  return patch;
}
