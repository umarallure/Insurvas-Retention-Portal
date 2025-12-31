export type DealCategory = "Failed Payment" | "Pending Manual Action" | "Chargeback" | "Pending Lapse";

export type DealTag =
  | "Pending Reason"
  | "Incorrect Banking Info"
  | "Insufficient Funds"
  | "Unauthorized Draft"
  | "Cancellation"
  | "Failed Payment";

export type DealLabel = DealCategory | DealTag;

export type DealLabelStyle = {
  bg: string;
  border: string;
  text: string;
};

export const DEAL_LABEL_STYLES: Record<DealLabel, DealLabelStyle> = {
  "Failed Payment": { bg: "#FEF2F2", border: "#FCA5A5", text: "#B91C1C" },
  "Pending Lapse": { bg: "#FFFBEB", border: "#FCD34D", text: "#B45309" },
  "Pending Manual Action": { bg: "#EFF6FF", border: "#93C5FD", text: "#1D4ED8" },
  Chargeback: { bg: "#FFF1F2", border: "#FDA4AF", text: "#BE123C" },

  "Pending Reason": { bg: "#F5F3FF", border: "#C4B5FD", text: "#6D28D9" },
  "Incorrect Banking Info": { bg: "#F0FDFA", border: "#5EEAD4", text: "#0F766E" },
  "Insufficient Funds": { bg: "#FFF7ED", border: "#FDBA74", text: "#C2410C" },
  "Unauthorized Draft": { bg: "#FDF2F8", border: "#F9A8D4", text: "#BE185D" },
  Cancellation: { bg: "#F3F4F6", border: "#D1D5DB", text: "#374151" },
};

type MappingEntry = {
  category: DealCategory;
  tag: DealTag | null;
};

const STAGE_TO_MAPPING: Record<string, MappingEntry> = {
  "fdpf pending reason": { category: "Failed Payment", tag: "Pending Reason" },
  "fdpf incorrect banking info": { category: "Failed Payment", tag: "Incorrect Banking Info" },
  "fdpf insufficient funds": { category: "Failed Payment", tag: "Insufficient Funds" },
  "fdpf unauthorized draft": { category: "Failed Payment", tag: "Unauthorized Draft" },

  "pending manual action": { category: "Pending Manual Action", tag: null },

  "chargeback cancellation": { category: "Chargeback", tag: "Cancellation" },
  "chargeback payment failure": { category: "Chargeback", tag: "Failed Payment" },

  "pending lapse pending reason": { category: "Pending Lapse", tag: "Pending Reason" },
  "pending lapse incorrect banking info": { category: "Pending Lapse", tag: "Incorrect Banking Info" },
  "pending lapse insufficient funds": { category: "Pending Lapse", tag: "Insufficient Funds" },
  "pending lapse unauthorized draft": { category: "Pending Lapse", tag: "Unauthorized Draft" },
  "pending lapse": { category: "Pending Lapse", tag: null },
};

export const CATEGORY_ORDER: DealCategory[] = ["Failed Payment", "Pending Lapse", "Pending Manual Action", "Chargeback"];

export const CATEGORY_TO_GHL_STAGES: Record<DealCategory, string[]> = {
  "Failed Payment": [
    "FDPF Pending Reason",
    "FDPF Incorrect Banking Info",
    "FDPF Insufficient Funds",
    "FDPF Unauthorized Draft",
  ],
  "Pending Manual Action": ["Pending Manual Action"],
  Chargeback: ["Chargeback Cancellation", "Chargeback Payment Failure"],
  "Pending Lapse": [
    "Pending Lapse",
    "Pending Lapse Pending Reason",
    "Pending Lapse Incorrect Banking Info",
    "Pending Lapse Insufficient Funds",
    "Pending Lapse Unauthorized Draft",
  ],
};

export function getDealCategoryAndTagFromGhlStage(ghlStage: string | null | undefined): MappingEntry | null {
  if (typeof ghlStage !== "string") return null;
  const key = ghlStage.trim().toLowerCase();
  if (!key) return null;
  return STAGE_TO_MAPPING[key] ?? null;
}

export function getDealTagLabelFromGhlStage(ghlStage: string | null | undefined): DealLabel | null {
  const mapping = getDealCategoryAndTagFromGhlStage(ghlStage);
  if (!mapping) return null;
  return mapping.tag ?? mapping.category;
}

export function getDealLabelStyle(label: DealLabel | null | undefined): DealLabelStyle | null {
  if (!label) return null;
  return DEAL_LABEL_STYLES[label] ?? null;
}
