/**
 * Live read-only smoke test: runs every v1 query against the real Jobber API
 * using credentials from .env. Verifies the GraphQL documents validate
 * against the live schema. Empty results are fine - GraphQL validation
 * errors are not.
 *
 *   npm run smoke
 */
import { loadConfig } from "../src/config.js";
import { JobberClient } from "../src/jobber/client.js";
import { queries } from "../src/jobber/queries.js";

const cfg = loadConfig();
if (!cfg.accessToken && !cfg.refreshToken) {
  console.error("Set JOBBER_ACCESS_TOKEN first (run `npm run auth`).");
  process.exit(1);
}
const jobber = new JobberClient(cfg);

const checks: Array<{ name: string; run: () => Promise<string> }> = [
  {
    name: "searchJobs (unfiltered)",
    run: async () => {
      const d = await jobber.graphql<{ jobs: { totalCount: number | null; nodes: unknown[] } }>(queries.searchJobs, { first: 5 });
      return `${d.jobs?.nodes.length ?? 0} nodes, totalCount=${d.jobs?.totalCount ?? "?"}`;
    },
  },
  {
    name: "searchJobs (status filter)",
    run: async () => {
      const d = await jobber.graphql<{ jobs: { nodes: unknown[] } }>(queries.searchJobs, {
        first: 5,
        filter: { status: "active" },
      });
      return `${d.jobs?.nodes.length ?? 0} active nodes`;
    },
  },
  {
    name: "invoices (sorted by due date)",
    run: async () => {
      const d = await jobber.graphql<{ invoices: { totalCount: number | null; nodes: unknown[] } }>(queries.invoices, {
        first: 5,
        sort: [{ key: "DUE_DATE", direction: "DESCENDING" }],
      });
      return `${d.invoices?.nodes.length ?? 0} nodes, totalCount=${d.invoices?.totalCount ?? "?"}`;
    },
  },
  {
    name: "visits (7-day schedule)",
    run: async () => {
      const from = new Date();
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 8);
      const iso = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00Z`;
      const d = await jobber.graphql<{ visits: { nodes: unknown[] } }>(queries.visits, {
        first: 5,
        filter: { startAt: { after: iso(from), before: iso(to) } },
        sort: [{ key: "START_AT", direction: "ASCENDING" }],
      });
      return `${d.visits?.nodes.length ?? 0} visits in range`;
    },
  },
  {
    name: "quotes (unfiltered)",
    run: async () => {
      const d = await jobber.graphql<{ quotes: { totalCount: number | null; nodes: unknown[] } }>(queries.quotes, { first: 5 });
      return `${d.quotes?.nodes.length ?? 0} nodes, totalCount=${d.quotes?.totalCount ?? "?"}`;
    },
  },
  {
    name: "clients listing (for id discovery)",
    run: async () => {
      const d = await jobber.graphql<{ clients: { totalCount: number | null; nodes: unknown[] } }>(
        `query Clients($first: Int!) { clients(first: $first) { totalCount nodes { id name email phone balance } } }`,
        { first: 5 },
      );
      return `${d.clients?.nodes.length ?? 0} nodes, totalCount=${d.clients?.totalCount ?? "?"}`;
    },
  },
];

const COUNTRY_TO_CURRENCY: Record<string, string> = { US: "USD", CA: "CAD", GB: "GBP", IE: "EUR", DE: "EUR", AU: "AUD", NZ: "NZD", IN: "INR" };
const country = await jobber.accountCountryCode();
const currency = country ? COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? `(unmapped country ${country})` : "(unknown)";
console.log(`INFO  account country: ${country ?? "n/a"} -> currency: ${currency}`);

let failures = 0;
for (const check of checks) {
  try {
    console.log(`PASS  ${check.name}: ${await check.run()}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${check.name}: ${(err as Error).message}`);
  }
}
console.log(failures === 0 ? "\nAll live smoke checks passed - queries match the live schema." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
