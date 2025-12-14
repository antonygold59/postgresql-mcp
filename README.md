# postgres-mcp

<!-- mcp-name: io.github.neverinfamous/postgres-mcp -->

*Last updated December 14, 2025 - Development Preview*

*Enterprise-grade PostgreSQL MCP Server with OAuth 2.0 authentication, connection pooling, tool filtering, plus support for pgvector, PostGIS, and advanced PostgreSQL features - TypeScript Edition*

> **🚧 Development Preview** - Core infrastructure complete with 106 tools, 6 resources, and 7 prompts. Testing and documentation in progress.

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/postgres--mcp-blue?logo=github)](https://github.com/neverinfamous/postgres-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)
![Status](https://img.shields.io/badge/status-Development%20Preview-yellow)

A **PostgreSQL MCP Server** that enables AI assistants (Claude, Cursor, etc.) to interact with PostgreSQL databases through the Model Context Protocol. Provides **106 specialized tools**, **6 resources**, and **7 AI-powered prompts**.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12-18 (tested with PostgreSQL 18.1)
- npm or yarn

### Installation

```bash
git clone https://github.com/neverinfamous/postgres-mcp.git
cd postgres-mcp
npm install
npm run build
node dist/cli.js --transport stdio --postgres postgres://user:password@localhost:5432/database
```

---

## ⚡ MCP Client Configuration

### Cursor IDE / Claude Desktop

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "node",
      "args": [
        "C:/path/to/postgres-mcp/dist/cli.js",
        "--transport", "stdio",
        "--postgres", "postgres://user:password@localhost:5432/database"
      ]
    }
  }
}
```

### Using Environment Variables (Recommended)

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "node",
      "args": [
        "C:/path/to/postgres-mcp/dist/cli.js",
        "--transport", "stdio"
      ],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "your_user",
        "POSTGRES_PASSWORD": "your_password",
        "POSTGRES_DATABASE": "your_database"
      }
    }
  }
}
```

---

## 🔗 Database Connection Scenarios

| Scenario | Host to Use | Example Connection String |
|----------|-------------|---------------------------|
| **PostgreSQL on host machine** | `localhost` or `host.docker.internal` | `postgres://user:pass@localhost:5432/db` |
| **PostgreSQL in Docker** | Container name or network | `postgres://user:pass@postgres-container:5432/db` |
| **Remote/Cloud PostgreSQL** | Hostname or IP | `postgres://user:pass@db.example.com:5432/db` |

| Provider | Example Hostname |
|----------|------------------|
| AWS RDS PostgreSQL | `your-instance.xxxx.us-east-1.rds.amazonaws.com` |
| Google Cloud SQL | `project:region:instance` (via Cloud SQL Proxy) |
| Azure PostgreSQL | `your-server.postgres.database.azure.com` |
| Supabase | `db.xxxx.supabase.co` |
| Neon | `ep-xxx.us-east-1.aws.neon.tech` |

---

## 🛠️ Tool Categories

This server provides **106 tools** across 12 categories:

| Category | Tools | Description |
|----------|-------|-------------|
| Core | 8 | CRUD, schema, tables, indexes |
| Transactions | 7 | BEGIN, COMMIT, ROLLBACK, savepoints with isolation levels |
| JSONB | 12 | jsonb_set, jsonb_extract, jsonb_path_query (PostgreSQL native) |
| Text | 10 | Full-text search, trigram similarity, fuzzy matching |
| Performance | 12 | EXPLAIN ANALYZE, pg_stat_statements, index recommendations |
| Admin | 10 | VACUUM, ANALYZE, REINDEX, configuration |
| Monitoring | 8 | Database sizes, connections, replication status |
| Backup | 6 | pg_dump commands, COPY export/import |
| Schema | 10 | Schemas, sequences, views, functions, triggers |
| Vector | 8 | pgvector extension - similarity search, HNSW/IVFFlat indexes |
| PostGIS | 9 | Geospatial operations - distance, contains, intersection |
| Partitioning | 6 | Range/list/hash partitioning management |

---

## 🎛️ Tool Filtering

> [!IMPORTANT]
> **AI-enabled IDEs like Cursor have tool limits.** With 106 tools, you should use tool filtering to stay within limits.

### Tool Groups

