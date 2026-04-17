export const CALL_BACK_DEALS_NAV_STORAGE_KEY = "callBackDealsNavigationContext";

/** How long list-page navigation order stays authoritative after clicking View. */
export const CALL_BACK_DEALS_NAV_MAX_AGE_MS = 60 * 60 * 1000;

export type CallBackDealsNavContext = {
  dealIds: string[];
  createdAt: number;
};

export function normaliseCallBackDealId(id: string | null | undefined): string {
  return (id ?? "").trim().toLowerCase();
}

export function parseCallBackDealsNavContext(raw: string | null): CallBackDealsNavContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { dealIds?: unknown; createdAt?: unknown };
    const dealIds = Array.isArray(parsed.dealIds)
      ? parsed.dealIds
          .map((x) => (typeof x === "string" ? normaliseCallBackDealId(x) : ""))
          .filter(Boolean)
      : [];
    const createdAt =
      typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : Date.now();
    if (dealIds.length === 0) return null;
    return { dealIds, createdAt };
  } catch {
    return null;
  }
}
