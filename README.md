# Retention Portal - Full Platform Technical Guide

This document explains how the platform works end-to-end: user flows, manager flows, agent flows, call flow, API flow, and table-level data lineage.

## 1) What This Platform Is

Retention Portal is a role-based operations platform for insurance retention teams.

- Managers monitor and assign active retention deals
- Agents work assigned deals and complete policy workflows
- The app syncs Monday.com deal data into Supabase
- CloudTalk is used for dialer/contact routing
- Verification and retention actions are persisted to Supabase

Core stack:

- Next.js pages router (`src/pages`)
- Supabase (auth + Postgres)
- Tailwind + Radix UI
- CloudTalk REST APIs

## 2) High-Level Architecture

Main systems:

1. Frontend app (Next.js pages):
   - Role-gated navigation and screens for manager/agent
2. API routes (server side in Next.js):
   - Monday webhook ingestion
   - Verification session/item initializer
   - CloudTalk contact + call proxy
3. Supabase:
   - Source of app state for leads/deals/assignments/workflow history
4. External systems:
   - Monday.com (deal source)
   - CloudTalk (calling + campaign queue)

## 3) Auth, Roles, and Route Access

Auth/session checks happen in `_app.tsx`:

- Non-login routes require a Supabase session
- No session => redirect `/login`

Role and access checks happen in `src/components/access-context.tsx`:

- Looks up user profile in `profiles` via `user_id`
- Checks active role rows in:
  - `retention_agents`
  - `retention_managers`
- Route policy:
  - `/manager/*` manager only
  - `/agent/*` agent only
  - `/customers` manager only
  - `/settings`, `/inbox` both
  - `/` shows manager dashboard for managers, agent dashboard for agents
- `/landing` redirects by role:
  - manager -> `/customers`
  - agent -> `/`

## 4) Primary Route Map and Purpose

Shared:

- `/login` auth entry
- `/` role-based dashboard
- `/settings/*`, `/inbox` shared utility pages

Manager:

- `/customers` kanban by retention categories
- `/customers/[id]` deal detail page
- `/manager/assign-lead` single and bulk assignment operations
- `/manager/retention-daily-deal-flow` table view over `retention_deal_flow`
- `/manager/fixed-policies` fixed/handled/rejected policy management
- `/manager/agent-report-card` placeholder
- `/manager/lead-email-ghl-notes` placeholder
- `/manager/usermanagnent` placeholder

Agent:

- `/agent/assigned-leads` active + handled lead list with filters
- `/agent/assigned-lead-details` deep workflow + verification workspace
- `/agent/dialer` CloudTalk iframe and queue view
- `/agent/retention-workflow` legacy workflow page

## 5) Manager Flows

### 5.1 Customer Queue (Kanban)

Route: `/customers` via `DealsKanbanView`.

Data source:

- `monday_com_deals` where `is_active = true`

Grouping logic:

- Failed Payment
- Pending Lapse
- Pending Manual Action
- Chargeback

Filters/search:

- GHL stage mappings from `src/lib/monday-deal-category-tags.ts`
- search on policy number, phone, deal name, ghl name

### 5.2 Assign Lead (Single)

Route: `/manager/assign-lead`.

Main write table:

- `retention_assigned_leads`

Behavior:

1. Manager selects agent + deal
2. Insert/update active assignment row in `retention_assigned_leads`
3. After assignment, call `/api/cloudtalk/contact/add` (non-blocking)
4. CloudTalk contact gets agent tag and optional external URL to lead details

Unassign:

- Sets assignment inactive/deletes (depending on action path) from `retention_assigned_leads`

### 5.3 Assign Lead (Bulk)

Component: `src/components/manager/assign-lead/bulk-assign-modal.tsx`.

Flow:

1. Manager selects carriers + one/more GHL stages
2. System fetches unassigned active deals from `monday_com_deals`
3. Allocation plan computed by percentage or even distribution
4. Duplicate policy handling:
   - same client (phone/name key) is winner-assigned consistently
5. Batch insert assignments into `retention_assigned_leads`
6. Fire-and-forget CloudTalk contact creation per assigned deal

### 5.4 Retention Daily Deal Flow Admin View

Route: `/manager/retention-daily-deal-flow`.

Source:

- `retention_deal_flow`

Capabilities:

- search, paging, and filter by agent/status/carrier
- manager review of retention workflow outcomes

### 5.5 Fixed Policies Admin Flow

