# Open WebUI Knowledge Base MCP Server

<div align="center">

![Open WebUI](https://img.shields.io/badge/Open%20WebUI-0.7.2+-green.svg)
![Transport](https://img.shields.io/badge/transport-stdio%20%7C%20HTTP-lightgrey.svg)
![Node](https://img.shields.io/badge/node-22+-blue.svg)
[![Tests](https://github.com/RonasIT/open-webui-mcp-server/actions/workflows/validate.yml/badge.svg)](https://github.com/RonasIT/open-webui-mcp-server/actions/workflows/validate.yml)

**MCP server for Open WebUI Knowledge Bases** – Search and access your knowledge bases from Cursor, Claude Desktop, and other MCP clients

[Features](#features) • [Quick Start](#quick-start) • [Usage](#usage) • [Available Tools](#available-tools) • [Contributing](CONTRIBUTING.md)

</div>

An MCP (Model Context Protocol) server that exposes [Open WebUI](https://github.com/open-webui/open-webui) Knowledge Bases as tools and resources, enabling AI assistants like Cursor and Claude Desktop to search and access knowledge bases.

## Features

- 🔍 **Semantic Search** – Search knowledge bases using semantic search
- 📚 **Knowledge Base Management** – List and get information about knowledge bases
- 👥 **Multi-User Support** – Each connection uses its own API token for isolation
- 🌐 **Dual Transport** – stdio (local) and HTTP (remote)
- 🔒 **Secure** – Per-connection auth, input validation, rate limiting, CORS protection

## Quick Start

### Prerequisites

- Node.js 22+ or Docker
- Open WebUI instance with API access
- API token from Open WebUI (Settings → Account → API keys)

### Run with NPX

```bash
export OPEN_WEBUI_API_URL="https://your-open-webui-instance.com/api/v1"
export OPEN_WEBUI_API_TOKEN="sk-your-token-here"
npx open-webui-knowledge-mcp-server
```

Or from the repo (after `npm install` and `npm run build`):

```bash
npx .
```

## Usage

### stdio mode (Local)

```bash
export OPEN_WEBUI_API_URL="https://your-open-webui-instance.com/api/v1"
export OPEN_WEBUI_API_TOKEN="sk-your-token-here"
npx open-webui-knowledge-mcp-server
```

### HTTP mode (Production)

```bash
export OPEN_WEBUI_API_URL="https://your-open-webui-instance.com/api/v1"
export MCP_TRANSPORT=http
export MCP_HTTP_PORT=8001
npx open-webui-knowledge-mcp-server
```

Server endpoints:

- **MCP**: `http://localhost:8001/mcp`
- **Health**: `http://localhost:8001/health`

### Docker

```bash
docker build -t open-webui-mcp-server .
docker run -e OPEN_WEBUI_API_URL=https://your-instance.com/api/v1 -e OPEN_WEBUI_API_TOKEN=sk-xxx -p 8001:8001 open-webui-mcp-server
```

## Configuring Cursor to use your MCP server

### Cursor: stdio mode

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "open-webui-knowledge": {
      "command": "npx",
      "args": ["open-webui-knowledge-mcp-server"],
      "env": {
        "OPEN_WEBUI_API_URL": "https://your-open-webui-instance.com/api/v1",
        "OPEN_WEBUI_API_TOKEN": "sk-your-token-here"
      }
    }
  }
}
```

### Cursor: HTTP mode

```json
{
  "mcpServers": {
    "open-webui-knowledge": {
      "url": "https://your-remote-server-url/mcp",
      "headers": {
        "Authorization": "Bearer sk-your-token-here"
      }
    }
  }
}
```

## Available Tools

- **`list_knowledge_bases`** – List all accessible knowledge bases

- **`search_knowledge_base`** – Search a knowledge base using semantic search
  - `knowledge_base_id` (required): The ID of the knowledge base
  - `query` (required): Your search query
  - `k` (optional): Number of results (default: 5)

- **`get_knowledge_base_info`** – Get detailed information about a knowledge base
  - `knowledge_base_id` (required): The ID of the knowledge base

## Environment Variables

| Variable                   | Description                                    | Default       |
| -------------------------- | ---------------------------------------------- | ------------- |
| `OPEN_WEBUI_API_URL`       | Open WebUI API base URL                        | Required      |
| `OPEN_WEBUI_API_TOKEN`     | Default API token (optional in HTTP)           | None          |
| `MCP_TRANSPORT`            | Transport mode: `stdio` or `http`              | `stdio`       |
| `MCP_HTTP_HOST`            | HTTP server host                               | `0.0.0.0`     |
| `MCP_HTTP_PORT`            | HTTP server port                               | `8001`        |
| `MCP_CORS_ORIGINS`         | Comma-separated CORS origins (empty = no CORS) | Empty         |
| `MCP_RATE_LIMIT_PER_IP`    | Rate limit per IP (e.g. "1000/minute")         | `1000/minute` |
| `MCP_RATE_LIMIT_PER_TOKEN` | Rate limit per token                           | `1000/minute` |
| `MCP_RATE_LIMIT_HEALTH`    | Rate limit for health endpoint                 | `10/minute`   |

## Security

- Input validation and sanitization
- Rate limiting (per-IP and per-token)
- CORS protection (disabled by default)
- Request size limits (10MB max)
- Error message sanitization
- Token validation

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

This project is licensed under the **MIT License**.

---

<div align="center">

**Built with ❤️ by [Ronas IT](https://ronasit.com)**

_Professional development services • Open source contributors_

[Website](https://ronasit.com) • [GitHub](https://github.com/RonasIT) • [Email](mailto:hello@ronasit.com)

</div>
