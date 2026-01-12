export type RetentionType = "new_sale" | "fixed_payment" | "carrier_requirements";

export type DealLite = {
  dealId: number | null;
  policyNumber: string | null;
  callCenter: string | null;
  carrier: string | null;
  clientName: string | null;
  phoneNumber: string | null;
  monthlyPremium?: number | string | null;
  coverage?: number | string | null;
  productType?: string | null;
  raw?: Record<string, unknown> | null;
};

export type LeadInfo = {
  dob: string;
  ghlStage: string;
  agentName: string;
  writingNumber: string;
  ssnLast4: string;
  address: string;
};

export type BankingInfo = {
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: string;
};

export const retentionAgentOptions = ["Aqib Afridi", "Qasim Raja", "Hussain Khan", "Ayan Ali", "Ayan Khan", "N/A"];

export const carrierOptions = [
  "Liberty",
  "SBLI",
  "Corebridge",
  "MOH",
  "Transamerica",
  "RNA",
  "AMAM",
  "GTL",
  "Aetna",
  "Americo",
  "CICA",
  "N/A",
];

export const productTypeOptions = [
  "Preferred",
  "Standard",
  "Graded",
  "Modified",
  "Immediate",
  "Level",
  "ROP",
  "N/A",
];

export function getTodayDateEST(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function getString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}
