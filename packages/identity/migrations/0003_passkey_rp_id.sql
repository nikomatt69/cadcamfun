-- The WebAuthn RP ID a passkey was registered under. NULL for every passkey
-- saved before this column existed, which is to say under the issuer host from
-- before the move to cadcam.fun (LEGACY_ISSUER_HOSTS in src/constants.ts).
ALTER TABLE passkeys ADD COLUMN rp_id TEXT;
