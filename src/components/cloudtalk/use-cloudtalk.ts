"use client";

import { useCallback, useState } from "react";

type CloudTalkCallResponse = {
  responseData: {
    status: number;
    message: string;
  };
};

export function useCloudTalk() {
  const [isCalling, setIsCalling] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  const dialNumber = useCallback(async (phoneNumber: string) => {
    const phone = phoneNumber.trim();
    if (!phone) {
      setLastError("Enter a phone number");
      return;
    }

    setIsCalling(true);
    setLastError(null);
    setLastStatus(null);

    try {
      // Call our Next.js API route (which proxies to CloudTalk to avoid CORS)
      const response = await fetch("/api/cloudtalk/call/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callee_number: phone,
        }),
      });

      const data = (await response.json()) as CloudTalkCallResponse | { error: string; message?: string };

      setIsCalling(false);

      // Check if it's an error response from our API route
      if ("error" in data) {
        setLastError(data.message || data.error || "Failed to initiate call");
        setLastStatus(null);
        return false;
      }

      // Handle CloudTalk response
      if (data.responseData.status === 200) {
        setLastStatus("Call initiated successfully");
        setLastError(null);
        return true;
      } else {
        // Handle different error statuses
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
      }
    } catch (error) {
      setIsCalling(false);
      const errorMessage = error instanceof Error ? error.message : "Network error";
      setLastError(`Failed to initiate call: ${errorMessage}`);
      setLastStatus(null);
      return false;
    }
  }, []);

  // For CloudTalk, we don't have a "ready" or "loggedIn" state like Aircall
  // Instead, we check if the agent is online by attempting a call
  // We'll simulate "ready" as always true since we're using API calls
  const ready = true;
  const loggedIn = true; // We'll check this when making calls

  return {
    ready,
    loggedIn,
    isCalling,
    lastError,
    lastStatus,
    dialNumber,
    // CloudTalk doesn't have auto-populate like Aircall, so we just use dialNumber
    autoDialNumber: dialNumber,
  };
}

