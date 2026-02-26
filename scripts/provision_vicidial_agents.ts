import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

type BootstrapAgent = {
  profileId: string;
  campaignId: string;
  campaignName?: string;
  listId: string | number;
  vicidialUser?: string;
  listName?: string;
  webformBaseUrl?: string;
};

type BootstrapInput = {
  agents: BootstrapAgent[];
};

type ProvisionResult = {
  profileId: string;
  campaignId: string;
  listId: string | number;
  user: string;
  created: {
    campaign: boolean;
    list: boolean;
    user: boolean;
  };
  warnings: string[];
};

type VicidialMappingOutput = Record<
  string,
  { campaignId: string; listId: string | number; vicidialUser?: string; webformBaseUrl?: string }
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
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function maybeEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length ? value.trim() : null;
}

function normalizeUser(name: string | undefined, profileId: string) {
  const base = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base.length >= 3) return base.slice(0, 20);
  return `ag_${profileId.replace(/-/g, "").slice(0, 8)}`;
}

function campaignIdValid(id: string) {
  return /^[A-Za-z0-9]{2,8}$/.test(id);
}

function normalizeCampaignId(raw: string, profileId: string) {
  const cleaned = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (campaignIdValid(cleaned)) return cleaned;
  const base = cleaned.slice(0, 3) || "ret";
  const suffix = profileId.replace(/-/g, "").toLowerCase().slice(0, 5);
  return `${base}${suffix}`.slice(0, 8);
}

function randomPass() {
  return `Ret!${Math.random().toString(36).slice(2, 10)}A1`;
}

