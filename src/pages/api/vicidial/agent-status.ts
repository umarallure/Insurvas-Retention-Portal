import type { NextApiRequest, NextApiResponse } from "next";
import { callVicidialAgentApi, type VicidialParams } from "@/lib/vicidial";

type AgentStatusRequestBody = {
  agent_user?: string;
  status?: string;
  campaign_id?: string;
  vicidial_function?: string;
  extra_params?: VicidialParams;
};

type VicidialRouteResponse =
  | {
      ok: true;
      status: number;
      function: string;
      raw: string;
      parsed: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
      message?: string;
      details?: unknown;
    };

export default async function handler(req: NextApiRequest, res: NextApiResponse<VicidialRouteResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as AgentStatusRequestBody;
  const requestedStatus = (body.status ?? "").trim().toUpperCase();
  const configuredFn = body.vicidial_function ?? process.env.VICIDIAL_FUNCTION_AGENT_STATUS;
  // Backward compatibility: old env used "agent_status" from non-agent API.
  const normalizedConfiguredFn = configuredFn === "agent_status" ? "external_status" : configuredFn;
  const autoFn =
    requestedStatus === "PAUSE" || requestedStatus === "RESUME" ? "external_pause" : "external_status";
  const fn = normalizedConfiguredFn ?? autoFn;

  if (!body.status) {
    return res.status(400).json({
      ok: false,
      error: "Missing required field",
      message: "status is required",
    });
  }
  if (!body.agent_user) {
    return res.status(400).json({
      ok: false,
      error: "Missing required field",
      message: "agent_user is required for VICIdial agent API",
    });
  }

  try {
    const params: VicidialParams = {
      agent_user: body.agent_user,
      status: requestedStatus,
      value:
        fn === "external_pause"
          ? requestedStatus === "PAUSE"
            ? "PAUSE"
            : "RESUME"
          : requestedStatus,
      campaign_id: body.campaign_id,
      ...(body.extra_params ?? {}),
    };

    const result = await callVicidialAgentApi(fn, params);
    return res.status(result.status).json({
      ok: result.ok,
      status: result.status,
      function: fn,
      raw: result.raw,
      parsed: result.parsed,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "VICIdial request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
