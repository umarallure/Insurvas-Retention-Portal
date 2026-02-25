import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type BootstrapAgent = {
  profileId: string;
  campaignId: string;
  campaignName?: string;
  listId: string | number;
  vicidialUser?: string;
  webformBaseUrl?: string;
  listName?: string;
};

type BootstrapInput = {
  agents: BootstrapAgent[];
};

type MappingOutput = Record<
  string,
  {
    campaignId: string;
    listId: string | number;
    vicidialUser?: string;
    webformBaseUrl?: string;
  }
>;

function getArg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function assertEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for this operation`);
  return value;
}

async function callVicidialNonAgentApi(fn: string, params: Record<string, string | number>) {
  const baseUrl = assertEnv("VICIDIAL_ASSIGN_BASE_URL").replace(/\/+$/, "");
  const user = assertEnv("VICIDIAL_ASSIGN_API_USER");
  const pass = assertEnv("VICIDIAL_ASSIGN_API_PASS");
  const source = process.env.VICIDIAL_ASSIGN_API_SOURCE ?? "retention_portal";

  const body = new URLSearchParams();
  body.set("source", source);
  body.set("user", user);
  body.set("pass", pass);
  body.set("function", fn);

  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }

  const resp = await fetch(`${baseUrl}/non_agent_api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });

  const raw = await resp.text();
  const isError = /\bERROR\b/i.test(raw) || /\|BAD\|/i.test(raw);
  return { status: resp.status, raw, isError };
}

function isNoFunctionError(raw: string) {
  return /NO FUNCTION SPECIFIED/i.test(raw) || /INVALID FUNCTION/i.test(raw);
}

function hasCampaignInResponse(raw: string, campaignId: string) {
  const escaped = campaignId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(raw);
}

async function campaignExists(campaignId: string) {
  const result = await callVicidialNonAgentApi("campaigns_list", {});
  if (result.isError) return { exists: false, reason: result.raw.trim() };
  return { exists: hasCampaignInResponse(result.raw, campaignId), reason: result.raw };
}

function validateInput(input: BootstrapInput) {
  if (!Array.isArray(input.agents) || input.agents.length === 0) {
    throw new Error("Config must include non-empty agents[]");
  }

  for (const a of input.agents) {
    if (!a.profileId?.trim()) throw new Error("Each agent requires profileId");
    if (!a.campaignId?.trim()) throw new Error(`Agent ${a.profileId} missing campaignId`);
    if (a.listId === undefined || a.listId === null || `${a.listId}`.trim() === "") {
      throw new Error(`Agent ${a.profileId} missing listId`);
    }
    const campaignId = a.campaignId.trim();
    if (!/^[A-Za-z0-9]{2,8}$/.test(campaignId)) {
      throw new Error(
        `Agent ${a.profileId} has invalid campaignId "${a.campaignId}". VICIdial requires 2-8 alphanumeric chars.`,
      );
    }
  }
}

async function main() {
  const cwd = process.cwd();
  const configPath = path.resolve(cwd, getArg("--config", "data/vicidial-agent-bootstrap.generated.json")!);
  const outputPath = path.resolve(cwd, getArg("--output", "src/config/vicidial-agent-mapping.local.json")!);
  const seedCampaigns = hasFlag("--seed-campaigns");
  const seedLists = hasFlag("--seed-lists");

  const raw = await readFile(configPath, "utf8");
  const input = JSON.parse(raw) as BootstrapInput;
  validateInput(input);

  const mapping: MappingOutput = {};
  for (const agent of input.agents) {
    mapping[agent.profileId] = {
      campaignId: agent.campaignId,
      listId: agent.listId,
      vicidialUser: agent.vicidialUser,
      webformBaseUrl: agent.webformBaseUrl,
    };
  }

  await writeFile(outputPath, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
  console.log(`[bootstrap] wrote mapping file: ${outputPath}`);

  if (!seedCampaigns && !seedLists) {
    console.log("[bootstrap] campaign/list seeding skipped (pass --seed-campaigns and/or --seed-lists)");
    return;
  }

  if (seedCampaigns) {
    const seenCampaigns = new Set<string>();
    for (const agent of input.agents) {
      const campaignId = String(agent.campaignId).trim();
      if (!campaignId || seenCampaigns.has(campaignId)) continue;
      seenCampaigns.add(campaignId);

      const campaignName = agent.campaignName?.trim() || `Retention ${campaignId}`;
      const result = await callVicidialNonAgentApi("add_campaign", {
        campaign_id: campaignId,
        campaign_name: campaignName,
        active: "Y",
      });

      if (result.isError) {
        if (isNoFunctionError(result.raw)) {
          console.warn(
            `[bootstrap] add_campaign not supported by this VICIdial API for campaign ${campaignId}. Create campaign manually in VICIdial UI.`,
          );
        } else {
          console.warn(`[bootstrap] add_campaign warning for campaign ${campaignId}`);
          console.warn(result.raw.trim());
        }
      } else {
        console.log(`[bootstrap] add_campaign ok for campaign ${campaignId}`);
      }
    }
  } else {
    console.log("[bootstrap] campaign seeding skipped (pass --seed-campaigns to enable)");
  }

  if (!seedLists) {
    console.log("[bootstrap] list seeding skipped (pass --seed-lists to enable)");
    return;
  }

  const seen = new Set<string>();
  for (const agent of input.agents) {
    const key = `${agent.listId}|${agent.campaignId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const listId = String(agent.listId);
    const listName = agent.listName ?? `Retention ${agent.campaignId} ${listId}`;

    const campaignCheck = await campaignExists(agent.campaignId);
    if (!campaignCheck.exists) {
      console.warn(
        `[bootstrap] skipping add_list for list ${listId}: campaign ${agent.campaignId} not found in VICIdial.`,
      );
      console.warn("[bootstrap] create campaign manually first, then rerun with --seed-lists.");
      continue;
    }

    const result = await callVicidialNonAgentApi("add_list", {
      list_id: listId,
      list_name: listName,
      list_description: listName,
      campaign_id: agent.campaignId,
      active: "Y",
      reset_time: "N",
      web_form_address: "",
    });

    if (result.isError) {
      console.warn(`[bootstrap] add_list warning for list ${listId} campaign ${agent.campaignId}`);
      console.warn(result.raw.trim());
    } else {
      console.log(`[bootstrap] add_list ok for list ${listId} campaign ${agent.campaignId}`);
    }
  }
}

main().catch((error) => {
  console.error("[bootstrap] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
