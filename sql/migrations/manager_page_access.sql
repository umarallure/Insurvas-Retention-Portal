-- Create manager_page_access table for per-page permissions
CREATE TABLE IF NOT EXISTS public.manager_page_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  page_path text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT manager_page_access_pkey PRIMARY KEY (id),
  CONSTRAINT manager_page_access_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.retention_managers(id) ON DELETE CASCADE,
  CONSTRAINT manager_page_access_unique UNIQUE (manager_id, page_path)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_manager_page_access_manager_id ON public.manager_page_access USING btree (manager_id);

-- =================================================================
-- STEP 1: Find the user's retention_managers ID
-- Run this query to find the manager ID for user d7179ea9-f56c-40b3-8d34-6c11c3834eab
-- =================================================================
-- SELECT rm.id, rm.profile_id, p.user_id
-- FROM retention_managers rm
-- JOIN profiles p ON p.id = rm.profile_id
-- WHERE p.user_id = 'd7179ea9-f56c-40b3-8d34-6c11c3834eab';

-- =================================================================
-- STEP 2: Insert page access for the user
-- Replace 'MANAGER_ID_HERE' with the actual retention_managers.id from Step 1
-- =================================================================
-- INSERT INTO public.manager_page_access (manager_id, page_path) VALUES
--   ('MANAGER_ID_HERE', '/manager/retention-daily-deal-flow'),
--   ('MANAGER_ID_HERE', '/manager/call-back-deals'),
--   ('MANAGER_ID_HERE', '/manager/fixed-policies'),
--   ('MANAGER_ID_HERE', '/manager/agent-report-card'),
--   ('MANAGER_ID_HERE', '/manager/assign-lead');

-- =================================================================
-- EXAMPLE: If the user's retention_managers.id is 'abc123-def456-...'
-- =================================================================
-- INSERT INTO public.manager_page_access (manager_id, page_path) VALUES
--   ('abc123-def456-...', '/manager/retention-daily-deal-flow'),
--   ('abc123-def456-...', '/manager/call-back-deals'),
--   ('abc123-def456-...', '/manager/fixed-policies'),
--   ('abc123-def456-...', '/manager/agent-report-card'),
--   ('abc123-def456-...', '/manager/assign-lead');

-- =================================================================
-- To verify the setup, run:
-- =================================================================
-- SELECT p.user_id, mpa.page_path
-- FROM manager_page_access mpa
-- JOIN retention_managers rm ON rm.id = mpa.manager_id
-- JOIN profiles p ON p.id = rm.profile_id
-- WHERE p.user_id = 'd7179ea9-f56c-40b3-8d34-6c11c3834eab';
