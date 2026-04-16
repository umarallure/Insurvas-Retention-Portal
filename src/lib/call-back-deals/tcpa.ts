import { supabase } from "@/lib/supabase";

export type TcpaStatus = "clear" | "dnc" | "tcpa";

export type TcpaCheckResult = {
  status: TcpaStatus;
  message: string;
  normalizedPhone: string | null;
  errors: string[];
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
};

const collectPayloadCandidates = (data: unknown): Array<Record<string, unknown>> => {
  const root = asRecord(data);
  if (!root) return [];
  const candidates: Array<Record<string, unknown>> = [root];
  const firstData = asRecord(root.data);
  if (firstData) {
    candidates.push(firstData);
    const secondData = asRecord(firstData.data);
    if (secondData) candidates.push(secondData);
  }
  return candidates;
};

const hasTcpaPhrase = (value: unknown) => {
  if (typeof value !== "string") return false;
  const msg = value.toLowerCase();
  return (
    msg.includes("tcpa") ||
    msg.includes("litigator") ||
    msg.includes("no contact permitted") ||
    msg.includes("do not proceed")
  );
};

export function normalizeTcpaPhone(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return null;
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  if (last10.length !== 10) return null;
  return last10;
}

/**
 * Runs the TCPA/DNC check for a phone number by invoking the `blacklist-check`
 * Supabase edge function AND the live transfer checker, merging the results.
 *
 * Mirrors the logic embedded in the verification panel so the same decisions
 * apply to callback-deal assignments.
 */
export async function checkTcpaStatus(rawPhone: string | null | undefined): Promise<TcpaCheckResult> {
  const normalizedPhone = normalizeTcpaPhone(rawPhone);

  if (!normalizedPhone) {
    return {
      status: "clear",
      message: "Phone number was missing or invalid; skipped TCPA check.",
      normalizedPhone: null,
      errors: ["invalid-phone"],
    };
  }

  const checkErrors: string[] = [];
  const payloads: Array<Record<string, unknown>> = [];
  let transferCheckPayload: Record<string, unknown> | null = null;

  const [blacklistResult, transferCheckResult] = await Promise.allSettled([
    supabase.functions.invoke("blacklist-check", { body: { mobileNumber: normalizedPhone } }),
    fetch("https://livetransferchecker.vercel.app/api/transfer-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone }),
    }),
  ]);

  if (blacklistResult.status === "fulfilled") {
    const { data, error } = blacklistResult.value;
    if (error) {
      checkErrors.push(`blacklist-check: ${error.message || "unknown error"}`);
    } else {
      payloads.push(...collectPayloadCandidates(data));
    }
  } else {
    checkErrors.push(
      `blacklist-check: ${
        blacklistResult.reason instanceof Error ? blacklistResult.reason.message : "unknown error"
      }`,
    );
  }

  if (transferCheckResult.status === "fulfilled") {
    try {
      const transferResponse = transferCheckResult.value;
      const transferJson = (await transferResponse.json()) as unknown;
      const parsedTransfer = asRecord(transferJson);
      if (!transferResponse.ok) {
        const message =
          parsedTransfer && typeof parsedTransfer.message === "string"
            ? parsedTransfer.message
            : `status ${transferResponse.status}`;
        checkErrors.push(`transfer-check: ${message}`);
      } else if (parsedTransfer) {
        transferCheckPayload = parsedTransfer;
        payloads.push(...collectPayloadCandidates(parsedTransfer));
      }
    } catch (error) {
      checkErrors.push(
        `transfer-check: ${error instanceof Error ? error.message : "unable to parse response"}`,
      );
    }
  } else {
    checkErrors.push(
      `transfer-check: ${
        transferCheckResult.reason instanceof Error ? transferCheckResult.reason.message : "unknown error"
      }`,
    );
  }

  if (payloads.length === 0) {
    return {
      status: "clear",
      message: checkErrors.join(" | ") || "DNC lookup returned no data; assuming clear.",
      normalizedPhone,
      errors: checkErrors,
    };
  }

  const listIncludes = (value: unknown) =>
    Array.isArray(value) &&
    value.some((v) => {
      const digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
      const candidate = digits.length > 10 ? digits.slice(-10) : digits;
      return candidate === normalizedPhone;
    });

  const tcpaLitigatorIncludes = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.some((v) => {
        const digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
        const candidate = digits.length > 10 ? digits.slice(-10) : digits;
        return candidate === normalizedPhone;
      });
    }
    if (value && typeof value === "object") {
      const map = value as Record<string, unknown>;
      const exactValue = map[normalizedPhone];
      if (typeof exactValue === "boolean") return exactValue;
      if (typeof exactValue === "string") return exactValue.toLowerCase() === "true";
      return Boolean(exactValue);
    }
    return false;
  };

  const isTcpaFromNormalized = payloads.some(
    (payload) => payload?.is_tcpa === true || payload?.is_blacklisted === true,
  );
  const isDncFromNormalized = payloads.some((payload) => payload?.is_dnc === true);
  const isDncFromLists = payloads.some(
    (payload) => listIncludes(payload?.federal_dnc) || listIncludes(payload?.dnc),
  );
  const isTcpaFromLists = payloads.some((payload) => tcpaLitigatorIncludes(payload?.tcpa_litigator));
  const isTcpaFromMessage = payloads.some((payload) => {
    const nestedDnc = asRecord(payload?.dnc);
    return (
      hasTcpaPhrase(payload?.message) ||
      hasTcpaPhrase(payload?.upstream_message) ||
      hasTcpaPhrase(payload?.warningMessage) ||
      hasTcpaPhrase(payload?.dnc_message) ||
      hasTcpaPhrase(nestedDnc?.message)
    );
  });
  const transferDnc = asRecord(transferCheckPayload?.dnc);
  const isTcpaFromTransfer = hasTcpaPhrase(transferDnc?.message);

  const isTcpa = isTcpaFromNormalized || isTcpaFromLists || isTcpaFromMessage || isTcpaFromTransfer;
  const isDnc = isDncFromNormalized || isDncFromLists;

  const status: TcpaStatus = isTcpa ? "tcpa" : isDnc ? "dnc" : "clear";

  const firstMessagePayload = payloads.find((payload) => typeof payload?.message === "string");
  const normalizedMessage = typeof firstMessagePayload?.message === "string" ? firstMessagePayload.message : null;
  const baseMessage = normalizedMessage
    ? normalizedMessage
    : isTcpa
      ? "WARNING: Do not proceed with this contact. This is TCPA."
      : isDnc
        ? "This number is on the DNC list. Proceed only with verbal consent."
        : "This number is clear.";

  const message =
    checkErrors.length > 0 ? `${baseMessage} (One check failed: ${checkErrors.join(" | ")})` : baseMessage;

  return { status, message, normalizedPhone, errors: checkErrors };
}
