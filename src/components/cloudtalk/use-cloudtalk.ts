"use client";

import { useCallback, useState } from "react";
import { useAccess } from "@/components/access-context";

type CloudTalkCallResponse = {
  responseData: {
    status: number;
    message: string;
  };
};

export function useCloudTalk() {
  const { access } = useAccess();
  const [isCalling, setIsCalling] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  const dialNumber = useCallback(async (phoneNumber: string) => {
    const phone = phoneNumber.trim();
    if (!phone) {
      setLastError("Enter a phone number");
      return;
    }
    const retentionId = access.profileId?.trim() || "";
    if (!retentionId) {
      setLastError("Missing retention profile id");
      return;
    }

    setIsCalling(true);
    setLastError(null);
    setLastStatus(null);

    try {
      const response = await fetch("/api/cloudtalk/call/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callee_number: phone,
          retention_id: retentionId,
        }),
      });

      const data = (await response.json()) as CloudTalkCallResponse | { error: string; message?: string };

      setIsCalling(false);

      if ("error" in data) {
        setLastError(data.message || data.error || "Failed to initiate call");
        setLastStatus(null);
        return false;
      }

      if (data.responseData.status === 200) {
        setLastStatus("Call initiated successfully");
        setLastError(null);
        return true;
      }

      let errorMessage = data.responseData.message || "Failed to initiate call";
      if (data.responseData.status === 403) {
        errorMessage = "Agent is not online. Please log into CloudTalk.";
      } else if (data.responseData.status === 409) {
        errorMessage = "Agent is already on a call. Please wait.";
      } else if (data.responseData.status === 406) {
        errorMessage = "Invalid phone number or agent configuration.";
      }

      setLastError(errorMessage);
      setLastStatus(null);
      return false;
    } catch (error) {
      setIsCalling(false);
      const errorMessage = error instanceof Error ? error.message : "Network error";
      setLastError(`Failed to initiate call: ${errorMessage}`);
      setLastStatus(null);
      return false;
    }
  }, [access.profileId]);

  const ready = !access.loading && Boolean(access.profileId);
  const loggedIn = ready;

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
