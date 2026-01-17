CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    admin_name TEXT NOT NULL,
    admin_password_hash TEXT NOT NULL,
    friend_access_key TEXT NOT NULL UNIQUE,
    spotify_playlist_id TEXT,
    song_duration_limit_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prohibited_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('title', 'artist')),
    pattern TEXT NOT NULL
);

CREATE TABLE song_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    spotify_track_id TEXT NOT NULL,
    track_name TEXT NOT NULL,
    artist_names TEXT NOT NULL,
    album_name TEXT NOT NULL,
    album_art_url TEXT,
    duration_ms INTEGER NOT NULL,
    spotify_uri TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    rejection_reason TEXT
);

CREATE INDEX idx_sessions_friend_access_key ON sessions(friend_access_key);
CREATE INDEX idx_song_requests_session_id ON song_requests(session_id);
CREATE INDEX idx_song_requests_status ON song_requests(status);
CREATE INDEX idx_prohibited_patterns_session_id ON prohibited_patterns(session_id);
