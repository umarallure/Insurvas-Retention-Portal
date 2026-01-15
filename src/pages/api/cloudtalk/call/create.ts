import type { NextApiRequest, NextApiResponse } from "next";

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
  const defaultAgentId = process.env.NEXT_PUBLIC_CLOUDTALK_AGENT_ID || "530325";

  if (!accountId || !apiSecret) {
    return res.status(500).json({
      error: "CloudTalk credentials not configured",
      message: "Missing CloudTalk API credentials on server",
    });
  }

  // Get request body
  const { callee_number, agent_id } = req.body;

  if (!callee_number) {
    return res.status(400).json({
      error: "Missing required field",
      message: "callee_number is required",
    });
  }

  // Use provided agent_id or default
  const agentId = agent_id || defaultAgentId;

  try {
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
        agent_id: parseInt(agentId, 10),
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

