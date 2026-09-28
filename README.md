# jobber-mcp

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A518.17-green)
![Jobber API](https://img.shields.io/badge/Jobber%20API-verified%202026--05--12-brightgreen)
![Access](https://img.shields.io/badge/access-read--only-success)

A read-only **MCP server** connecting AI assistants (Claude, ChatGPT, Gemini, Copilot) to **Jobber** - field/home-services business software - via Jobber's official GraphQL API. Ask your assistant things like *"which invoices are overdue?"* or *"what's on the schedule this week?"* and get answers from your real account.

> **Not affiliated with Jobber.** This is an independent, community-built integration. "Jobber" is a trademark of Jobber Software Corp. Use of the name here is nominative - it describes what the tool connects to.

## Tools (read-only v1)

| Tool | What it does |
|---|---|
| `authenticate` | Connect your Jobber account — one time, in-chat, via browser OAuth |
| `search_jobs` | Find jobs (work orders) by client, status, date range; paginated |
| `get_unpaid_invoices` | Overdue/balanced-owing invoices, days overdue, total AR outstanding |
| `get_client_details` | Client profile + outstanding balance + recent jobs and invoices |
| `get_schedule` | Upcoming visits in a date range (default today → +7 days) |
| `get_quotes` | Quote pipeline grouped by status |
| `draft_client_message` | Compose a payment reminder / follow-up **draft** enriched with live invoice facts - never sends |

## Why this one

Several Jobber MCP servers exist; most are weekend prototypes that break in
week two. This one is built for the failures that actually kill Jobber
integrations:

- **Silent token refresh** - access tokens expire; renewal just works when a
  refresh token and app credentials are configured
- **Throttle-aware retries** - Jobber's GraphQL API uses a query-cost budget
  (10,000 points, +500/sec); bursts wait and retry instead of erroring
- **API-version pinning + drift fallback** - sends the required
  `X-JOBBER-GRAPHQL-VERSION` header, and if a schema change rejects our
  filters, queries degrade gracefully instead of failing
- **Verified against the live schema** (`2026-05-12`) - `EncodedId`
  identifiers, enum statuses, `amounts` money shape, scalar sort inputs
- **Correct details** - money in your account's own currency (₹/€/£/…, not a
  hardcoded `$`), visit times in your local timezone
- **Tests** - an offline end-to-end suite (mock Jobber API + in-memory MCP
  client) and a live read-only smoke script
- **Trust posture** - strictly read-only, least-privilege scopes, your tokens
  never leave your machine, drafts never send

## Requirements

- For the Claude Desktop extension: nothing but Claude Desktop and a Jobber account
- For other MCP clients: Node.js 18.17+
- A free developer app from https://developer.getjobber.com (created during setup, ~5 minutes)

## Install

### Claude Desktop — no coding (easiest)

1. Download `jobber-mcp.mcpb` from this repo's [releases](https://github.com/buildminimal/jobber-mcp/releases).
2. In Claude Desktop: **Settings → Extensions → Install extension** → select the file.
3. In a chat, say *"authenticate with Jobber"* and follow the one-time setup: create a free app at https://developer.getjobber.com with read-only scopes (Clients, Jobs, Quotes, Scheduled Items, Invoices — leave the Callback URL blank), then paste the app's Client ID and Secret when asked.
4. Your browser opens; log into Jobber and approve. Done — try *"Which invoices are overdue?"*

No Node.js, no terminal, no config files. Tokens are stored locally at `~/.jobber-mcp/tokens.json` and refreshed automatically.

> Building the extension yourself: `npm run build:extension` produces `dist/jobber-mcp.mcpb` from source.

### Any other MCP client (developers)

Works with anything that speaks MCP over stdio (Cursor, VS Code Copilot, Claude Code, …).

1. **Create a Jobber developer app** at https://developer.getjobber.com (free). Note your `CLIENT ID` / `CLIENT SECRET`. Enable **read-only** scopes for Clients, Jobs, Quotes, Scheduled Items, and Invoices. Leave the Callback URL blank - Jobber allows `localhost` redirects automatically on any port.
2. **Install & configure** (or skip this entirely and just call the `authenticate` tool from your assistant):
   ```bash
   git clone https://github.com/buildminimal/jobber-mcp.git
   cd jobber-mcp
   npm install
   cp .env.example .env      # fill in JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET
   npm run auth              # opens browser → prints tokens → paste into .env
   ```
3. **Connect your AI client.** Claude Desktop (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "jobber": {
         "command": "node",
         "args": ["/absolute/path/to/jobber-mcp/dist/src/index.js"],
         "env": {
           "JOBBER_ACCESS_TOKEN": "<from npm run auth>",
           "JOBBER_REFRESH_TOKEN": "<optional, enables silent renewal>",
           "JOBBER_CLIENT_ID": "<optional, needed for renewal>",
           "JOBBER_CLIENT_SECRET": "<optional, needed for renewal>"
         }
       }
     }
   }
   ```
   Other MCP clients: run `node dist/src/index.js` over stdio with the same env vars.

Then try: *"Which invoices are overdue? Draft a polite reminder for each."*

Optional: set `JOBBER_TIMEZONE` (IANA name, e.g. `Asia/Kolkata`) so visit
times display in your local timezone.

## Schema verification & maintenance

The queries are **verified against the live schema** as of API version
`2026-05-12` (the version Jobber's response `extensions.versioning` reports).
Two things matter when something breaks after an API bump:

1. The API requires an `X-JOBBER-GRAPHQL-VERSION` header (default set via
   `JOBBER_API_VERSION` in `.env` if Jobber ships a newer version).
2. All GraphQL documents live in `src/jobber/queries.ts` - re-run
   `npm run introspect` (dumps root queries + type/input fields), align that
   file, then check with `npm run test:wiring` (offline) and `npm run smoke`
   (live, read-only).

## Development

```bash
npm run build         # tsc, typechecks src + scripts
npm run test:wiring   # offline end-to-end: mock Jobber API + in-memory MCP client, all 6 tools (no token needed)
npm run smoke         # live read-only check that all queries still validate (needs token)
npm run dev           # run server from source
npm run auth          # local OAuth code-flow helper (localhost callback)
npm run introspect    # dump live schema surface (needs token)
```

Layout: `src/index.ts` (entry) · `src/tools.ts` (tool definitions + local
filtering/formatting) · `src/jobber/client.ts` (GraphQL fetch, version header,
401 refresh, throttle retry, filter fallback) · `src/jobber/queries.ts` (all
GraphQL documents, schema-verified) · `src/config.ts` (env/.env) · `scripts/`
(auth, introspect, smoke, wiring test).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide,
[COMPETITORS.md](COMPETITORS.md) for the landscape survey this project
positions itself in, [CHANGELOG.md](CHANGELOG.md) for release history, and
[SECURITY.md](SECURITY.md) for the trust model and how to report issues.

## Principles

1. Read-only first; write tools (`create_quote`, `quote_to_invoice`, send) only after validation, behind an explicit confirm-before-send design.
2. Customer-held OAuth tokens - never store secrets server-side; tokens live in the customer's env/config.
3. Opinionated workflow tools, not thin CRUD wrappers.
4. Open-source core; a hosted version may come later.

## License

MIT - see [LICENSE](LICENSE).
