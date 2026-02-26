type VicidialPrimitive = string | number | boolean;
export type VicidialParams = Record<string, VicidialPrimitive | null | undefined>;

export type VicidialApiResult = {
  ok: boolean;
  status: number;
  raw: string;
  parsed: Record<string, string>;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseVicidialResponse(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    parsed[key] = value;
  }

  return parsed;
}

async function callVicidialNonAgentApiInternal(
  baseUrl: string,
  user: string,
  pass: string,
  source: string,
  fn: string,
  inputParams: VicidialParams = {},
): Promise<VicidialApiResult> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  const body = new URLSearchParams();
  body.set("source", source);
  body.set("user", user);
  body.set("pass", pass);
  body.set("function", fn);

  for (const [key, value] of Object.entries(inputParams)) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }

  const response = await fetch(`${normalizedBaseUrl}/non_agent_api.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
  });

  const raw = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    raw,
    parsed: parseVicidialResponse(raw),
  };
}

export async function callVicidialNonAgentApi(
  fn: string,
  inputParams: VicidialParams = {},
): Promise<VicidialApiResult> {
  const baseUrl = getRequiredEnv("VICIDIAL_BASE_URL");
  const user = getRequiredEnv("VICIDIAL_API_USER");
  const pass = getRequiredEnv("VICIDIAL_API_PASS");
  const source = process.env.VICIDIAL_API_SOURCE ?? "retention_portal";
  return callVicidialNonAgentApiInternal(baseUrl, user, pass, source, fn, inputParams);
}

export async function callVicidialAssignmentApi(
  fn: string,
  inputParams: VicidialParams = {},
): Promise<VicidialApiResult> {
  const baseUrl = process.env.VICIDIAL_ASSIGN_BASE_URL ?? getRequiredEnv("VICIDIAL_BASE_URL");
  const user = process.env.VICIDIAL_ASSIGN_API_USER ?? getRequiredEnv("VICIDIAL_API_USER");
  const pass = process.env.VICIDIAL_ASSIGN_API_PASS ?? getRequiredEnv("VICIDIAL_API_PASS");
  const source = process.env.VICIDIAL_ASSIGN_API_SOURCE ?? process.env.VICIDIAL_API_SOURCE ?? "retention_portal";
  return callVicidialNonAgentApiInternal(baseUrl, user, pass, source, fn, inputParams);
}

export async function callVicidialAgentApi(
  fn: string,
  inputParams: VicidialParams = {},
): Promise<VicidialApiResult> {
  const baseUrl = getRequiredEnv("VICIDIAL_BASE_URL").replace(/\/+$/, "");
  const user = process.env.VICIDIAL_AGENT_API_USER ?? getRequiredEnv("VICIDIAL_API_USER");
  const pass = process.env.VICIDIAL_AGENT_API_PASS ?? getRequiredEnv("VICIDIAL_API_PASS");
  const source = process.env.VICIDIAL_API_SOURCE ?? "retention_portal";

  const body = new URLSearchParams();
  body.set("source", source);
  body.set("user", user);
  body.set("pass", pass);
  body.set("function", fn);

  for (const [key, value] of Object.entries(inputParams)) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }

  const explicitAgentApiUrl = process.env.VICIDIAL_AGENT_API_URL?.trim();
  const origin = new URL(baseUrl).origin;
  const candidateUrls = [
    explicitAgentApiUrl,
    `${baseUrl}/agc/api.php`,
    `${origin}/agc/api.php`,
  ].filter((v, idx, arr): v is string => Boolean(v) && arr.indexOf(v as string) === idx);

  let response: Response | null = null;
  for (const url of candidateUrls) {
    const attempt = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: body.toString(),
    });
    response = attempt;
    if (attempt.status !== 404) break;
  }

  if (!response) {
    throw new Error("No VICIdial agent API URL candidates available");
  }

  const raw = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    raw,
    parsed: parseVicidialResponse(raw),
  };
}
