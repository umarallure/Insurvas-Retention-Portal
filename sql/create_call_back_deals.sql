-- Call Back Deals feature
-- Stores CRM leads synced into the Retention Portal for callback handling,
-- and a per-callback verification checklist mirroring verification_items.

create table if not exists public.call_back_deals (
  id uuid primary key default gen_random_uuid(),
  name text null,
  phone_number text null,
  submission_id text not null,
  stage_id integer null,
  stage text null,
  call_center text null,
  crm_lead_id uuid null,
  assigned boolean not null default false,
  is_active boolean not null default true,
  assigned_to_profile_id uuid null references public.profiles(id) on delete set null,
  assigned_at timestamptz null,
  assigned_by_profile_id uuid null references public.profiles(id) on delete set null,
  tcpa_flag boolean not null default false,
  tcpa_checked_at timestamptz null,
  tcpa_message text null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_back_deals_submission_id_key unique (submission_id)
);

create index if not exists call_back_deals_is_active_idx
  on public.call_back_deals (is_active);

create index if not exists call_back_deals_assigned_to_idx
  on public.call_back_deals (assigned_to_profile_id)
  where assigned_to_profile_id is not null;

create index if not exists call_back_deals_stage_id_idx
  on public.call_back_deals (stage_id);

create index if not exists call_back_deals_submission_id_idx
  on public.call_back_deals (submission_id);

-- updated_at trigger
create or replace function public.call_back_deals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_call_back_deals_set_updated_at on public.call_back_deals;
create trigger trg_call_back_deals_set_updated_at
  before update on public.call_back_deals
  for each row
  execute function public.call_back_deals_set_updated_at();

alter table public.call_back_deals enable row level security;


-- Per-callback-deal verification items. Isolated from the existing
-- verification_items table so assign-lead workflows remain untouched.
create table if not exists public.call_back_deal_verification_items (
  id uuid primary key default gen_random_uuid(),
  call_back_deal_id uuid not null references public.call_back_deals(id) on delete cascade,
  field_name text not null,
  original_value text null,
  verified_value text null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_back_deal_verification_items_field_unique unique (call_back_deal_id, field_name)
);

create index if not exists call_back_deal_verification_items_deal_idx
  on public.call_back_deal_verification_items (call_back_deal_id);

create or replace function public.call_back_deal_verification_items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cbd_verification_items_set_updated_at on public.call_back_deal_verification_items;
create trigger trg_cbd_verification_items_set_updated_at
  before update on public.call_back_deal_verification_items
  for each row
  execute function public.call_back_deal_verification_items_set_updated_at();

alter table public.call_back_deal_verification_items enable row level security;
