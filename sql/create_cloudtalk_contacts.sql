create table if not exists public.cloudtalk_contacts (
  contact_id text primary key,
  deal_id bigint null references public.monday_com_deals(id) on delete cascade,
  lead_id uuid null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cloudtalk_contacts_target_check check (deal_id is not null or lead_id is not null)
);

create index if not exists cloudtalk_contacts_deal_id_idx
  on public.cloudtalk_contacts (deal_id)
  where deal_id is not null;

create index if not exists cloudtalk_contacts_lead_id_idx
  on public.cloudtalk_contacts (lead_id)
  where lead_id is not null;

alter table public.cloudtalk_contacts enable row level security;
