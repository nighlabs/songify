-- name: CreateSession :one
INSERT INTO sessions (id, display_name, admin_name, admin_password_hash, friend_access_key, spotify_playlist_id, song_duration_limit_ms)
VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetSessionByID :one
SELECT * FROM sessions WHERE id = ?;

-- name: GetSessionByFriendKey :one
SELECT * FROM sessions WHERE friend_access_key = ?;

-- name: GetSessionByAdminCredentials :one
SELECT * FROM sessions WHERE admin_name = ? AND admin_password_hash = ?;

-- name: UpdateSessionPlaylist :exec
UPDATE sessions SET spotify_playlist_id = ?, spotify_playlist_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: UpdateSessionSettings :exec
UPDATE sessions SET song_duration_limit_ms = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = ?;

-- name: FriendKeyExists :one
SELECT EXISTS(SELECT 1 FROM sessions WHERE friend_access_key = ?) AS exists_flag;
