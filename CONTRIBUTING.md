# Contributing to Songify

## Development Workflow

We use a standard GitHub flow for development:

1. Create a feature branch from `main`
2. Make your changes
3. Open a Pull Request
4. CI checks must pass
5. Get code review approval
6. Merge to `main`

### Branch Naming

Use descriptive branch names:
- `feature/add-playlist-export` - New features
- `fix/search-pagination` - Bug fixes
- `docs/api-examples` - Documentation
- `refactor/auth-middleware` - Code refactoring

### Commit Messages

Write clear, concise commit messages:
- Use present tense: "Add feature" not "Added feature"
- Keep the first line under 72 characters
- Reference issues when applicable: "Fix login bug (#123)"

## Running Tests

### Backend

```bash
cd backend
go test ./... -v
```

### Frontend

```bash
cd frontend
npm test
```

## Pull Request Requirements

All PRs must:
- Pass CI checks (tests, lint, build)
- Have a clear description of changes
- Include tests for new functionality
- Update documentation if needed

## Code Style

### Backend (Go)
- Follow standard Go formatting (`gofmt`)
- Use meaningful variable names
- Add comments for exported functions

### Frontend (TypeScript)
- Follow ESLint rules
- Use TypeScript strict mode
- Prefer functional components with hooks
