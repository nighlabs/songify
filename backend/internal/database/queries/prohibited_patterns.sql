-- name: CreateProhibitedPattern :one
INSERT INTO prohibited_patterns (session_id, pattern_type, pattern)
VALUES (?, ?, ?)
RETURNING *;

-- name: GetProhibitedPatternsBySessionID :many
SELECT * FROM prohibited_patterns WHERE session_id = ?;

-- name: DeleteProhibitedPattern :exec
DELETE FROM prohibited_patterns WHERE id = ?;

-- name: DeleteProhibitedPatternsBySessionID :exec
DELETE FROM prohibited_patterns WHERE session_id = ?;
