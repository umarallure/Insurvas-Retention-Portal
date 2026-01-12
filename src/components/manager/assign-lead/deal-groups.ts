import { CATEGORY_TO_GHL_STAGES, type DealCategory } from "@/lib/monday-deal-category-tags";

export type DealGroup = { 
  id: string; 
  title: string;
  ghlStages: string[];
};

export const DEAL_GROUPS: DealGroup[] = [
  { 
    id: "failed_payment", 
    title: "Failed Payment",
    ghlStages: CATEGORY_TO_GHL_STAGES["Failed Payment"]
  },
  { 
    id: "pending_lapse", 
    title: "Pending Lapse",
    ghlStages: CATEGORY_TO_GHL_STAGES["Pending Lapse"]
  },
  { 
    id: "pending_manual_action", 
    title: "Pending Manual Action",
    ghlStages: CATEGORY_TO_GHL_STAGES["Pending Manual Action"]
  },
  { 
    id: "chargeback", 
    title: "Chargeback",
    ghlStages: CATEGORY_TO_GHL_STAGES["Chargeback"]
  },
];
