-- Inizializzazione database CADCAMFun
-- Questo script viene eseguito automaticamente quando si avvia PostgreSQL per la prima volta

-- Estensioni utili
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema per organizzare le tabelle
CREATE SCHEMA IF NOT EXISTS cadcam;

-- Tabella utenti
CREATE TABLE IF NOT EXISTS cadcam.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    image TEXT,
    password_hash VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella progetti
CREATE TABLE IF NOT EXISTS cadcam.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES cadcam.users(id) ON DELETE CASCADE,
    organization_id UUID,
    is_public BOOLEAN DEFAULT FALSE,
    project_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella sessioni (per autenticazione)
CREATE TABLE IF NOT EXISTS cadcam.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES cadcam.users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella organizzazioni (opzionale)
CREATE TABLE IF NOT EXISTS cadcam.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES cadcam.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_users_email ON cadcam.users(email);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON cadcam.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON cadcam.projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON cadcam.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON cadcam.sessions(token);

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON cadcam.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON cadcam.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON cadcam.organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Dati di esempio (opzionale)
INSERT INTO cadcam.users (name, email, password_hash) VALUES 
('Test User', 'test@cadcam.local', crypt('password123', gen_salt('bf')))
ON CONFLICT (email) DO NOTHING;

-- Grant permessi
GRANT USAGE ON SCHEMA cadcam TO cadcam_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cadcam TO cadcam_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cadcam TO cadcam_user;

-- Messaggio di conferma
DO $$
BEGIN
    RAISE NOTICE 'Database CADCAMFun inizializzato con successo!';
END $$; 