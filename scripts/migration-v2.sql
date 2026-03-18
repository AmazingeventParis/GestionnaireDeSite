-- ============================================================
-- Gestionnaire de Site — Migration V2 SQL
-- Schema: public (tables prefixees site_manager_)
-- Isolation: toutes les tables utilisent le prefixe site_manager_
-- pour ne pas interferer avec les autres projets (lcb_, etc.)
-- ============================================================

-- ============================================================
-- EXISTING TABLES (6)
-- ============================================================

-- 1. Sites web geres
CREATE TABLE IF NOT EXISTS site_manager_sites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'archived')),
    category TEXT DEFAULT 'website',
    favicon_url TEXT,
    screenshot_url TEXT,
    tech_stack JSONB DEFAULT '[]'::jsonb,
    hosting_provider TEXT,
    domain_registrar TEXT,
    ssl_expiry TIMESTAMPTZ,
    domain_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Contacts associes aux sites
CREATE TABLE IF NOT EXISTS site_manager_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID REFERENCES site_manager_sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'owner',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Credentials / acces par site
CREATE TABLE IF NOT EXISTS site_manager_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID REFERENCES site_manager_sites(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    username TEXT,
    password_encrypted TEXT,
    url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Taches / interventions
CREATE TABLE IF NOT EXISTS site_manager_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID REFERENCES site_manager_sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Notes / journal d'activite
CREATE TABLE IF NOT EXISTS site_manager_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID REFERENCES site_manager_sites(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'note' CHECK (type IN ('note', 'incident', 'update', 'billing')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Monitoring / uptime checks
CREATE TABLE IF NOT EXISTS site_manager_monitors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID REFERENCES site_manager_sites(id) ON DELETE CASCADE,
    check_type TEXT DEFAULT 'http' CHECK (check_type IN ('http', 'https', 'ping', 'port')),
    interval_seconds INT DEFAULT 300,
    last_check TIMESTAMPTZ,
    last_status INT,
    last_response_ms INT,
    is_up BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NEW TABLES (8)
-- ============================================================

-- 7. Users
CREATE TABLE IF NOT EXISTS site_manager_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    last_login TIMESTAMPTZ,
    login_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Sessions
CREATE TABLE IF NOT EXISTS site_manager_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES site_manager_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Audit log
CREATE TABLE IF NOT EXISTS site_manager_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES site_manager_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Login attempts
CREATE TABLE IF NOT EXISTS site_manager_login_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    ip_address INET,
    success BOOLEAN NOT NULL DEFAULT false,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. IP bans
CREATE TABLE IF NOT EXISTS site_manager_ip_bans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address INET NOT NULL,
    reason TEXT,
    banned_by UUID REFERENCES site_manager_users(id),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Security events
CREATE TABLE IF NOT EXISTS site_manager_security_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address INET NOT NULL,
    request_method TEXT,
    request_path TEXT,
    request_body TEXT,
    threat_type TEXT NOT NULL CHECK (threat_type IN ('sql_injection', 'xss', 'path_traversal', 'scanner', 'bruteforce', 'rate_limit', 'other')),
    severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    blocked BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Backups
CREATE TABLE IF NOT EXISTS site_manager_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES site_manager_users(id),
    type TEXT NOT NULL CHECK (type IN ('publish', 'manual', 'scheduled')),
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Redirections
CREATE TABLE IF NOT EXISTS site_manager_redirections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    status_code INT NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302)),
    hit_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Scheduled publishes
CREATE TABLE IF NOT EXISTS site_manager_scheduled_publishes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES site_manager_users(id),
    page_slug TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'cancelled', 'failed')),
    snapshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Existing indexes
CREATE INDEX IF NOT EXISTS idx_site_manager_sites_status ON site_manager_sites(status);
CREATE INDEX IF NOT EXISTS idx_site_manager_tasks_site ON site_manager_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_tasks_status ON site_manager_tasks(status);
CREATE INDEX IF NOT EXISTS idx_site_manager_notes_site ON site_manager_notes(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_monitors_site ON site_manager_monitors(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_contacts_site ON site_manager_contacts(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_credentials_site ON site_manager_credentials(site_id);

-- New indexes: sessions
CREATE INDEX IF NOT EXISTS idx_site_manager_sessions_user ON site_manager_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_sessions_token ON site_manager_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_site_manager_sessions_expires ON site_manager_sessions(expires_at);

-- New indexes: audit_log
CREATE INDEX IF NOT EXISTS idx_site_manager_audit_log_user ON site_manager_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_audit_log_action ON site_manager_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_site_manager_audit_log_entity ON site_manager_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_audit_log_created ON site_manager_audit_log(created_at);

-- New indexes: login_attempts
CREATE INDEX IF NOT EXISTS idx_site_manager_login_attempts_email ON site_manager_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_site_manager_login_attempts_ip ON site_manager_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_site_manager_login_attempts_created ON site_manager_login_attempts(created_at);

-- New indexes: ip_bans
CREATE INDEX IF NOT EXISTS idx_site_manager_ip_bans_ip ON site_manager_ip_bans(ip_address);
CREATE INDEX IF NOT EXISTS idx_site_manager_ip_bans_expires ON site_manager_ip_bans(expires_at);

-- New indexes: security_events
CREATE INDEX IF NOT EXISTS idx_site_manager_security_events_ip ON site_manager_security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_site_manager_security_events_threat ON site_manager_security_events(threat_type);
CREATE INDEX IF NOT EXISTS idx_site_manager_security_events_severity ON site_manager_security_events(severity);
CREATE INDEX IF NOT EXISTS idx_site_manager_security_events_created ON site_manager_security_events(created_at);

-- New indexes: redirections
CREATE INDEX IF NOT EXISTS idx_site_manager_redirections_source ON site_manager_redirections(source_path);
CREATE INDEX IF NOT EXISTS idx_site_manager_redirections_active ON site_manager_redirections(is_active);

-- New indexes: scheduled_publishes
CREATE INDEX IF NOT EXISTS idx_site_manager_scheduled_publishes_status ON site_manager_scheduled_publishes(status);
CREATE INDEX IF NOT EXISTS idx_site_manager_scheduled_publishes_scheduled ON site_manager_scheduled_publishes(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_site_manager_scheduled_publishes_user ON site_manager_scheduled_publishes(user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger function for updated_at automatique
CREATE OR REPLACE FUNCTION site_manager_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER site_manager_sites_updated
        BEFORE UPDATE ON site_manager_sites
        FOR EACH ROW EXECUTE FUNCTION site_manager_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER site_manager_tasks_updated
        BEFORE UPDATE ON site_manager_tasks
        FOR EACH ROW EXECUTE FUNCTION site_manager_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER site_manager_credentials_updated
        BEFORE UPDATE ON site_manager_credentials
        FOR EACH ROW EXECUTE FUNCTION site_manager_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER site_manager_users_updated
        BEFORE UPDATE ON site_manager_users
        FOR EACH ROW EXECUTE FUNCTION site_manager_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
