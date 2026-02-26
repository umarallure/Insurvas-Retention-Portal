import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type RetentionAgentRow = {
  profile_id: string;
};

type BootstrapAgent = {
  profileId: string;
  campaignId: string;
  listId: string;
  vicidialUser?: string;
  listName?: string;
};

type BootstrapOutput = {
  generatedAt: string;
  note: string;
  agents: BootstrapAgent[];
};

function assertEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getArg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function toVicidialUser(displayName: string | null) {
  const base = (displayName ?? "agent")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "agent";
}

function toCampaignId(displayName: string | null, profileId: string, prefix: string) {
  // VICIdial campaign_id must be 2-8 chars.
  // Build: 3-char prefix + 5-char deterministic suffix from profile UUID.
  const safePrefix = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 3) || "ret";
  const suffix = profileId.replace(/-/g, "").toLowerCase().slice(0, 5);
  const value = `${safePrefix}${suffix}`;
  return value.slice(0, 8);
}

async function main() {
  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const campaignPrefix = process.env.VICIDIAL_CAMPAIGN_PREFIX ?? "ret";
  const forceSingleCampaignId = getArg("--single-campaign", "")?.trim() || "";
  const defaultListId = process.env.VICIDIAL_ASSIGN_DEFAULT_LIST_ID ?? "1000";

  const outputPath = path.resolve(
    process.cwd(),
    getArg("--output", "data/vicidial-agent-bootstrap.generated.json")!,
  );

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: raRows, error: raErr } = await supabase
    .from("retention_agents")
    .select("profile_id")
    .eq("active", true);

  if (raErr) throw new Error(`Failed loading retention_agents: ${raErr.message}`);

  const profileIds = ((raRows ?? []) as RetentionAgentRow[])
    .map((r) => r.profile_id)
    .filter((v): v is string => Boolean(v));

  if (profileIds.length === 0) {
    throw new Error("No active retention agents found.");
  }

  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", profileIds);

  if (profilesErr) throw new Error(`Failed loading profiles: ${profilesErr.message}`);

  const byId = new Map<string, ProfileRow>();
  for (const row of (profiles ?? []) as ProfileRow[]) {
    byId.set(row.id, row);
  }

  const usedUsers = new Set<string>();
  const agents: BootstrapAgent[] = [];
  let listCounter = Number(defaultListId);
  const listIsNumeric = Number.isFinite(listCounter);

  for (const profileId of profileIds) {
    const p = byId.get(profileId) ?? { id: profileId, display_name: null };
    let vicidialUser = toVicidialUser(p.display_name);
    if (usedUsers.has(vicidialUser)) {
      let suffix = 2;
      while (usedUsers.has(`${vicidialUser}_${suffix}`)) suffix += 1;
      vicidialUser = `${vicidialUser}_${suffix}`;
    }
    usedUsers.add(vicidialUser);

    const listId = listIsNumeric ? String(listCounter++) : defaultListId;
    const listName = `Retention ${p.display_name ?? profileId}`;
    const campaignId = forceSingleCampaignId.length
      ? forceSingleCampaignId
      : toCampaignId(p.display_name, profileId, campaignPrefix);
    const campaignName = `Retention ${p.display_name ?? profileId}`;

    agents.push({
      profileId,
      campaignId,
      campaignName,
      listId,
      vicidialUser,
      listName,
    });
  }

  const out: BootstrapOutput = {
    generatedAt: new Date().toISOString(),
    note: "Review campaignId/listId/vicidialUser before running bootstrap_vicidial_agent_mapping.ts",
    agents,
  };

  await writeFile(outputPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`[generate] wrote ${agents.length} agents -> ${outputPath}`);
}

main().catch((error) => {
  console.error("[generate] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
