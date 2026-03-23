import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

function getArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function getFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function deleteContact(contactId: string, token: string): Promise<boolean> {
  const url = `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`;

  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
    },
  });

  if (resp.ok) {
    return true;
  }

  const body = await resp.text();
  console.error(
    `[contacts-delete] Failed to delete ${contactId}: HTTP ${resp.status} ${resp.statusText} - ${body}`,
  );
  return false;
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    getArg("--input", "monday.com-deals/master_contacts_tcpa_only.csv")!,
  );

  const token = getArg("--token", process.env.GHL_API_TOKEN ?? "pit-0dc57f27-5819-473d-ac50-dd8979b7f946");
  if (!token) {
    throw new Error("GHL API token is required (set GHL_API_TOKEN or pass --token)");
  }

  const dryRun = getFlag("--dry-run");

  console.log("[contacts-delete] input:", inputPath);
  console.log("[contacts-delete] mode:", dryRun ? "dry-run (no deletions)" : "apply (deleting)");

  const raw = await readFile(inputPath, "utf8");
  const lines = raw.split(/\r?\n/g).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    console.log("[contacts-delete] no data rows found");
    return;
  }

  const [header, ...rows] = lines;

  const headerCols = header.split(",");
  const idIndex = headerCols.findIndex((h) => h.trim().toLowerCase() === "contact id");
  const useFirstColumn = idIndex === -1;

  if (useFirstColumn) {
    console.warn("[contacts-delete] 'Contact Id' column not found, using first column as id");
  }

  const ids: string[] = [];

  for (const row of rows) {
    if (!row.trim()) continue;
    let id: string;
    if (useFirstColumn) {
      const firstComma = row.indexOf(",");
      id = firstComma === -1 ? row.trim() : row.slice(0, firstComma).trim();
    } else {
      const cols = row.split(",");
      id = (cols[idIndex] ?? "").trim();
    }
    if (!id) continue;
    ids.push(id);
  }

  const uniqueIds = Array.from(new Set(ids));
  console.log("[contacts-delete] contacts in file:", ids.length);
  console.log("[contacts-delete] unique contact ids:", uniqueIds.length);

  if (dryRun) {
    console.log("[contacts-delete] dry run complete. These ids would be deleted:");
    console.log(uniqueIds.join("\n"));
    return;
  }

  let successCount = 0;
  let failureCount = 0;

  for (const id of uniqueIds) {
    // Simple sequential deletion to avoid rate limiting issues.
    const ok = await deleteContact(id, token);
    if (ok) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
  }

  console.log("[contacts-delete] finished.", {
    requested: uniqueIds.length,
    success: successCount,
    failed: failureCount,
  });
}

main().catch((error) => {
  console.error("[contacts-delete] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
