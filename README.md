# Songify

A collaborative playlist request app where friends can search for songs and submit requests, while the playlist admin approves or rejects them before adding to a Spotify playlist.

## Features

- **Easy Access**: Friends join with memorable keys like `happy-tiger-42`
- **Song Search**: Search Spotify's catalog without needing a Spotify account
- **Request Queue**: See pending, approved, and rejected requests in real-time
- **Admin Controls**: Approve or reject requests with one click
- **Spotify Integration**: Approved songs are automatically added to your playlist
- **Secure**: Passwords are hashed client-side; the server never sees plaintext

## Tech Stack

**Backend**
- Go with Chi router
- SQLite with sqlc for type-safe queries
- JWT authentication
- Spotify Client Credentials flow for search

**Frontend**
- React 19 + TypeScript
- Vite
- TanStack Query for server state
- Zustand for client state
- shadcn/ui components
- Spotify PKCE flow for playlist management

## Getting Started

### Prerequisites

**For Docker deployment:**
- Docker and Docker Compose

**For local development:**
- Go 1.21+
- Node.js 18+

**Both require:**
- A [Spotify Developer](https://developer.spotify.com/dashboard) application

### Spotify Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new application
3. Add redirect URIs:
   - `http://localhost:5173/callback` (local development)
   - `http://localhost:3000/callback` (Docker)
   - Your production URL + `/callback` if deploying
4. Note your Client ID and Client Secret

### Docker Deployment (Recommended)

```bash
# Copy and edit environment file
cp .env.example .env

# Edit .env with your values (all are required):
# - JWT_SECRET
# - ADMIN_PORTAL_PASSWORD
# - SPOTIFY_CLIENT_ID
# - SPOTIFY_CLIENT_SECRET

# Build and start containers
docker compose up -d

# View logs
docker compose logs -f
```

The app will be available at `http://localhost:3000`.

To stop: `docker compose down`

To stop and remove data: `docker compose down -v`

### Local Development

#### Backend Setup

```bash
cd backend

# Copy and edit environment file
cp .env.example .env

# Edit .env with your values:
# - SPOTIFY_CLIENT_ID
# - SPOTIFY_CLIENT_SECRET
# - JWT_SECRET (change for production)
# - ADMIN_PORTAL_PASSWORD

# Run the server
go run ./cmd/server
```

The backend runs on `http://localhost:8080`.

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy and edit environment file
cp .env.example .env

# Edit .env:
# - VITE_SPOTIFY_CLIENT_ID (same as backend)

# Start dev server
npm run dev
```

The frontend runs on `http://localhost:5173`.

## Usage

### As an Admin

1. Go to `http://localhost:5173/admin`
2. Enter the admin portal password
3. Create a new session with your name and a password
4. Share the friend access key with your friends
5. Connect your Spotify account to enable playlist sync
6. Approve or reject incoming song requests

### As a Friend

1. Go to `http://localhost:5173`
2. Enter the access key shared by the admin
3. Search for songs and submit requests
4. Watch your requests get approved (or rejected)

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/admin/verify` | None | Verify admin portal password |
| POST | `/api/sessions` | None | Create new session |
| POST | `/api/sessions/join` | None | Join with friend key |
| POST | `/api/sessions/rejoin` | None | Rejoin as admin |
| GET | `/api/sessions/{id}` | JWT | Get session details |
| GET | `/api/sessions/{id}/requests` | JWT | List song requests |
| POST | `/api/sessions/{id}/requests` | JWT | Submit request |
| PUT | `/api/sessions/{id}/requests/{rid}/approve` | Admin | Approve request |
| PUT | `/api/sessions/{id}/requests/{rid}/reject` | Admin | Reject request |
| GET | `/api/spotify/search` | Rate limited | Search Spotify |

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `DATABASE_PATH` | `./songify.db` | SQLite database path |
| `JWT_SECRET` | - | Secret for signing JWTs |
| `ADMIN_PORTAL_PASSWORD` | `admin123` | Password for admin portal |
| `SPOTIFY_CLIENT_ID` | - | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | - | Spotify app client secret |
| `ADMIN_TOKEN_DURATION` | `168h` | Admin JWT validity (7 days) |
| `FRIEND_TOKEN_DURATION` | `12h` | Friend JWT validity |
| `RATE_LIMIT_PER_MINUTE` | `10` | Search rate limit per IP |

### Frontend Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SPOTIFY_CLIENT_ID` | Spotify app client ID for PKCE auth |

## CI/CD

This project uses GitHub Actions for continuous integration and deployment.

### Pull Requests

All PRs automatically run:
- Backend tests (`go test`)
- Backend build verification
- Frontend tests (`vitest`)
- Frontend linting (`eslint`)
- Frontend build verification

### Docker Images

On merge to `main` or version tags, Docker images are built and pushed to GitHub Container Registry:

```bash
# Pull latest images
docker pull ghcr.io/OWNER/REPO/backend:main
docker pull ghcr.io/OWNER/REPO/frontend:main
```

See [GITHUB_SETUP.md](.github/GITHUB_SETUP.md) for repository configuration details.

## Project Structure

```
songify/
├── backend/
│   ├── cmd/server/          # Entry point
│   └── internal/
│       ├── config/          # Environment config
│       ├── database/        # DB connection & migrations
│       ├── db/              # sqlc generated code
│       ├── handlers/        # HTTP handlers
│       ├── middleware/      # Auth, CORS, rate limiting
│       ├── models/          # Request/response DTOs
│       ├── router/          # Route definitions
│       └── services/        # Auth, Spotify, friend keys
└── frontend/
    └── src/
        ├── components/      # UI components
        ├── pages/           # Route pages
        ├── services/        # API client, Spotify, crypto
        ├── stores/          # Zustand stores
        └── types/           # TypeScript types
```

## License

MIT
