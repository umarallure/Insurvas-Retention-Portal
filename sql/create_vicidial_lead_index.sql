-- Stores fast lookup keys for VICIdial lead cleanup during unassign operations.
create table if not exists public.vicidial_lead_index (
  id bigserial primary key,
  assignment_id text,
  deal_id text,
  phone_number text,
  list_id text,
  agent_profile_id text,
  vendor_lead_code text,
  vicidial_lead_id bigint not null,
  composite_key text not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists vicidial_lead_index_assignment_uidx
  on public.vicidial_lead_index (assignment_id)
  where assignment_id is not null and assignment_id <> '';

create unique index if not exists vicidial_lead_index_lead_uidx
  on public.vicidial_lead_index (vicidial_lead_id);

create unique index if not exists vicidial_lead_index_composite_uidx
  on public.vicidial_lead_index (composite_key)
  where composite_key <> '|||';

create index if not exists vicidial_lead_index_updated_idx
  on public.vicidial_lead_index (updated_at desc);

alter table public.vicidial_lead_index enable row level security;
