import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type PaginatedCloudTalkResponse<T> = {
  responseData: {
    itemsCount?: number;
    pageCount?: number;
    pageNumber?: number;
    limit?: number;
    data?: T[];
    status?: number;
    message?: string;
  };
};

type CloudTalkTagRow = {
  Tag?: {
    id?: string | number;
    name?: string;
    color?: string;
  };
};

type CloudTalkCampaignRow = {
  Campaign?: {
    id?: string | number;
    name?: string;
    status?: string;
  };
  ContactsTag?: Array<{
    id?: string | number;
    name?: string;
  }>;
  Tag?: Array<{
    id?: string | number;
    name?: string;
  }>;
  Agent?: Array<{
    id?: string | number;
    fullname?: string;
  }>;
};

type CloudTalkAgentRow = {
  Agent?: {
    id?: string | number;
    fullname?: string;
    email?: string;
    active?: boolean | string;
  };
  Group?: Array<{
    id?: string | number;
    internal_name?: string;
  }>;
  Number?: Array<{
    id?: string | number;
    number?: string;
  }>;
};

type RetentionAgentRow = {
  profile_id: string;
  active?: boolean | null;
  profiles?: {
    id: string;
    display_name: string | null;
    agent_code?: string | null;
    user_id?: string | null;
  } | null;
};

function assertEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createCloudTalkAuthHeader(): string {
  const accountId = assertEnv("NEXT_PUBLIC_CLOUDTALK_ACCOUNT_ID");
  const apiSecret = assertEnv("NEXT_PUBLIC_CLOUDTALK_API_SECRET");
  return `Basic ${Buffer.from(`${accountId}:${apiSecret}`).toString("base64")}`;
}

async function fetchCloudTalkPage<T>(pathName: string, page: number, limit: number): Promise<PaginatedCloudTalkResponse<T>> {
  const authHeader = createCloudTalkAuthHeader();
  const url = new URL(`https://my.cloudtalk.io/api${pathName}`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
    },
  });

  const data = (await response.json()) as PaginatedCloudTalkResponse<T>;
  if (!response.ok) {
    throw new Error(
      `[cloudtalk] ${pathName} failed with ${response.status}: ${data.responseData?.message || "Unknown error"}`,
    );
  }

  return data;
}

async function fetchAllCloudTalkRows<T>(pathName: string, limit = 1000): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const payload = await fetchCloudTalkPage<T>(pathName, page, limit);
    const responseData = payload.responseData ?? {};
    rows.push(...(responseData.data ?? []));
    pageCount = Number(responseData.pageCount ?? 1) || 1;
    page += 1;
  }

  return rows;
}

async function fetchRetentionAgents() {
  const supabase = createClient(
    assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
    assertEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  const { data, error } = await supabase
    .from("retention_agents")
    .select("profile_id, active, profiles:profile_id ( id, display_name, agent_code, user_id )")
    .eq("active", true)
    .order("profile_id", { ascending: true });

  if (error) {
    throw new Error(`Failed loading retention agents: ${error.message}`);
  }

  return (data ?? []) as RetentionAgentRow[];
}

async function main() {
  const outputPath = path.resolve(
    process.cwd(),
    getArg("--output", "data/cloudtalk-reference-data.json")!,
  );

  const [tags, campaigns, agents, retentionAgents] = await Promise.all([
    fetchAllCloudTalkRows<CloudTalkTagRow>("/tags/index.json"),
    fetchAllCloudTalkRows<CloudTalkCampaignRow>("/campaigns/index.json"),
    fetchAllCloudTalkRows<CloudTalkAgentRow>("/agents/index.json"),
    fetchRetentionAgents(),
  ]);

  const normalizedRetentionAgents = retentionAgents.map((row) => ({
    retention_profile_id: row.profile_id,
    display_name: row.profiles?.display_name ?? null,
    agent_code: row.profiles?.agent_code ?? null,
    user_id: row.profiles?.user_id ?? null,
    normalized_name: normalizeName(row.profiles?.display_name),
  }));

  const retentionByName = new Map<string, typeof normalizedRetentionAgents>();
  for (const row of normalizedRetentionAgents) {
    if (!row.normalized_name) continue;
    const list = retentionByName.get(row.normalized_name) ?? [];
    list.push(row);
    retentionByName.set(row.normalized_name, list);
  }

  const normalizedAgents = agents.map((row) => {
    const fullname = row.Agent?.fullname ?? null;
    const normalized_name = normalizeName(fullname);
    const retentionMatches = normalized_name ? retentionByName.get(normalized_name) ?? [] : [];

    return {
      cloudtalk_agent_id: row.Agent?.id != null ? String(row.Agent.id) : null,
      fullname,
      email: row.Agent?.email ?? null,
      active: row.Agent?.active ?? null,
      groups: row.Group ?? [],
      numbers: row.Number ?? [],
      normalized_name,
      matched_retention_agents: retentionMatches.map((match) => ({
        retention_profile_id: match.retention_profile_id,
        display_name: match.display_name,
        agent_code: match.agent_code,
        user_id: match.user_id,
      })),
    };
  });

  const normalizedTags = tags.map((row) => ({
    cloudtalk_tag_id: row.Tag?.id != null ? String(row.Tag.id) : null,
    name: row.Tag?.name ?? null,
    color: row.Tag?.color ?? null,
  }));

  const normalizedCampaigns = campaigns.map((row) => ({
    cloudtalk_campaign_id: row.Campaign?.id != null ? String(row.Campaign.id) : null,
    name: row.Campaign?.name ?? null,
    status: row.Campaign?.status ?? null,
    tags: row.ContactsTag ?? row.Tag ?? [],
    agents: row.Agent ?? [],
  }));

  const output = {
    generated_at: new Date().toISOString(),
    cloudtalk: {
      tags: normalizedTags,
      campaigns: normalizedCampaigns,
      agents: normalizedAgents,
    },
    retention_agents: normalizedRetentionAgents.map((row) => ({
      retention_profile_id: row.retention_profile_id,
      display_name: row.display_name,
      agent_code: row.agent_code,
      user_id: row.user_id,
    })),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`[cloudtalk-export] wrote ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        tags: normalizedTags.length,
        campaigns: normalizedCampaigns.length,
        cloudtalk_agents: normalizedAgents.length,
        retention_agents: normalizedRetentionAgents.length,
        exact_name_matches: normalizedAgents.filter((agent) => agent.matched_retention_agents.length > 0).length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[cloudtalk-export] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
