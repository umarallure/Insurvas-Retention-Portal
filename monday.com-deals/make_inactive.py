"""
make_inactive.py

Reads missing_from_all_clean.csv (produced by compare_missing.py) and
marks every deal as is_active = false via the Supabase REST API.

Prerequisites:
  pip install requests python-dotenv

Environment variables (in a .env file or exported):
  SUPABASE_URL         — e.g. https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY — service-role key (write access)

Usage:
  python3 make_inactive.py           # dry-run (no changes made)
  python3 make_inactive.py --live    # actually patches Supabase
"""

import csv
import json
import os
import sys
import time

# ── env / deps ────────────────────────────────────────────────────────────────

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))
except ImportError:
    pass  # dotenv optional — env vars can also be exported in the shell

try:
    import requests
except ImportError:
    print("❌ Missing dependency: pip install requests")
    sys.exit(1)

# ── config ────────────────────────────────────────────────────────────────────

TABLE_NAME  = "deals"   # ← adjust to your actual Supabase table name
DIR         = os.path.dirname(os.path.abspath(__file__))
INPUT_CSV   = os.path.join(DIR, "missing_from_all_clean.csv")
LIVE_MODE   = "--live" in sys.argv

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")

# ── helpers ───────────────────────────────────────────────────────────────────

def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def patch_deal(deal_id):
    url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}?id=eq.{deal_id}"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "return=representation",
    }
    resp = requests.patch(url, headers=headers, json={"is_active": False})
    resp.raise_for_status()
    return resp.json()

# ── main ─────────────────────────────────────────────────────────────────────

if not os.path.exists(INPUT_CSV):
    print(f"❌ Input file not found: {INPUT_CSV}")
    print("   Run compare_missing.py first to generate it.")
    sys.exit(1)

all_rows   = load_csv(INPUT_CSV)
valid_rows = [r for r in all_rows if str(r.get("id", "")).strip().isdigit()]

print(f"📂 Loaded {len(valid_rows):,} valid deal(s) from missing_from_all_clean.csv")
print(f"🔧 Mode: {'⚡ LIVE — will PATCH Supabase' if LIVE_MODE else '🔍 DRY RUN — no changes made'}\n")

if LIVE_MODE and (not SUPABASE_URL or not SUPABASE_KEY):
    print("❌ Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.")
    sys.exit(1)

# Print table of deals to act on
print(f"{'ID':<12} {'Deal Name':<42} {'Policy Status':<24} Carrier")
print("-" * 95)
for r in valid_rows:
    print(
        f"{str(r.get('id','')):<12} "
        f"{str(r.get('deal_name',''))[:41]:<42} "
        f"{str(r.get('policy_status',''))[:23]:<24} "
        f"{str(r.get('carrier',''))}"
    )

if not LIVE_MODE:
    print(f"\n🔍 Dry run complete — {len(valid_rows):,} deals would be marked inactive.")
    print("   Re-run with --live to apply changes:\n   python3 make_inactive.py --live")
    sys.exit(0)

# ── Live: PATCH each deal ─────────────────────────────────────────────────────

print("\n⚡ Starting PATCH requests…\n")

success = 0
failed  = 0
errors  = []

for i, row in enumerate(valid_rows, 1):
    deal_id   = str(row["id"]).strip()
    deal_name = row.get("deal_name", "")
    print(f"[{i}/{len(valid_rows)}] Deal {deal_id} ({deal_name})… ", end="", flush=True)

    try:
        patch_deal(deal_id)
        print("✅ done")
        success += 1
    except Exception as e:
        print(f"❌ FAILED — {e}")
        errors.append({"id": deal_id, "name": deal_name, "error": str(e)})
        failed += 1

    # Small delay to avoid hammering the API
    if i < len(valid_rows):
        time.sleep(0.05)

# ── summary ───────────────────────────────────────────────────────────────────

print("\n" + "─" * 40)
print(f"✅ Success: {success:,}")
print(f"❌ Failed:  {failed:,}")

if errors:
    err_path = os.path.join(DIR, "make_inactive_errors.json")
    with open(err_path, "w") as f:
        json.dump(errors, f, indent=2)
    print(f"\n⚠️  Errors saved to: make_inactive_errors.json")
