/**
 * Retention Portal `leads` table columns used to seed the Call Back Deal
 * verification panel. The column names already align with the
 * VerificationPanel field_name keys so the mapping is mostly pass-through.
 */
export type RetentionLeadForVerification = Partial<{
  customer_full_name: string | null;
  phone_number: string | null;
  email: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  date_of_birth: string | null;
  age: number | string | null;
  social_security: string | null;
  birth_state: string | null;
  driver_license: string | null;
  existing_coverage: string | null;
  previous_applications: string | null;
  height: string | null;
  weight: string | null;
  doctors_name: string | null;
  tobacco_use: string | null;
  health_conditions: string | null;
  medications: string | null;
  carrier: string | null;
  product_type: string | null;
  monthly_premium: number | string | null;
  coverage_amount: number | string | null;
  draft_date: string | null;
  future_draft_date: string | null;
  beneficiary_information: string | null;
  beneficiary_routing: string | null;
  beneficiary_account: string | null;
  beneficiary_phone: string | null;
  institution_name: string | null;
  account_type: string | null;
  lead_vendor: string | null;
  additional_notes: string | null;
}>;

// Canonical list of field_name keys surfaced in the Call Back Deal
// verification panel (mirrors the keys used on the existing assigned-leads flow).
const VERIFICATION_FIELDS = [
  "lead_vendor",
  "customer_full_name",
  "street_address",
  "beneficiary_information",
  "phone_number",
  "date_of_birth",
  "age",
  "social_security",
  "driver_license",
  "existing_coverage",
  "applied_to_life_insurance_last_two_years",
  "height",
  "weight",
  "doctors_name",
  "tobacco_use",
  "health_conditions",
  "medications",
  "carrier",
  "product_type",
  "monthly_premium",
  "coverage_amount",
  "draft_date",
  "institution_name",
  "beneficiary_routing",
  "beneficiary_account",
  "account_type",
  "birth_state",
  "email",
  "additional_notes",
] as const;

export type VerificationFieldName = (typeof VERIFICATION_FIELDS)[number];

const str = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const joinNonEmpty = (parts: Array<string | null | undefined>, sep: string) =>
  parts
    .map((p) => str(p))
    .filter((p) => p.length > 0)
    .join(sep);

/**
 * Maps a Retention Portal `leads` row to the field values VerificationPanel expects.
 * Column names already match, but we merge street address components into a
 * single `street_address` string so it renders as one value.
 */
export function buildVerificationFieldMap(
  lead: RetentionLeadForVerification | null | undefined,
  overrides?: {
    leadVendor?: string | null;
    fullName?: string | null;
    phone?: string | null;
  },
): Record<VerificationFieldName, string> {
  const src = lead ?? {};

  const customerFullName = str(overrides?.fullName) || str(src.customer_full_name);

  const hasLocalityParts =
    !!str(src.city) || !!str(src.state) || !!str(src.zip_code);
  const streetAddress = hasLocalityParts
    ? joinNonEmpty([src.street_address, src.city, src.state, src.zip_code], ", ")
    : str(src.street_address);

  return {
    lead_vendor: str(overrides?.leadVendor) || str(src.lead_vendor),
    customer_full_name: customerFullName,
    street_address: streetAddress,
    beneficiary_information: str(src.beneficiary_information),
    phone_number: str(overrides?.phone) || str(src.phone_number),
    date_of_birth: str(src.date_of_birth),
    age: str(src.age),
    social_security: str(src.social_security),
    driver_license: str(src.driver_license),
    existing_coverage: str(src.existing_coverage),
    applied_to_life_insurance_last_two_years: str(src.previous_applications),
    height: str(src.height),
    weight: str(src.weight),
    doctors_name: str(src.doctors_name),
    tobacco_use: str(src.tobacco_use),
    health_conditions: str(src.health_conditions),
    medications: str(src.medications),
    carrier: str(src.carrier),
    product_type: str(src.product_type),
    monthly_premium: str(src.monthly_premium),
    coverage_amount: str(src.coverage_amount),
    draft_date: str(src.draft_date),
    institution_name: str(src.institution_name),
    beneficiary_routing: str(src.beneficiary_routing),
    beneficiary_account: str(src.beneficiary_account),
    account_type: str(src.account_type),
    birth_state: str(src.birth_state),
    email: str(src.email),
    additional_notes: str(src.additional_notes),
  };
}

export function getVerificationFieldList(): readonly VerificationFieldName[] {
  return VERIFICATION_FIELDS;
}
