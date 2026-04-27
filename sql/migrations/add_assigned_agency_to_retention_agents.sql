-- Add assigned_agency column to retention_agents
ALTER TABLE public.retention_agents
ADD COLUMN IF NOT EXISTS assigned_agency TEXT NULL;
