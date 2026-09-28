# Contributing to jobber-mcp

Thanks for your interest in improving the Jobber MCP server. This document
covers setup, the workflows you'll need, and what a good pull request looks
like.

## Prerequisites

- Node.js 18.17+ (built and tested on Node 22)
- A Jobber account (a free trial works) plus a developer app from
  https://developer.getjobber.com with **read-only** scopes for Clients,
  Jobs, Quotes, Scheduled Items, and Invoices

## Setup

```bash
git clone https://github.com/your-username/jobber-mcp.git
cd jobber-mcp
npm install
cp .env.example .env   # fill in credentials when you need live calls
```

## Development workflow

```bash
npm run build         # compile + typecheck (must pass)
npm run test:wiring   # offline end-to-end tests: mock Jobber API + in-memory
                      # MCP client exercising every tool (no token needed)
npm run dev           # run the server from source
npm run auth          # OAuth helper to get tokens into .env
npm run smoke         # live read-only validation of every query (needs token)
npm run introspect    # dump Jobber's live GraphQL schema surface
```

**Every PR must keep `npm run build` and `npm run test:wiring` green.** If
your change touches GraphQL documents, also run `npm run smoke` against a
real account and say so in the PR description.

### Changing or adding GraphQL queries

All GraphQL documents live in one file: `src/jobber/queries.ts`. It is kept
in lockstep with a verified live schema version (see the `X-JOBBER-GRAPHQL-VERSION`
header and README → Schema verification). If Jobber ships a new API version:

1. Update `JOBBER_API_VERSION` in your `.env`.
2. Run `npm run introspect` and align `src/jobber/queries.ts` with what it prints.
3. Extend `scripts/wiring-test.ts` fixtures if response shapes changed.
4. Run build + wiring + smoke.

### Adding a tool

Tools are registered in `src/tools.ts`. Follow the existing pattern:

- A specific, opinionated tool beats thin CRUD - think "what question is the
  business owner asking?" and return a formatted answer, not raw JSON.
- Rich `description` text: agents choose tools by description. Include valid
  enum values, defaults, and when *not* to use the tool.
- Local filtering as a safety net next to server-side filters.
- Validate enum inputs and fail with the list of valid values.
- Read-only by default; write tools are gated on the v2 design (explicit
  confirm-before-send) - open an issue before investing in a write tool.

## Design principles (please preserve)

1. **Read-only first.** v1 never mutates Jobber data. `draft_client_message`
   composes drafts locally and never sends.
2. **Customer-held credentials.** Tokens live in the user's environment or
   `.env` (gitignored). The project never transmits credentials anywhere
   except Jobber's own API.
3. **Least privilege.** Request only the scopes a tool needs; read over write.
4. **Reliability engineering.** Silent token refresh, throttle-aware retry,
   API-version pinning, and schema-drift fallback are features, not extras -
   don't remove them to "simplify."

## Reporting bugs

Open an issue with: what you asked the assistant, the tool output or error,
your Node version, and (if relevant) your `JOBBER_API_VERSION`. Never paste
access tokens or client secrets into issues.

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities privately rather than
in public issues.

## License

By contributing, you agree your contributions are licensed under the MIT
License.
