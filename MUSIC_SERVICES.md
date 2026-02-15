# Music Services Architecture

Songify supports multiple music services. Each session is tied to a single service (Spotify or YouTube), chosen at creation time.

---

# Spotify Integration

Songify uses two separate Spotify API integrations with distinct permission domains. This separation ensures that playlist management remains under the admin's control while allowing the backend to handle search functionality independently.

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Spotify API                                  │
└─────────────────────────────────────────────────────────────────────┘
          ▲                                        ▲
          │                                        │
          │ Client Credentials                     │ OAuth PKCE
          │ (App-level access)                     │ (User-level access)
          │                                        │
┌─────────┴─────────┐                    ┌────────┴────────┐
│      Backend      │                    │  Admin Browser  │
│                   │                    │                 │
│  • Search tracks  │                    │  • Read playlists│
│                   │                    │  • Create playlists│
│                   │                    │  • Add tracks   │
└───────────────────┘                    └─────────────────┘
```

## Backend: Client Credentials Flow

**Purpose:** Spotify track search for all users (admins and friends)

**Authentication:** Client Credentials grant type
- Uses `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` environment variables
- Authenticates as the application, not as a user
- Token is managed server-side and refreshed automatically

**Permissions:** None required (public endpoints only)
- Search is a public endpoint that doesn't require user authorization
- No access to any user's private data or playlists

**Implementation:** `backend/internal/services/spotify.go`

```go
// Backend obtains an app-level token
token, _ := conf.Token(ctx)  // Client Credentials flow

// Search uses this token - works for any user's search query
results, _ := spotify.Search(ctx, query, spotify.SearchTypeTrack)
```

**Security benefits:**
- Spotify credentials never exposed to the browser
- Rate limiting handled centrally
- No user consent required for search functionality

## Frontend: OAuth PKCE Flow

**Purpose:** Playlist management for session admins only

**Authentication:** Authorization Code with PKCE
- Uses only `SPOTIFY_CLIENT_ID` (no secret in browser)
- Admin authorizes via Spotify login
- Token stored in browser's localStorage
- Managed by `@spotify/web-api-ts-sdk`

**Permissions (OAuth Scopes):**
- `playlist-read-private` - List admin's playlists
- `playlist-read-collaborative` - Include collaborative playlists
- `playlist-modify-public` - Add tracks to public playlists
- `playlist-modify-private` - Add tracks to private playlists

**Implementation:** `frontend/src/services/spotify.ts`

```typescript
// Admin initiates OAuth flow
SpotifyApi.withUserAuthorization(clientId, redirectUri, SCOPES)

// After authorization, SDK handles token storage
await api.authenticate()

// Playlist operations use admin's token
await api.playlists.addItemsToPlaylist(playlistId, [trackUri])
```

**Security benefits:**
- Playlist access is scoped to the admin's Spotify account
- Backend never sees the admin's Spotify token
- Token stays in admin's browser only
- Friends cannot access playlist operations

## Authentication Flows

### Search Flow (All Users)

```
User                    Frontend                Backend                 Spotify
  │                        │                       │                       │
  │  Search "song name"    │                       │                       │
  │───────────────────────>│                       │                       │
  │                        │  GET /api/spotify/search?q=...               │
  │                        │──────────────────────>│                       │
  │                        │                       │  Search (app token)   │
  │                        │                       │──────────────────────>│
  │                        │                       │<──────────────────────│
  │                        │<──────────────────────│                       │
  │  Display results       │                       │                       │
  │<───────────────────────│                       │                       │
```

### Playlist Link Flow (Admin Only)

```
Admin                   Frontend                                    Spotify
  │                        │                                           │
  │  Click "Connect"       │                                           │
  │───────────────────────>│                                           │
  │                        │  Redirect to Spotify OAuth                │
  │                        │──────────────────────────────────────────>│
  │                        │                                           │
  │                        │  User authorizes, redirect to /callback   │
  │                        │<──────────────────────────────────────────│
  │                        │                                           │
  │                        │  Exchange code for token (PKCE)           │
  │                        │──────────────────────────────────────────>│
  │                        │<──────────────────────────────────────────│
  │                        │                                           │
  │  Select playlist       │                                           │
  │───────────────────────>│                                           │
  │                        │  Get playlists (user token)               │
  │                        │──────────────────────────────────────────>│
  │                        │<──────────────────────────────────────────│
  │  Display playlists     │                                           │
  │<───────────────────────│                                           │