| Group | Tools | Description |
|-------|-------|-------------|
| `core` | 8 | Basic CRUD and schema operations |
| `transactions` | 7 | Transaction control with savepoints |
| `jsonb` | 12 | JSONB manipulation and queries |
| `text` | 10 | Text search and similarity |
| `performance` | 12 | Query analysis and optimization |
| `admin` | 10 | Database maintenance |
| `monitoring` | 8 | Health and status monitoring |
| `backup` | 6 | Export and backup commands |
| `schema` | 10 | DDL operations |
| `vector` | 8 | pgvector extension |
| `postgis` | 9 | PostGIS extension |
| `partitioning` | 6 | Partition management |

### Filter Presets

**Minimal (~25 tools):**
```json
"--tool-filter", "-performance,-admin,-backup,-schema,-vector,-postgis,-partitioning"
```

**Development (~50 tools):**
```json
"--tool-filter", "-admin,-monitoring,-backup,-partitioning"
```

**DBA (~75 tools):**
```json
"--tool-filter", "-vector,-postgis"
```

### Custom Filtering Syntax

- `-group` — Exclude all tools in group
- `+group` — Include all tools in group
- `-pg_tool_name` — Exclude specific tool
- `+pg_tool_name` — Include specific tool

---

## 🤖 AI-Powered Prompts

This server includes **7 intelligent prompts** for guided workflows:

| Prompt | Description |
|--------|-------------|
| `pg_query_builder` | Construct PostgreSQL queries with CTEs and window functions |
| `pg_schema_design` | Design normalized schemas with constraints and indexes |
| `pg_performance_analysis` | Analyze queries with EXPLAIN and optimization tips |
| `pg_migration` | Generate migration scripts with rollback support |
| `pg_full_text_search` | Build full-text search with tsvector/tsquery |
| `pg_security_audit` | Review roles, permissions, and RLS policies |
| `pg_tool_discovery` | Lazy hydration - find tools by description |

---

## 📦 Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Schema | `postgres://schema` | Current database schema |
| Tables | `postgres://tables` | Table listing with sizes |
| Settings | `postgres://settings` | PostgreSQL configuration |
| Statistics | `postgres://stats` | Database statistics |
| Activity | `postgres://activity` | Current connections |
| Pool | `postgres://pool` | Connection pool status |

---

## 🔧 Extension Support

| Extension | Purpose | Tools |
|-----------|---------|-------|
| `pg_stat_statements` | Query performance tracking | `pg_stat_statements` |
| `pg_trgm` | Text similarity | `pg_trigram_similarity` |
| `fuzzystrmatch` | Fuzzy matching | `pg_fuzzy_match` |
| `hypopg` | Hypothetical indexes | `pg_index_recommendations` |
| `pgvector` | Vector similarity search | 8 vector tools |
| `PostGIS` | Geospatial operations | 9 postgis tools |

> Extension tools gracefully handle cases where extensions are not installed.

---

## 🔥 Core Capabilities

- 📊 **Full SQL Support** - Execute any PostgreSQL query with parameter binding
- 🔍 **JSONB Operations** - Native JSONB functions and path queries
- 🔐 **Connection Pooling** - Efficient connection management with health checks
- 🎛️ **Tool Filtering** - Control which operations are exposed
- ⚡ **Performance Tools** - EXPLAIN ANALYZE, buffer analysis, index hints
- 🗺️ **PostGIS Support** - Geospatial queries and spatial indexes
- 🧠 **pgvector Support** - AI/ML vector similarity search

### 🏢 Enterprise Features

- 🔐 **OAuth 2.0 Authentication** - RFC 9728/8414 compliant (coming soon)
- 🛡️ **Tool Filtering** - Control which database operations are exposed
- 📈 **Monitoring** - Process lists, replication lag, cache hit ratios

---

## 🏆 Why Choose postgres-mcp?

✅ **TypeScript Native** - Full type safety with strict mode  
✅ **106 Specialized Tools** - Comprehensive PostgreSQL coverage  
✅ **Connection Pooling** - Efficient PostgreSQL connection management  
✅ **Extension Support** - pgvector, PostGIS, pg_stat_statements  
✅ **Tool Filtering** - Stay within AI IDE tool limits  
✅ **Modern Architecture** - Built on MCP SDK  

---

## Development

```bash
# Clone and install
git clone https://github.com/neverinfamous/postgres-mcp.git
cd postgres-mcp
npm install

# Build
npm run build

# Run checks
npm run lint && npm run typecheck

# Test CLI
node dist/cli.js info
node dist/cli.js list-tools
```

---

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

## Security

For security concerns, please see our [Security Policy](SECURITY.md).

> **⚠️ Never commit credentials** - Store secrets in environment variables

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating in this project.
