# jobber-mcp

MCP server connecting AI assistants (Claude, ChatGPT, Gemini, Copilot) to **Jobber** (field/home services business software), built on Jobber's open GraphQL API.

- API docs: https://developer.getjobber.com (open self-serve GraphQL API, free developer program)
- Research: see `../mcp-deep-dive.md`
- Status: **read-only v1, verified against the live schema** (API version `2026-05-12`, Sept 2026)

## Tools (read-only v1)

| Tool | What it does |
|---|---|
| `search_jobs` | Find jobs (work orders) by client, status, date range; paginated |
| `get_unpaid_invoices` | Overdue/balanced-owing invoices, days overdue, total AR outstanding |
| `get_client_details` | Client profile + outstanding balance + recent jobs and invoices |
| `get_schedule` | Upcoming visits in a date range (default today → +7 days) |
| `get_quotes` | Quote pipeline grouped by status |
| `draft_client_message` | Compose a payment reminder / follow-up **draft** enriched with live invoice facts — never sends |

## Setup

1. **Create a Jobber developer app** at https://developer.getjobber.com (free). Note your `CLIENT ID` / `CLIENT SECRET`. Enable **read-only** scopes for Clients, Jobs, Quotes, Scheduled Items, and Invoices. Leave the Callback URL blank — Jobber allows `localhost` redirects automatically on any port.
2. **Install & configure:**
   ```bash
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
         "args": ["D:/coding/mcp/jobber-mcp/dist/src/index.js"],
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

## Schema verification & maintenance

The queries are **verified against the live schema** as of API version
`2026-05-12` (the version Jobber's response `extensions.versioning` reports).
Two things matter when something breaks after an API bump:

1. The API requires an `X-JOBBER-GRAPHQL-VERSION` header (default set via
   `JOBBER_API_VERSION` in `.env` if Jobber ships a newer version).
2. All GraphQL documents live in `src/jobber/queries.ts` — re-run
   `npm run introspect` (dumps root queries + type/input fields), align that
   file, then check with `npm run test:wiring` (offline) and `npm run smoke`
   (live, read-only).

Safety net: if the live schema rejects our filter/search arguments after a
version bump, the client automatically retries without them and tools filter
results locally; selection-field mismatches surface the GraphQL error verbatim
with a hint.

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
401 refresh, filter fallback) · `src/jobber/queries.ts` (all GraphQL documents,
schema-verified) · `src/config.ts` (env/.env) · `scripts/` (auth, introspect,
smoke, wiring test).

## Principles

1. Read-only first; write tools (`create_quote`, `quote_to_invoice`, send) only after validation.
2. Customer-held OAuth tokens — never store secrets server-side; tokens live in the customer's env/config.
3. Opinionated workflow tools, not thin CRUD (that's what Composio undercuts at $0.0003/call).
4. Open-source core; hosted version at $9–29/mo later.

## Status

- [x] Create Jobber developer account + sandbox (read-only scopes: Clients, Jobs, Quotes, Scheduled Items, Invoices)
- [x] Prototype server (TypeScript, official MCP SDK, stdio transport)
- [x] Offline wiring test — 11/11 cases pass against a mock Jobber API
- [x] Verify field names against live schema via introspection (`2026-05-12`) + live smoke test
- [ ] Add sample data to the trial account and exercise tools end-to-end in an AI client
- [ ] List on Smithery / PulseMCP / Glama
- [ ] Post in Jobber community + r/Jobber

## License

MIT
