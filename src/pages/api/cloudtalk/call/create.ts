import type { NextApiRequest, NextApiResponse } from "next";
import { getCloudTalkConfigForProfile } from "@/lib/cloudtalk/contact";

type CloudTalkCallResponse = {
  responseData: {
    status: number;
    message: string;
  };
};

type ErrorResponse = {
  error: string;
  message?: string;
};

type CloudTalkCallRequest = {
  callee_number?: string;
  agent_profile_id?: string;
  retention_id?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CloudTalkCallResponse | ErrorResponse>,
) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get credentials from environment variables (server-side only)
  const accountId = process.env.NEXT_PUBLIC_CLOUDTALK_ACCOUNT_ID;
  const apiSecret = process.env.NEXT_PUBLIC_CLOUDTALK_API_SECRET;

  if (!accountId || !apiSecret) {
    return res.status(500).json({
      error: "CloudTalk credentials not configured",
      message: "Missing CloudTalk API credentials on server",
    });
  }

  // Get request body
  const { callee_number, agent_profile_id, retention_id } = (req.body ?? {}) as CloudTalkCallRequest;

  if (!callee_number) {
    return res.status(400).json({
      error: "Missing required field",
      message: "callee_number is required",
    });
  }

  try {
    const retentionId = retention_id?.trim() || agent_profile_id?.trim() || "";
    if (!retentionId) {
      return res.status(400).json({
        error: "Missing required field",
        message: "retention_id or agent_profile_id is required",
      });
    }

    const mappedConfig = await getCloudTalkConfigForProfile(retentionId);
    if (!mappedConfig) {
      return res.status(404).json({
        error: "CloudTalk mapping not found",
        message: `No active CloudTalk mapping found for retention/profile id ${retentionId}`,
      });
    }

    // Create Basic Auth header
    const authString = `${accountId}:${apiSecret}`;
    const base64Auth = Buffer.from(authString).toString("base64");

    // Make request to CloudTalk API
    const response = await fetch("https://my.cloudtalk.io/api/calls/create.json", {
      method: "POST",
      headers: {
        Authorization: `Basic ${base64Auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: parseInt(mappedConfig.agentId, 10),
        callee_number: callee_number,
      }),
    });

    const data = (await response.json()) as CloudTalkCallResponse;

    // Return the same response from CloudTalk
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("[CloudTalk API] Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
