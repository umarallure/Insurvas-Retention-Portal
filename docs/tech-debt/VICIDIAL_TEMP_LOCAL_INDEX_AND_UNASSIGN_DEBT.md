# VICIdial Tech Debt: Temporary Local Lead Index + Unassign Reliability

## Context
Current unassign flow cannot reliably use VICIdial non-agent search APIs on this VICIdial build:
- `lead_search` returns `NO VALID SEARCH METHOD` for methods we need.
- `check_phone_number` requires additional call-time params and is not reliable for this use-case.

To keep unassign working, we added a temporary local file index:
- `src/config/vicidial-lead-index.local.json`
- Populated by `/api/vicidial/add-lead`
- Read by `/api/vicidial/unassign-lead` to update by exact `lead_id`

This is an interim local-only workaround.

## Why this is debt
- File-based state is not durable across multi-instance deployments.
- Local file can drift from DB if server restarts, file is deleted, or assign/unassign requests fail mid-flow.
- No transactional consistency with `retention_assigned_leads`.
- Harder to observe/audit than DB-backed linkage.

## Required target state (Supabase-backed)
1. Add column on `retention_assigned_leads`:
   - `vicidial_lead_id` (nullable bigint/int)
2. On assign:
   - Parse `lead_id` from VICIdial `add_lead` success.
   - Save `vicidial_lead_id` in assignment row.
3. On unassign:
   - Use `vicidial_lead_id` directly with `update_lead` (`status=ERI` or configured unassign status).
   - Remove/clear `vicidial_lead_id` when assignment is deleted.
4. Keep fallback behavior:
   - If `vicidial_lead_id` missing, attempt deterministic lookup by `list_id + vendor_lead_code` (DB read path), then backfill.

## Additional cleanup needed
1. Remove temporary local file logic:
   - `src/lib/vicidial-lead-index.ts`
   - `src/config/vicidial-lead-index.local.json`
2. Update tests (or add smoke scripts) for:
   - assign -> add_lead -> stores `vicidial_lead_id`
   - unassign -> update_lead by `vicidial_lead_id`
   - dedupe path when same deal is re-assigned
3. Add logging/metrics:
   - assign sync success/failure
   - unassign sync success/failure
   - mismatch cases (`assignment exists` but `vicidial_lead_id` missing)

## Security and ops follow-up
1. Replace broad or IP-fragile DB grants with stable approach:
   - fixed egress IP/VPN or controlled host grants
2. Keep DB user least-privilege:
   - read-only user for list display
   - no write grants for app DB user unless explicitly required
3. Document env split:
   - dialer APIs vs assignment APIs vs read-only DB envs

## Priority
- Priority: High
- Reason: Unassign reliability and data consistency are core workflow requirements.
