# jobber-mcp

MCP server connecting AI assistants (Claude, ChatGPT, Gemini, Copilot) to **Jobber** (field/home services business software), built on Jobber's open GraphQL API.

- API docs: https://developer.getjobber.com (open self-serve GraphQL API, free developer program)
- Research: see `../mcp-deep-dive.md`
- Status: **prototype, read-only, offline-tested** — live-schema verification pending a sandbox account (see below)

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

## Verifying against the live schema (first session with a token)

Jobber's GraphQL schema is not fully documented, and this prototype's field names
follow best-known docs (Sept 2026) **without live verification yet**. Two safety
nets are built in:

1. Guessed search-input fields are auto-dropped on schema rejection — the client
   retries unfiltered and tools filter results locally.
2. Selection-field mismatches surface the GraphQL error verbatim with a hint.

First run with sandbox credentials:

```bash
npm run introspect                 # dumps root queries + Job/Invoice/Quote/Client/Visit fields
npm run introspect SomeOtherType   # any additional type
```

Align `src/jobber/queries.ts` (the single place queries live) with what it
prints, then re-run `npm run test:wiring` and exercise the tools. If the API
404s, the GraphQL path may differ — set `JOBBER_API_URL` (see `.env.example`).

## Development

```bash
npm run build         # tsc, typechecks src + scripts
npm run test:wiring   # offline end-to-end: mock Jobber API + in-memory MCP client, all 6 tools (no token needed)
npm run dev           # run server from source
npm run auth          # local OAuth code-flow helper (localhost callback)
npm run introspect    # dump live schema surface (needs token)
```

Layout: `src/index.ts` (entry) · `src/tools.ts` (tool definitions + local
filtering/formatting) · `src/jobber/client.ts` (GraphQL fetch, 401 refresh,
input fallback) · `src/jobber/queries.ts` (all GraphQL documents) ·
`src/config.ts` (env/.env) · `scripts/` (auth, introspect, wiring test).

## Principles

1. Read-only first; write tools (`create_quote`, `quote_to_invoice`, send) only after validation.
2. Customer-held OAuth tokens — never store secrets server-side; tokens live in the customer's env/config.
3. Opinionated workflow tools, not thin CRUD (that's what Composio undercuts at $0.0003/call).
4. Open-source core; hosted version at $9–29/mo later.

## Status

- [ ] Create Jobber developer account + sandbox (needs a human — portal requires signup)
- [x] Prototype server (TypeScript, official MCP SDK, stdio transport)
- [x] Offline wiring test — 10/10 cases pass against a mock Jobber API
- [ ] Verify field names against live sandbox via `npm run introspect`
- [ ] List on Smithery / PulseMCP / Glama
- [ ] Post in Jobber community + r/Jobber

## License

MIT