```

### Song Approval Flow (Admin Only)

```
Admin                   Frontend                Backend                 Spotify
  │                        │                       │                       │
  │  Approve song          │                       │                       │
  │───────────────────────>│                       │                       │
  │                        │  Add to playlist (user token)                │
  │                        │────────────────────────────────────────────>│
  │                        │<────────────────────────────────────────────│
  │                        │                       │                       │
  │                        │  PUT /api/.../approve │                       │
  │                        │──────────────────────>│                       │
  │                        │                       │  Mark approved in DB  │
  │                        │<──────────────────────│                       │
  │  Show success          │                       │                       │
  │<───────────────────────│                       │                       │
```

## Token Persistence

### Backend Token
- Managed in memory by the Spotify client
- Auto-refreshed before expiration
- Lost on server restart (re-obtained automatically)

### Frontend Token
- Stored in localStorage: `spotify-sdk:AuthorizationCodeWithPKCEStrategy:token`
- Persists across page refreshes
- Validated on page load by fetching the linked playlist
- Cleared on logout or when token expires

## Configuration

### Environment Variables (Backend)

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

### Spotify App Settings

Configure your Spotify Developer App with:
- **Redirect URI:** `https://your-domain.com/callback`
- **APIs used:** Web API

## Why Two Integrations?

1. **Separation of concerns:** Search is a shared feature; playlist management is admin-only
2. **Security:** Backend credentials never exposed; admin tokens never leave their browser
3. **User consent:** Only admins need to authorize; friends just search and request
4. **Simplicity:** Friends don't need Spotify accounts to participate

---

# YouTube Integration

YouTube sessions use the YouTube Data API v3 for video search. This is simpler than Spotify since it only requires an API key (no OAuth flow).

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      YouTube Data API v3                              │
└─────────────────────────────────────────────────────────────────────┘
          ▲
          │
          │ API Key
          │ (Server-side only)
          │
┌─────────┴─────────┐
│      Backend      │
│                   │
│  • Search videos  │
│                   │
└───────────────────┘
```

## Backend: API Key Authentication

**Purpose:** YouTube video search for all users (admins and friends)

**Authentication:** API key
- Uses `YOUTUBE_API_KEY` environment variable
- No OAuth flow needed — simpler than Spotify
- No token refresh or expiration to manage

**Permissions:** Public data only
- Search is a public endpoint
- No access to any user's private data

**Implementation:** `backend/internal/services/youtube.go`

## Search Flow (All Users)

```
User                    Frontend                Backend                 YouTube
  │                        │                       │                       │
  │  Search "video name"   │                       │                       │
  │───────────────────────>│                       │                       │
  │                        │  GET /api/youtube/search?q=...                │
  │                        │──────────────────────>│                       │
  │                        │                       │  Search (API key)     │
  │                        │                       │──────────────────────>│
  │                        │                       │<──────────────────────│
  │                        │<──────────────────────│                       │
  │  Display results       │                       │                       │
  │<───────────────────────│                       │                       │
```

## Approval Flow

Unlike Spotify sessions, YouTube sessions have no playlist integration. When an admin approves a request, it is simply marked as approved in the database.

```
Admin                   Frontend                Backend
  │                        │                       │
  │  Approve video         │                       │
  │───────────────────────>│                       │
  │                        │  PUT /api/.../approve │
  │                        │──────────────────────>│
  │                        │                       │  Mark approved in DB
  │                        │<──────────────────────│
  │  Show success          │                       │
  │<───────────────────────│                       │
```

## Configuration

### Environment Variables (Backend)

```bash
YOUTUBE_API_KEY=your_api_key
```

### Quota

The YouTube Data API v3 has a default quota of 10,000 units per day. Each search request costs 100 units, allowing approximately 100 searches per day. If you need more, request a quota increase in the Google Cloud Console.
