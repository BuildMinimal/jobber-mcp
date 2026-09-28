# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/).

## [1.1.0] - 2026-09-28

### Added

- **Claude Desktop extension (`.mcpb`)**: single-file, double-click install for
  non-technical users — no Node.js, no terminal, no config files
  (`npm run build:extension` builds it from source)
- **`authenticate` tool**: connect a Jobber account from inside the chat —
  browser OAuth flow with a localhost callback; tokens persist to
  `~/.jobber-mcp/tokens.json` and are picked up automatically on restart
- The server now starts without credentials (essential for the extension
  flow); tools return friendly connect-first guidance instead of failing at
  startup
- Refreshed tokens are persisted on rotation, surviving restarts

## [1.0.0] - 2026-09-28

First public release. Read-only MCP server connecting AI assistants to Jobber
via the official GraphQL API.

### Added

- Six read-only tools: `search_jobs`, `get_unpaid_invoices`,
  `get_client_details`, `get_schedule`, `get_quotes`,
  `draft_client_message` (composes drafts locally - never sends)
- OAuth helper (`npm run auth`): local authorization-code flow with automatic
  localhost callback; silent access-token refresh when a refresh token and
  app credentials are configured
- Verified against the live Jobber GraphQL schema, API version `2026-05-12`
  (`X-JOBBER-GRAPHQL-VERSION` header, `EncodedId` identifiers, scalar sort
  enums, `amounts { total, invoiceBalance }` money shape)
- Throttle-aware retries against Jobber's query-cost budget (10,000 points,
  +500/sec) with restore waits; bounded nested connections and default page
  sizes tuned to keep requests well under budget
- Schema-drift fallback: if a schema change rejects filter/search arguments,
  queries retry without them and tools filter results locally
- Money formatted in the account's own currency (derived from
  `account.countryCode`, e.g. ₹/€/£ - not hardcoded); optional
  `JOBBER_TIMEZONE` renders visit times and all-day dates locally
- Tooling: offline wiring test suite (mock Jobber API + in-memory MCP client,
  11 cases incl. non-USD currency), live read-only smoke test, and a schema
  introspection script for API-version bumps
- `npm run sync:zcode` helper to refresh credentials in a ZCode MCP config