Route: `/manager/fixed-policies`.

Sources:

- `fixed_policies_tracking`
- `retention_deal_flow`
- `monday_com_deals`

Modes:

- handled
- fixed
- rejected

Key logic:

- draft date status (business-day aware, Eastern time)
- needs-confirmation flag after 2+ business days past draft date

## 6) Agent Flows

### 6.1 Assigned Leads Queue

Route: `/agent/assigned-leads`.

Reads:

- current user profile from `profiles`
- assignments from `retention_assigned_leads` (`status=active` or handled tab behavior)
- deal metadata from `monday_com_deals`
- lead metadata from `leads` (fallback/enrichment)

Special rule:

- After-hours hide rule (`src/lib/agent/after-hours-filter.ts`)
- Hidden when:
  - NY time between 5 PM and 9 AM
  - carrier is Aetna/RNA/Transamerica
  - category is Failed Payment or Pending Lapse

### 6.2 Assigned Lead Details Workspace

Route: `/agent/assigned-lead-details?dealId=...`.

This is the main agent work screen.

Capabilities:

- loads selected deal + related deals for same customer
- loads personal lead record(s), dedupes/merges missing fields
- enforces assignment authorization checks
- supports previous/next navigation across assigned queue
- policy-card based multi-policy handling
- verification panel data autofill and editing
- activity timeline and data-quality panels
- opens workflow components:
  - fixed payment
  - carrier requirements
  - new sale

### 6.3 Verification Session/Items Flow

Client entry point:

- `useAssignedLeadDetails` posts to `/api/verification-items`

API flow:

1. Auth token validated via Supabase admin `auth.getUser(token)`
2. If lead is missing but deal is provided, create/reuse a shadow lead row in `leads`
3. Create/load session using RPC:
   - `retention_get_or_create_verification_session`
4. Initialize item rows via RPC:
   - `retention_initialize_verification_items`
5. Upsert/fill `retention_verification_items`
6. Return session + items for UI

Agent changes:

- checkbox/value edits update `retention_verification_items` directly

### 6.4 Retention Workflow Submission

In workflow components/pages, agent actions write to:

- `call_results`
- `call_update_logs`
- `retention_deal_flow`
- `monday_com_deals` (status/disposition related updates)
- `leads` (when lead-level data is edited/merged)

Assignment closure behavior:

- on handled completion, assignment row in `retention_assigned_leads` is updated to `handled`

### 6.5 Agent Dialer

Route: `/agent/dialer`.

Features:

- shows active assignment queue from `retention_assigned_leads` + `monday_com_deals`
- embeds CloudTalk phone iframe via partner URL
- supports manual refresh/session toggles in UI

## 7) CloudTalk Integration

### 7.1 Contact Creation on Assignment

Endpoint:

- `POST /api/cloudtalk/contact/add`

Uses:

- `src/lib/cloudtalk/contact.ts`

Behavior:

- normalizes phone
- parses name
- maps agent profile -> CloudTalk tag/campaign config
- creates CloudTalk contact
- optionally attaches external URL:
  - `/agent/assigned-lead-details?dealId=...` on production domain

Notes:

- Current mapping defaults all agents to a single hardcoded config (documented TODO in code)
- Failures are non-blocking for assignment flow

### 7.2 Call Creation Proxy

Endpoint:

- `POST /api/cloudtalk/call/create`

Behavior:

- basic-auth call to CloudTalk create call API
- used by `useCloudTalk` hook

### 7.3 Webhook Endpoint

Endpoint:

- `POST /api/cloudtalk/webhook/contact`

Behavior:

- accepts contact phone from CloudTalk event
- attempts match in `monday_com_deals` and `leads`
- currently used mainly for logging/matching context
- client webhook polling hook is intentionally disabled

## 8) Monday.com Integration

Endpoint:

- `POST /api/monday-webhook`

Flow:

1. Monday sends webhook with `pulseId`
2. Server fetches full item from Monday GraphQL API
3. Extracts column values into canonical fields
4. Upserts into `monday_com_deals` by `monday_item_id`

Important:

- This is the primary ingestion path for active deal metadata
- `is_active` behavior is expected to be managed by DB trigger/rules

## 9) Background Worker (Optional / Legacy Queue Path)

File:

- `worker.ts`

Flow:

- BRPOP from Redis `sync:queue`
- fetch Monday item
- upsert into `leads` (not `monday_com_deals`)

