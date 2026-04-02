-- ============================================================
-- Gestionnaire de Site — Migration SQL
-- Schema: public (tables prefixees site_manager_)
-- Isolation: toutes les tables utilisent le prefixe site_manager_
-- pour ne pas interferer avec les autres projets (lcb_, etc.)
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

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_site_manager_sites_status ON site_manager_sites(status);
CREATE INDEX IF NOT EXISTS idx_site_manager_tasks_site ON site_manager_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_tasks_status ON site_manager_tasks(status);
CREATE INDEX IF NOT EXISTS idx_site_manager_notes_site ON site_manager_notes(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_monitors_site ON site_manager_monitors(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_contacts_site ON site_manager_contacts(site_id);
CREATE INDEX IF NOT EXISTS idx_site_manager_credentials_site ON site_manager_credentials(site_id);

-- RLS (Row Level Security) - desactive par defaut pour usage interne admin
-- Activer si besoin d'acces multi-utilisateurs
-- ALTER TABLE site_manager_sites ENABLE ROW LEVEL SECURITY;

-- Trigger pour updated_at automatique
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
