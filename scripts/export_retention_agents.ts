import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  const outputPath = path.resolve(
    process.cwd(),
    getArg("--output", "data/retention-agents.json")!,
  );
  const includeInactive = process.argv.includes("--include-inactive");

  const supabase = createClient(
    assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
    assertEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  let query = supabase
    .from("retention_agents")
    .select("profile_id, active, profiles:profile_id ( id, display_name, agent_code, user_id )")
    .order("profile_id", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed loading retention agents: ${error.message}`);
  }

  const rows = ((data ?? []) as RetentionAgentRow[]).map((row) => ({
    retention_profile_id: row.profile_id,
    active: row.active ?? null,
    display_name: row.profiles?.display_name ?? null,
    agent_code: row.profiles?.agent_code ?? null,
    user_id: row.profiles?.user_id ?? null,
  }));

  const output = {
    generated_at: new Date().toISOString(),
    include_inactive: includeInactive,
    count: rows.length,
    retention_agents: rows,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`[retention-agents] wrote ${outputPath}`);
  console.log(JSON.stringify({ count: rows.length, include_inactive: includeInactive }, null, 2));
}

main().catch((error) => {
  console.error("[retention-agents] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
