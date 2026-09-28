# Jobber MCP competitive landscape (Sept 2026)

Survey of every Jobber MCP server found on PulseMCP, Glama, npm, and GitHub.
No official Jobber MCP exists (Jobber's GitHub org ships only design-system
packages). GitHub search "jobber mcp": 17 repos, **max 5 stars**.

## The servers

| Server | Approach | Tools | Downloads/wk (npm) | Status |
|---|---|---|---|---|
| **chrischall/jobber-mcp** (@chrischall/jobber-mcp) | Browser bridge scraping the **Client Hub** (customer-side portal); NOT the Developer API | 7, read-only | **408** | v1.0.2 Sep 24 2026; "active" but author unresponsive; carries an AI-developed/no-audit warning |
| **opsconduit/jobber-mcp** (@opsconduit/jobber-mcp) | Developer API, "customer-hosted read-only operations queries" | ~small | 66 | May 2026, 1 star |
| **friendlygeorge/jobber-mcp-server** (PulseMCP listing) | Developer API (GraphQL), OAuth env vars | 6: list/get clients, get job, list/get invoices, **create_quote** (1 write) | 16 | **Repo archived — abandoned**; 1.1k est. all-time visitors on PulseMCP, rank #10,203, 0 stars |
| **BusyBee3333/jobber-mcp-2026-complete** | Developer API | "100+ tools" | — | 5 stars (the niche leader by stars), Aug 2026 |
| ~10 others (Onsite-Intelligence, sanjibani, MMavec/Python, todah-zg multi-tenant, …) | Mixed | CRUD wrappers | — | 0–3 stars, most stale |
| *justinvogel/jobber-mcp* | Referenced by chrischall's README | — | — | No repo/npm package found — stale link |

## Read of the market

1. **Land grab confirmed, nobody has won.** Top business-side player does
   66 npm downloads/week with 1 star; most repos are stale. The highest-demand
   Jobber MCP (408/wk) isn't even the business API — it's a customer-side
   Client Hub scraper built on a browser extension. Demand for "talk to Jobber
   from my AI" exists on both sides of the portal; the business-owner side is
   unclaimed.
2. **The graveyard pattern is the opportunity.** Weekend prototypes die of the
   unglamorous failures: token expiry (no refresh flow), query-cost throttling,
   schema-version drift, hardcoded currency. We hit all four ourselves in week
   one and now handle all four (auto-refresh, throttle-aware retry,
   `X-JOBBER-GRAPHQL-VERSION` pinning + introspection tooling, account-derived
   currency/timezone).
3. **Breadth vs depth split.** BusyBee's 100+ tools is the thin-CRUD approach
   the research warns about (agents can't pick between 100 similar tools);
   friendlygeorge had ~our shape but no schedule, no AR summary, no draft
   messaging — and is archived.

## Our differentiation (lead with these in listings)

- **Reliability engineering**: silent token refresh, throttle-aware retry with
  backoff, API-version pinning, schema-drift fallback — "the Jobber MCP that
  survives week two"
- **Verified, not guessed**: queries validated against live schema
  `2026-05-12` (EncodedId ids, scalar sort enums, amounts shape) + offline
  test suite (11 cases) and live smoke script; none of the competitors
  advertise any tests
- **Trust posture**: strictly read-only v1, customer-held tokens, least
  privilege (5 read scopes), drafts never send
- **Workflow depth, not CRUD**: AR summary with days-overdue math,
  quote pipeline by status, schedule in local time with all-day handling,
  drafts enriched with live invoice facts
- **Correct details**: account currency (₹/€/£, not hardcoded $), local
  timezone display

## Gaps competitors cover that we don't (yet)

- `create_quote` write path (friendlygeorge had it; our v2 once validated)
- Line-item detail on job/invoice fetch
- Multi-tenant hosting (todah-zg) — relevant only for the hosted version later

## Implications for the 30-day plan

- Distribution, not features, decides this niche (0–5 stars everywhere): the
  Jobber community post + r/Jobber + Show HN can take the #1 spot cheaply
- Registry descriptions should lead with the reliability/trust differentiators
  above — that's the side-by-side comparison buyers make
- v2 priority confirmed: `create_quote` / `quote_to_invoice` after validation
