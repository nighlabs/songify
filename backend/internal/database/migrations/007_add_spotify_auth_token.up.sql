ALTER TABLE sessions ADD COLUMN spotify_auth_persist_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN spotify_auth_token_encrypted TEXT;
