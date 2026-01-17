# GitHub Repository Setup

This document describes how to configure the GitHub repository for Songify.

## Repository Settings

### General Settings

1. Go to **Settings** > **General**
2. Under "Pull Requests":
   - Enable "Allow squash merging"
   - Enable "Automatically delete head branches"

### Branch Protection Rules

1. Go to **Settings** > **Branches**
2. Click **Add branch protection rule**
3. Set "Branch name pattern" to `main`
4. Enable the following:
   - **Require a pull request before merging**
     - Require approvals: 1 (or more for teams)
   - **Require status checks to pass before merging**
     - Require branches to be up to date
     - Required checks:
       - `Backend Tests`
       - `Backend Build`
       - `Frontend Tests`
       - `Frontend Lint`
       - `Frontend Build`
   - **Do not allow bypassing the above settings**

### Packages (Container Registry)

Images are automatically published to GitHub Container Registry (ghcr.io) on:
- Push to `main` branch
- Git tags matching `v*`

Images will be available at:
- `ghcr.io/<owner>/<repo>/backend:main`
- `ghcr.io/<owner>/<repo>/frontend:main`

To make packages public:
1. Go to your profile/org packages
2. Select the package
3. **Package settings** > **Change visibility** > **Public**

## CI/CD Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Runs on all PRs and pushes to `main`:
- Backend: Go tests and build
- Frontend: Vitest tests, ESLint, and Vite build

### Docker Publish (`.github/workflows/docker-publish.yml`)

Runs on pushes to `main` and version tags:
- Builds Docker images for backend and frontend
- Pushes to GitHub Container Registry
- Uses build caching for faster builds

## Using Published Images

After images are published, update your `docker-compose.yml` for production:

```yaml
services:
  backend:
    image: ghcr.io/<owner>/<repo>/backend:main
    # ... rest of config

  frontend:
    image: ghcr.io/<owner>/<repo>/frontend:main
    # ... rest of config
```

Or use specific versions:
```yaml
image: ghcr.io/<owner>/<repo>/backend:v1.0.0
```
