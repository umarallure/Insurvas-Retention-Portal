"use client";

import { useCallback, useState } from "react";

type CloudTalkCallResponse = {
  ok?: boolean;
  status?: number;
  raw?: string;
  parsed?: Record<string, string>;
  error?: string;
  message?: string;
};

export function useCloudTalk() {
  const [isCalling, setIsCalling] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const defaultAgentUser = process.env.NEXT_PUBLIC_VICIDIAL_AGENT_USER || "";

  const dialNumber = useCallback(async (phoneNumber: string, agentUserOverride?: string) => {
    const phone = phoneNumber.trim();
    if (!phone) {
      setLastError("Enter a phone number");
      return;
    }
    const agentUser = agentUserOverride || defaultAgentUser;
    if (!agentUser) {
      setLastError("Missing VICIdial agent user (NEXT_PUBLIC_VICIDIAL_AGENT_USER)");
      return;
    }

    setIsCalling(true);
    setLastError(null);
    setLastStatus(null);

    try {
      const response = await fetch("/api/vicidial/dial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: phone,
          agent_user: agentUser,
        }),
      });

      const data = (await response.json()) as CloudTalkCallResponse;

      setIsCalling(false);

      if (!response.ok || data.ok === false || data.error) {
        setLastError(data.message || data.error || "Failed to initiate call");
        setLastStatus(null);
        return false;
      }

      setLastStatus("Call request sent to VICIdial");
      setLastError(null);
      return true;
    } catch (error) {
      setIsCalling(false);
      const errorMessage = error instanceof Error ? error.message : "Network error";
      setLastError(`Failed to initiate call: ${errorMessage}`);
      setLastStatus(null);
      return false;
    }
  }, [defaultAgentUser]);

  const ready = true;
  const loggedIn = true;

  return {
    ready,
    loggedIn,
    isCalling,
    lastError,
    lastStatus,
    dialNumber,
    autoDialNumber: dialNumber,
  };
}