async function callVicidialNonAgentApi(fn: string, params: Record<string, string | number>) {
  const baseUrl = assertEnv("VICIDIAL_ASSIGN_BASE_URL").replace(/\/+$/, "");
  const user = assertEnv("VICIDIAL_ASSIGN_API_USER");
  const pass = assertEnv("VICIDIAL_ASSIGN_API_PASS");
  const source = maybeEnv("VICIDIAL_ASSIGN_API_SOURCE") ?? "retention_portal";

  const body = new URLSearchParams();
  body.set("source", source);
  body.set("user", user);
  body.set("pass", pass);
  body.set("function", fn);

  for (const [k, v] of Object.entries(params)) body.set(k, String(v));

  const res = await fetch(`${baseUrl}/non_agent_api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });
  const raw = await res.text();
  const isError = /\bERROR\b/i.test(raw) || /\|BAD\|/i.test(raw);
  return { status: res.status, raw, isError };
}

async function getDb() {
  const host = maybeEnv("VICIDIAL_DB_HOST");
  const user = maybeEnv("VICIDIAL_DB_USER");
  const password = maybeEnv("VICIDIAL_DB_PASS");
  const database = maybeEnv("VICIDIAL_DB_NAME");
  const port = Number(maybeEnv("VICIDIAL_DB_PORT") ?? "3306");

  if (!host || !user || !database) return null;

  return mysql.createConnection({
    host,
    user,
    password: password ?? undefined,
    database,
    port,
  });
}

async function ensureCampaign(agent: BootstrapAgent, warnings: string[], db: mysql.Connection | null) {
  // Campaign provisioning is intentionally disabled for now.
  // Campaigns are expected to be created manually in VICIdial UI.
  if (db) {
    const [rows] = await db.query("SELECT campaign_id FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1", [
      agent.campaignId,
    ]);
    if (Array.isArray(rows) && rows.length > 0) return true;
  }
  warnings.push(`campaign provisioning skipped (manual): ${agent.campaignId}`);
  return true;
}

async function ensureList(agent: BootstrapAgent, warnings: string[], db: mysql.Connection | null) {
  const listName = agent.listName?.trim() || `Retention ${agent.listId}`;
  const listId = String(agent.listId);
  const api = await callVicidialNonAgentApi("add_list", {
    list_id: listId,
    list_name: listName,
    list_description: listName,
    active: "Y",
    reset_time: "N",
    web_form_address: "",
  });

  if (!api.isError || /ALREADY EXISTS/i.test(api.raw)) return true;

  if (!db) {
    warnings.push(`list API error for ${listId}: ${api.raw.trim()}`);
    return false;
  }

  const [rows] = await db.query("SELECT list_id FROM vicidial_lists WHERE list_id = ? LIMIT 1", [listId]);
  if (Array.isArray(rows) && rows.length > 0) return true;

  await db.query(
    `INSERT INTO vicidial_lists
      (list_id, list_name, active, campaign_id, list_description, reset_time, web_form_address)
     VALUES
      (?, ?, 'Y', ?, ?, 'N', '')`,
    [listId, listName, "NONE", listName],
  );
  return true;
}

async function ensureUser(agent: BootstrapAgent, warnings: string[], db: mysql.Connection | null) {
  const userId = normalizeUser(agent.vicidialUser, agent.profileId);
  const fullName = `Retention ${userId}`;
  const password = randomPass();

  // VICIdial non_agent_api add_user commonly expects agent_* fields.
  const attemptA = await callVicidialNonAgentApi("add_user", {
    agent_user: userId,
    agent_pass: password,
    agent_user_level: "1",
    agent_full_name: fullName,
    agent_user_group: "agents",
    phone_login: "9999",
    phone_pass: "9999",
    active: "Y",
    hotkeys_active: "1",
  });

  if (!attemptA.isError || /ALREADY EXISTS/i.test(attemptA.raw)) return { ok: true, userId };

  // Retry with alternate parameter names used by some builds.
  const attemptB = await callVicidialNonAgentApi("add_user", {
    user_id: userId,
    password,
    full_name: fullName,
    user_level: "1",
    user_group: "agents",
    active: "Y",
    phone_login: "9999",
    phone_pass: "9999",
    agent_choose_ingroups: "1",
    agent_choose_blended: "1",
    agent_call_manual: "1",
  });
  if (!attemptB.isError || /ALREADY EXISTS/i.test(attemptB.raw)) return { ok: true, userId };

  // Retry with fully-prefixed "new_*" field names.
  const attemptC = await callVicidialNonAgentApi("add_user", {
    new_user: userId,
    new_pass: password,
    new_full_name: fullName,
    new_user_level: "1",
    new_user_group: "agents",
    new_active: "Y",
    new_phone_login: "9999",
    new_phone_pass: "9999",
    new_agent_choose_ingroups: "1",
    new_agent_choose_blended: "1",
    new_agent_call_manual: "1",
  });
  if (!attemptC.isError || /ALREADY EXISTS/i.test(attemptC.raw)) return { ok: true, userId };

  // Retry with minimum required style used by older builds.
  const attemptD = await callVicidialNonAgentApi("add_user", {
    stage: "ADD",
    user_id: userId,
    user_pass: password,
    user_password: password,
    pass_hash: password,
    full_name: fullName,
    name: fullName,
    user_level: "1",
    user_group: "agents",
    active: "Y",
    phone_login: "9999",
    phone_pass: "9999",
  });
  if (!attemptD.isError || /ALREADY EXISTS/i.test(attemptD.raw)) return { ok: true, userId };

  // Max-compat payload for older/custom builds expecting different parameter keys.
  const attemptE = await callVicidialNonAgentApi("add_user", {
    stage: "ADD",
    user_id: userId,
    username: userId,
    userid: userId,
    new_user: userId,
    password,
    user_pass: password,
    user_password: password,
    new_pass: password,
    new_password: password,
    pass_hash: password,
    full_name: fullName,
    name: fullName,
    new_full_name: fullName,
    user_level: "1",
    new_user_level: "1",
    user_group: "agents",
    new_user_group: "agents",
    active: "Y",
    new_active: "Y",
    phone_login: "9999",
    new_phone_login: "9999",
    phone_pass: "9999",
    new_phone_pass: "9999",
    agent_choose_ingroups: "1",
    new_agent_choose_ingroups: "1",
    agent_choose_blended: "1",
    new_agent_choose_blended: "1",
    agent_call_manual: "1",
    new_agent_call_manual: "1",
  });
  if (!attemptE.isError || /ALREADY EXISTS/i.test(attemptE.raw)) return { ok: true, userId };

  {
    const apiErrors = [attemptA.raw.trim(), attemptB.raw.trim(), attemptC.raw.trim(), attemptD.raw.trim(), attemptE.raw.trim()]
      .filter(Boolean)
      .join(" || ");
    if (!db) {
      warnings.push(`user API error for ${userId}: ${apiErrors}`);
      return { ok: false, userId };
    }
  }

  if (db) {
    const [rows] = await db.query("SELECT user FROM vicidial_users WHERE user = ? LIMIT 1", [userId]);
    if (Array.isArray(rows) && rows.length > 0) return { ok: true, userId };

    await db.query(
      `INSERT INTO vicidial_users
      (user, pass, full_name, user_level, user_group, active, phone_login, phone_pass, agent_choose_ingroups, agent_choose_blended, agent_call_manual)
     VALUES
      (?, ?, ?, '1', 'agents', 'Y', '9999', '9999', '1', '1', '1')`,
      [userId, password, fullName],
    );
    return { ok: true, userId };
  }

  return { ok: false, userId };
}

async function main() {
  const usersOnly = hasFlag("--users-only");
  const skipUsers = hasFlag("--skip-users");
  const skipLists = hasFlag("--skip-lists");
  const skipCampaigns = hasFlag("--skip-campaigns");

  const configPath = path.resolve(process.cwd(), getArg("--config", "data/vicidial-agent-bootstrap.generated.json")!);
  const outputPath = path.resolve(
    process.cwd(),
    getArg("--output", "src/config/vicidial-agent-mapping.local.json")!,
  );

  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as BootstrapInput;
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    throw new Error("No agents found in config.");
  }

  for (const a of parsed.agents) {
    const normalized = normalizeCampaignId(a.campaignId, a.profileId);
    if (!campaignIdValid(normalized)) {
      throw new Error(`Invalid campaignId ${a.campaignId}. Could not normalize to 2-8 alphanumeric chars.`);
    }
    if (normalized !== a.campaignId) a.campaignId = normalized;
  }

  const db = await getDb();
  const mapping: VicidialMappingOutput = {};
  const results: ProvisionResult[] = [];

  for (const agent of parsed.agents) {
    const warnings: string[] = [];
    const campaignCreated = usersOnly || skipCampaigns ? true : await ensureCampaign(agent, warnings, db);
    const listCreated =
      usersOnly || skipLists ? true : campaignCreated ? await ensureList(agent, warnings, db) : false;
    const userResult = usersOnly || !skipUsers ? await ensureUser(agent, warnings, db) : { ok: true, userId: "" };

    const userId = userResult.userId || normalizeUser(agent.vicidialUser, agent.profileId);
    mapping[agent.profileId] = {
      campaignId: agent.campaignId,
      listId: agent.listId,
      vicidialUser: userId,
      webformBaseUrl: agent.webformBaseUrl,
    };

    results.push({
      profileId: agent.profileId,
      campaignId: agent.campaignId,
      listId: agent.listId,
      user: userId,
      created: { campaign: campaignCreated, list: listCreated, user: userResult.ok },
      warnings,
    });
  }

  await writeFile(outputPath, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
  console.log(`[provision] wrote mapping: ${outputPath}`);
  console.log("[provision] results:");
  for (const r of results) {
    console.log(
      `- ${r.profileId} => campaign=${r.campaignId}(${r.created.campaign ? "ok" : "fail"}) list=${r.listId}(${r.created.list ? "ok" : "fail"}) user=${r.user}(${r.created.user ? "ok" : "fail"})`,
    );
    for (const w of r.warnings) console.log(`  warning: ${w}`);
  }

  if (db) await db.end();
}

main().catch((err) => {
  console.error("[provision] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
