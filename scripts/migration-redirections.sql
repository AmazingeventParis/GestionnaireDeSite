-- Redirections table for URL management and WordPress migration
-- Run this migration against your Supabase PostgreSQL database

CREATE TABLE IF NOT EXISTS site_manager_redirections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_by UUID REFERENCES site_manager_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on source_path to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_redirections_source ON site_manager_redirections(source_path);

-- Index for active redirections lookup (used by middleware)
CREATE INDEX IF NOT EXISTS idx_redirections_active ON site_manager_redirections(is_active) WHERE is_active = true;

-- RLS policies
ALTER TABLE site_manager_redirections ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on redirections"
  ON site_manager_redirections
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE site_manager_redirections IS 'URL redirections for WordPress migration and SEO management';
