"""
compare_missing.py

Compares:
  all_clean.csv            — the cleaned superset (source of truth going forward)
  monday_com_deals_rows.csv — full export from Supabase

Logs every row that exists in monday_com_deals_rows but is MISSING from all_clean.
Also saves the missing rows to missing_from_all_clean.csv for use by make_inactive.py.

Usage:
  python3 compare_missing.py
"""

import csv
import os

DIR = os.path.dirname(os.path.abspath(__file__))
ALL_CLEAN_PATH = os.path.join(DIR, "all_clean.csv")
SUPABASE_PATH  = os.path.join(DIR, "monday_com_deals_rows.csv")
OUTPUT_PATH    = os.path.join(DIR, "missing_from_all_clean.csv")


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader), reader.fieldnames


print("📂 Loading files…")
all_clean_rows, headers = load_csv(ALL_CLEAN_PATH)
supabase_rows, _        = load_csv(SUPABASE_PATH)

print(f"   all_clean.csv          → {len(all_clean_rows):,} rows")
print(f"   monday_com_deals_rows  → {len(supabase_rows):,} rows")

# Build a set of IDs present in all_clean
clean_ids = {str(r["id"]).strip() for r in all_clean_rows}

# Find rows in supabase that are NOT in all_clean
missing_rows = [r for r in supabase_rows if str(r["id"]).strip() not in clean_ids]

# ── output ────────────────────────────────────────────────────────────────────

if not missing_rows:
    print("\n✅ No missing rows — all_clean contains every ID from Supabase.")
else:
    print(f"\n⚠️  {len(missing_rows)} row(s) in monday_com_deals_rows MISSING from all_clean:\n")

    # Pretty table
    col_id     = "ID"
    col_name   = "Deal Name"
    col_status = "Policy Status"
    col_active = "Is Active"
    col_carrier= "Carrier"

    print(
        f"{'ID':<12} {'Deal Name':<42} {'Policy Status':<24} {'Is Active':<12} Carrier"
    )
    print("-" * 105)

    for r in missing_rows:
        print(
            f"{str(r.get('id','')):<12} "
            f"{str(r.get('deal_name',''))[:41]:<42} "
            f"{str(r.get('policy_status',''))[:23]:<24} "
            f"{str(r.get('is_active','')):<12} "
            f"{str(r.get('carrier',''))}"
        )

    # Save to CSV (python csv writer handles quoting/newlines correctly)
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(missing_rows)

    print(f"\n💾 Missing rows saved to: missing_from_all_clean.csv")
    print(f"   → Use this file as input to:  python3 make_inactive.py")
