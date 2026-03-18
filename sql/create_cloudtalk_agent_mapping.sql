create table if not exists public.cloudtalk_agent_mapping (
  retention_id uuid primary key references public.profiles(id) on delete cascade,
  campaign_id text not null,
  agent_id text not null,
  tag_name text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cloudtalk_agent_mapping_active_idx
  on public.cloudtalk_agent_mapping (is_active)
  where is_active = true;

alter table public.cloudtalk_agent_mapping enable row level security;

insert into public.cloudtalk_agent_mapping (
  retention_id,
  campaign_id,
  agent_id,
  tag_name,
  is_active
)
values
  (
    '1cda9534-ffb8-466b-bfaa-85b372cf7c01',
    '305900',
    '546134',
    'hussain-tag',
    true
  ),
  (
    '5f5a7aa1-32b0-42e3-aee8-15e95ff79b72',
    '305906',
    '546136',
    'ahmed-tag',
    true
  ),
  (
    '61d6864f-38e8-4ac7-967c-bc92573d1dc3',
    '305908',
    '546138',
    'vele-tag',
    true
  ),
  (
    '84e39d87-aef7-48e6-a92f-0b4761c3d17d',
    '305910',
    '546140',
    'suela-tag',
    true
  ),
  (
    '9c614e9f-d829-46ad-91ca-38691b1c8919',
    '305909',
    '546139',
    'rinor-tag',
    true
  ),
  (
    'b772a62d-918b-4153-98bc-c138889c2532',
    '305905',
    '546135',
    'justine-tag',
    true
  ),
  (
    'd8bca144-dadd-400e-8c30-26634f918a54',
    '305907',
    '546137',
    'vesa-tag',
    true
  )
on conflict (retention_id) do update
set
  campaign_id = excluded.campaign_id,
  agent_id = excluded.agent_id,
  tag_name = excluded.tag_name,
  is_active = excluded.is_active,
  updated_at = now();
