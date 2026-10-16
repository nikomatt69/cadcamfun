CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  user_handle TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
) STRICT;
CREATE INDEX passkeys_account_idx ON passkeys(account_id);
