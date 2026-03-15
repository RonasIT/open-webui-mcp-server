# Contributing Guide

Thank you for your interest in contributing to the Open WebUI Knowledge MCP Server! This guide will help you get started.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)

## Prerequisites

- Node.js 22 or higher
- An Open WebUI instance with API access (for e2e testing)
- Your Open WebUI API token (Settings → Account → API keys)
- Git

## Development Setup

### 1. Clone or fork the repo

```sh
git clone https://github.com/RonasIT/open-webui-mcp-server
cd open-webui-mcp-server
```

(If the TypeScript package lives in a subdirectory, `cd` into it, e.g. `open-webui-mcp-server-ts`.)

### 2. Install dependencies

```sh
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root (see `.env.template`):

```sh
OPEN_WEBUI_API_URL=https://your-open-webui-instance.com/api/v1
OPEN_WEBUI_API_TOKEN=sk-your-token-here
```

**Getting your API token:**

1. Log into Open WebUI
2. Go to **Settings → Account**
3. Scroll to **"API keys"** section
4. Click **"Show"** to reveal your API key (starts with `sk-`)

### 4. Build and run

```sh
npm run build
npm test
npm run test:e2e   # optional; requires .env with OPEN_WEBUI_API_URL and OPEN_WEBUI_API_TOKEN
npm start
```

Pre-commit hooks (Husky + lint-staged) run format and lint on staged files when you commit.

## Development Workflow

### Project structure

```text
open-webui-mcp-server-ts/
├── src/
│   ├── api-client.ts      # API client and validation
│   ├── cli.ts              # CLI entry (stdio/HTTP)
│   ├── constants.ts        # Shared constants
│   ├── index.ts            # Package entry
│   ├── server.ts           # MCP server and connection management
│   ├── tool-handlers.ts    # Tool implementations (list, search, get info)
│   └── transport-http.ts   # HTTP transport (Hono)
├── test/
│   ├── api-client.test.ts
│   ├── server.test.ts
│   ├── tool-handlers.test.ts
│   └── e2e/
│       └── knowledge.e2e.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── vitest.e2e.config.ts
└── .env                    # Environment variables (gitignored)
```

### Running the server locally

#### stdio mode (recommended for development)

```sh
export OPEN_WEBUI_API_URL="https://your-open-webui-instance.com/api/v1"
export OPEN_WEBUI_API_TOKEN="sk-your-token-here"
npm start
```

Or with npx from repo root after build:

```sh
npx .
```

#### HTTP mode (for testing HTTP transport)

```sh
export OPEN_WEBUI_API_URL="https://your-open-webui-instance.com/api/v1"
export OPEN_WEBUI_API_TOKEN="sk-your-token-here"
export MCP_TRANSPORT=http
export MCP_HTTP_PORT=8001
npm start
```

**Server endpoints:**

- **MCP**: `http://localhost:8001/mcp`
- **Health**: `http://localhost:8001/health`

### Making changes

1. **Create a feature branch** following the [Conventional Branch](https://conventional-branch.github.io/) guidelines

2. **Make your changes** following the [Code Style](#code-style) guidelines

3. **Test your changes** following the [Testing](#testing) guidelines

4. **Format and lint**: `npm run format`

5. **Commit your changes** following the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format

6. **Push and open a Pull Request** on GitHub with a clear description of your changes

## Testing

### Test suite overview

The project includes two test suites:

#### Unit tests

Unit tests with mocked HTTP. They cover:

- API client (validation, token masking, error handling)
- Server connection management (tokens, clients, cleanup)
- Tool handlers (list, search, get info) with mocked responses
- Error cases (401, 404, missing params)

**No external dependencies required** – all HTTP is mocked.

**Run unit tests:**

```sh
npm test
```

#### End-to-end tests

E2e tests run against a real Open WebUI API. They cover:

- List knowledge bases, get client, cleanup
- Search and get_knowledge_base_info (validation and real API)
- Authentication (invalid/missing token)
- Full workflow

**Require `.env`** with `OPEN_WEBUI_API_URL` and `OPEN_WEBUI_API_TOKEN`. If either is missing, the e2e suite is skipped.

**Run e2e tests:**

```sh
npm run test:e2e
```

### Running all tests

```sh
npm test
npm run test:e2e   # when .env is configured
```

### CI (GitHub Actions)

Tests run on every push and pull request. To run e2e in CI, configure repository secrets (Settings → Secrets and variables → Actions); otherwise only unit tests run:

- `OPEN_WEBUI_API_URL` – Open WebUI API base URL (e.g. `https://your-instance.com/api/v1`)
- `OPEN_WEBUI_API_TOKEN` – API token from Open WebUI

## Code style

### TypeScript / Node

- Use the project’s **ESLint** and **Prettier** configs
- Run `npm run format` before committing (Prettier + ESLint --fix)
- Use **TypeScript** strict mode; avoid `any` where possible
- Follow existing patterns in the codebase

### Patterns

When adding new features:

1. **Follow existing patterns** in the codebase
2. **Validate inputs** for all user-facing arguments
3. **Handle errors** – use `handleHttpError` for HTTP errors where appropriate
4. **Add tests** for new behavior (unit with mocks; e2e only when hitting real API)
5. **Update docs** (README, CONTRIBUTING) when adding features or scripts

## Reporting issues

When reporting bugs or requesting features:

1. **Check existing issues** to avoid duplicates
2. **Use the issue template** if available
3. **Include:**
   - Clear description of the issue
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment (Node version, OS, etc.)
   - Relevant logs or error messages

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).