Notes:

- webhook path currently processes directly without Redis queue
- worker is useful only if queue-based ingestion is re-enabled
- requires `REDIS_URL`

## 10) Data Model and Data Lineage

Main tables referenced in code:

- `profiles`
- `retention_agents`
- `retention_managers`
- `monday_com_deals`
- `leads`
- `retention_assigned_leads`
- `retention_deal_flow`
- `fixed_policies_tracking`
- `retention_verification_sessions`
- `retention_verification_items`
- `call_results`
- `call_update_logs`
- `daily_deal_flow`
- `disposition_history`
- plus lookup/analytics tables (`carriers`, `centers`, `verification_sessions`)

### 10.1 Source-of-Truth Summary

- Monday deal record of policy/deal state:
  - `monday_com_deals` (fed by Monday webhook)
- Lead/person-level enrichment:
  - `leads` (manual/merged/shadow)
- Assignment ownership:
  - `retention_assigned_leads`
- Agent retention work outcomes:
  - `retention_deal_flow`
- Fixed policy audit:
  - `fixed_policies_tracking`
- Verification checklist:
  - `retention_verification_sessions`, `retention_verification_items`
- Call and action logging:
  - `call_results`, `call_update_logs`, `disposition_history`

### 10.2 End-to-End Data Flow

1. Monday item changes
2. `/api/monday-webhook` extracts and upserts to `monday_com_deals`
3. Manager sees active deals and assigns in `/manager/assign-lead`
4. Assignment row written to `retention_assigned_leads`
5. CloudTalk contact created for dialer routing
6. Agent opens assigned deal workspace
7. Verification session/items initialized and edited
8. Agent runs workflow and submits outcome
9. Writes to `retention_deal_flow` + call logs + relevant tables
10. If fixed flow, record/update in `fixed_policies_tracking`
11. Manager reviews handled/fixed/rejected queues

## 11) API Endpoints

- `POST /api/monday-webhook`
  - Monday challenge + event handling
  - upserts `monday_com_deals`
- `POST /api/verification-items`
  - auth required via Bearer token
  - creates/loads verification session and items
- `POST /api/cloudtalk/contact/add`
  - creates CloudTalk contact/tag assignment
- `POST /api/cloudtalk/call/create`
  - creates outbound CloudTalk call
- `POST /api/cloudtalk/webhook/contact`
  - receives call event payload and resolves lead/deal by phone

## 12) Environment Variables

Required for app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (API routes using admin client)

Monday:

- `MONDAY_API_KEY`

CloudTalk:

- `NEXT_PUBLIC_CLOUDTALK_ACCOUNT_ID`
- `NEXT_PUBLIC_CLOUDTALK_API_SECRET`
- `NEXT_PUBLIC_CLOUDTALK_AGENT_ID` (optional default)
- `NEXT_PUBLIC_CLOUDTALK_PARTNER_NAME` (iframe partner)

Worker/Redis:

- `REDIS_URL` (if running `npm run worker`)

## 13) Local Runbook

Install and run:

```bash
npm install
npm run dev
```

Optional worker:

```bash
npm run worker
```

## 14) Operational Notes and Known Gaps

- CloudTalk agent mapping is currently hardcoded/defaulted in `src/lib/cloudtalk/contact.ts`.
- Some manager pages are placeholders (report card, user management, lead notes).
- Webhook polling hook for CloudTalk is intentionally disabled.
- Secrets are currently read from `NEXT_PUBLIC_*` names for CloudTalk in server routes; production hardening should migrate sensitive server-only values to non-public env names.

## 15) Key Files to Read First

- App boot/auth/access:
  - `src/pages/_app.tsx`
  - `src/components/access-context.tsx`
- Manager assignment:
  - `src/pages/manager/assign-lead/index.tsx`
  - `src/components/manager/assign-lead/bulk-assign-modal.tsx`
- Agent workbench:
  - `src/pages/agent/assigned-lead-details/index.tsx`
  - `src/lib/agent/assigned-lead-details.logic.ts`
- Integrations:
  - `src/pages/api/monday-webhook/index.ts`
  - `src/pages/api/verification-items/index.ts`
  - `src/lib/cloudtalk/contact.ts`
  - `src/pages/api/cloudtalk/*`
- Policy handling:
  - `src/pages/manager/fixed-policies/index.tsx`
  - `src/lib/fixed-policies/*`
