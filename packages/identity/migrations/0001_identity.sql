PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER
) STRICT;

CREATE TABLE auth_methods (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'email'),
  subject TEXT NOT NULL,
  UNIQUE(provider, subject)
) STRICT;

CREATE INDEX auth_methods_account_idx ON auth_methods(account_id);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  rotated_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX refresh_tokens_account_idx ON refresh_tokens(account_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens(family_id);

CREATE TABLE device_codes (
  device_code_hash TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  last_poll_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX device_codes_expiry_idx ON device_codes(expires_at);

CREATE TABLE signing_keys (
  kid TEXT PRIMARY KEY,
  alg TEXT NOT NULL CHECK (alg = 'ES256'),
  private_jwk TEXT NOT NULL,
  public_jwk TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retired_at INTEGER
) STRICT;

CREATE INDEX signing_keys_active_idx ON signing_keys(retired_at, created_at DESC);
