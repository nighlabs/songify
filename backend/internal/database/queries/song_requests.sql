-- name: CreateSongRequest :one
INSERT INTO song_requests (session_id, spotify_track_id, track_name, artist_names, album_name, album_art_url, duration_ms, spotify_uri)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetSongRequestByID :one
SELECT * FROM song_requests WHERE id = ?;

-- name: GetSongRequestsBySessionID :many
SELECT * FROM song_requests WHERE session_id = ? ORDER BY requested_at DESC;

-- name: GetPendingSongRequests :many
SELECT * FROM song_requests WHERE session_id = ? AND status = 'pending' ORDER BY requested_at ASC;

-- name: ApproveSongRequest :exec
UPDATE song_requests SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: RejectSongRequest :exec
UPDATE song_requests SET status = 'rejected', processed_at = CURRENT_TIMESTAMP, rejection_reason = ? WHERE id = ?;

-- name: IsDuplicateRequest :one
SELECT EXISTS(
    SELECT 1 FROM song_requests
    WHERE session_id = ? AND spotify_track_id = ? AND status != 'rejected'
) AS is_duplicate;

-- name: DeleteSongRequest :exec
DELETE FROM song_requests WHERE id = ?;
