/**
 * Offline end-to-end test: spins up a mock Jobber GraphQL API, connects the
 * real MCP server through an in-memory transport, and calls every tool.
 * No token, network, or Jobber account needed.
 *
 *   npm run test:wiring
 *
 * Fixture shapes mirror the verified live schema (version 2026-05-12):
 * jobNumber: Int, jobStatus/invoiceStatus/quoteStatus (lowercase enums),
 * visitStatus (UPPERCASE), amounts { total, invoiceBalance } as Floats,
 * invoice.jobs as a connection.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function isoTs(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}
const amounts = (total: string, balance: string) => ({
  total: Number(total),
  invoiceBalance: Number(balance),
  paymentsTotal: Number(total) - Number(balance),
});

// Fixture data keyed by GraphQL operationName. Dates are relative to "today"
// so overdue/schedule logic always has something to chew on.
const responses: Record<string, unknown> = {
  // Non-US country on purpose: proves money formatting follows the account,
  // not a hardcoded "$" (DE -> EUR -> €)
  Account: { account: { countryCode: "DE" } },
  SearchJobs: {
    jobs: {
      totalCount: 3,
      nodes: [
        { id: "j1", jobNumber: 101, title: "Kitchen faucet repair", jobStatus: "active", createdAt: isoTs(-10), updatedAt: isoTs(-2), client: { id: "c1", name: "Dana Smith" } },
        { id: "j2", jobNumber: 102, title: "Backyard fence install", jobStatus: "unscheduled", createdAt: isoTs(-5), updatedAt: isoTs(-5), client: { id: "c2", name: "Riverside Cafe" } },
        { id: "j3", jobNumber: 103, title: "Gutter cleaning", jobStatus: "requires_invoicing", createdAt: isoTs(-1), updatedAt: isoTs(-1), client: { id: "c1", name: "Dana Smith" } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
  Invoices: {
    invoices: {
      totalCount: 3,
      nodes: [
        { id: "i1", invoiceNumber: "1001", invoiceStatus: "past_due", issuedDate: isoDay(-40), dueDate: isoDay(-12), amounts: amounts("400.00", "250.00"), client: { id: "c1", name: "Dana Smith" }, jobs: { nodes: [{ id: "j1", jobNumber: 101, title: "Kitchen faucet repair" }] } },
        { id: "i2", invoiceNumber: "1002", invoiceStatus: "awaiting_payment", issuedDate: isoDay(-10), dueDate: isoDay(-3), amounts: amounts("90.00", "90.00"), client: { id: "c2", name: "Riverside Cafe" }, jobs: { nodes: [{ id: "j2", jobNumber: 102, title: "Backyard fence install" }] } },
        { id: "i3", invoiceNumber: "1003", invoiceStatus: "paid", issuedDate: isoDay(-30), dueDate: isoDay(-15), amounts: amounts("120.00", "0.00"), client: { id: "c1", name: "Dana Smith" }, jobs: { nodes: [{ id: "j3", jobNumber: 103, title: "Gutter cleaning" }] } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
  Client: {
    client: {
      id: "c1",
      name: "Dana Smith",
      firstName: "Dana",
      lastName: "Smith",
      companyName: null,
      isCompany: false,
      isLead: false,
      email: "dana@example.com",
      phone: "+1-555-0100",
      balance: 250,
      createdAt: isoTs(-300),
      jobberWebUri: "https://myjobber.com/clients/c1",
      jobs: {
        nodes: [
          { id: "j1", jobNumber: 101, title: "Kitchen faucet repair", jobStatus: "active", createdAt: isoTs(-10) },
          { id: "j3", jobNumber: 103, title: "Gutter cleaning", jobStatus: "requires_invoicing", createdAt: isoTs(-1) },
        ],
      },
      invoices: {
        nodes: [
          { id: "i1", invoiceNumber: "1001", invoiceStatus: "past_due", issuedDate: isoDay(-40), dueDate: isoDay(-12), amounts: amounts("400.00", "250.00") },
          { id: "i3", invoiceNumber: "1003", invoiceStatus: "paid", issuedDate: isoDay(-30), dueDate: isoDay(-15), amounts: amounts("120.00", "0.00") },
        ],
      },
    },
  },
  Visits: {
    visits: {
      totalCount: 3,
      nodes: [
        { id: "v1", title: "Faucet repair — on site", startAt: `${isoDay(1)}T14:00:00Z`, endAt: `${isoDay(1)}T15:30:00Z`, allDay: false, visitStatus: "UPCOMING", isComplete: false, instructions: null, job: { id: "j1", jobNumber: 101, title: "Kitchen faucet repair", client: { id: "c1", name: "Dana Smith" } } },
        { id: "v2", title: "Fence install — day 1", startAt: `${isoDay(3)}T09:00:00Z`, endAt: `${isoDay(3)}T17:00:00Z`, allDay: false, visitStatus: "UPCOMING", isComplete: false, instructions: null, job: { id: "j2", jobNumber: 102, title: "Backyard fence install", client: { id: "c2", name: "Riverside Cafe" } } },
        { id: "v3", title: "Old visit (filtered by server-side range)", startAt: `${isoDay(-20)}T09:00:00Z`, endAt: `${isoDay(-20)}T10:00:00Z`, allDay: false, visitStatus: "COMPLETED", isComplete: true, instructions: null, job: { id: "j3", jobNumber: 103, title: "Gutter cleaning", client: { id: "c1", name: "Dana Smith" } } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
  Quotes: {
    quotes: {
      totalCount: 3,
      nodes: [
        { id: "q1", quoteNumber: "5001", quoteStatus: "approved", title: "Faucet repair quote", createdAt: isoTs(-20), sentAt: isoTs(-19), amounts: { total: 400 }, client: { id: "c1", name: "Dana Smith" }, jobs: { nodes: [{ id: "j1", jobNumber: 101, title: "Kitchen faucet repair" }] } },
        { id: "q2", quoteNumber: "5002", quoteStatus: "awaiting_response", title: "Fence install quote", createdAt: isoTs(-6), sentAt: isoTs(-5), amounts: { total: 1500 }, client: { id: "c2", name: "Riverside Cafe" }, jobs: { nodes: [{ id: "j2", jobNumber: 102, title: "Backyard fence install" }] } },
        { id: "q3", quoteNumber: "5003", quoteStatus: "draft", title: "Gutter cleaning quote", createdAt: isoTs(-2), sentAt: null, amounts: { total: 300 }, client: { id: "c1", name: "Dana Smith" }, jobs: { nodes: [] } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
  Invoice: {
    invoice: {
      id: "i1",
      invoiceNumber: "1001",
      invoiceStatus: "past_due",
      issuedDate: isoDay(-40),
      dueDate: isoDay(-12),
      amounts: amounts("400.00", "250.00"),
      client: { id: "c1", name: "Dana Smith" },
      jobs: { nodes: [{ id: "j1", jobNumber: 101, title: "Kitchen faucet repair" }] },
    },
  },
};

/* --- mock Jobber GraphQL API --- */
let sawBearerToken = false;
const mock: Server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    sawBearerToken = (req.headers.authorization ?? "").startsWith("Bearer ");
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      query?: string;
      operationName?: string | null;
      variables?: Record<string, unknown>;
    };
    const opName = body.operationName ?? /query\s+(\w+)/.exec(body.query ?? "")?.[1] ?? "";
    // honor the id variable for single-record lookups, like the real API
    const knownIds: Record<string, string> = { Client: "c1", Invoice: "i1" };
    let data: unknown =
      opName in knownIds && body.variables?.id !== knownIds[opName]
        ? { [opName.toLowerCase()]: null }
        : responses[opName] ?? {};
    // honor the server-side visit range filter, like the real API
    const range = (body.variables?.filter as { startAt?: { after?: string; before?: string } } | undefined)?.startAt;
    if (opName === "Visits" && range) {
      const cloned = JSON.parse(JSON.stringify(responses.Visits)) as { visits: { nodes: Array<{ startAt: string }> } };
      cloned.visits.nodes = cloned.visits.nodes.filter(
        (v) => (!range.after || v.startAt >= range.after) && (!range.before || v.startAt < range.before),
      );
      data = cloned;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data }));
  });
});
await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
const port = (mock.address() as AddressInfo).port;

// env must be set before importing config-driven modules
process.env.JOBBER_API_URL = `http://127.0.0.1:${port}/api/graphql`;
process.env.JOBBER_ACCESS_TOKEN = "wiring-test-token";

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { loadConfig } = await import("../src/config.js");
const { JobberClient } = await import("../src/jobber/client.js");
const { registerTools } = await import("../src/tools.js");

const config = loadConfig();
const server = new McpServer({ name: "jobber-mcp", version: "0.0.0-test" });
registerTools(server, new JobberClient(config), config.defaultPageSize, config.timezone);

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "wiring-test", version: "0.0.0" });
await client.connect(clientTransport);

interface Case {
  name: string;
  args: Record<string, unknown>;
  expect: string;
  notExpect?: string;
  /** set when the correct outcome is a tool error carrying this message */
  expectError?: boolean;
}
const cases: Case[] = [
  { name: "search_jobs", args: { limit: 10 }, expect: "Kitchen faucet repair" },
  { name: "search_jobs", args: { status: "active" }, expect: "101", notExpect: "Gutter cleaning" },
  { name: "search_jobs", args: { client_id: "c1", created_after: isoDay(-2) }, expect: "Gutter cleaning", notExpect: "faucet" },
  { name: "search_jobs", args: { search: "fence" }, expect: "Backyard fence install" },
  { name: "get_unpaid_invoices", args: {}, expect: "€250.00", notExpect: "1003" },
  { name: "get_client_details", args: { client_id: "c1" }, expect: "Dana Smith" },
  { name: "get_client_details", args: { client_id: "nope" }, expect: "No client found", expectError: true },
  { name: "get_schedule", args: {}, expect: "Faucet repair", notExpect: "filtered by server-side range" },
  { name: "get_quotes", args: {}, expect: "awaiting_response" },
  { name: "get_quotes", args: { status: "draft" }, expect: "300.00", notExpect: "approved" },
  {
    name: "draft_client_message",
    args: { purpose: "payment_reminder", channel: "email", client_id: "c1", invoice_id: "i1", tone: "polite but firm" },
    expect: "NOT SENT",
  },
];

let failures = 0;
for (const c of cases) {
  try {
    const result = await client.callTool({ name: c.name, arguments: c.args });
    const text = ((result.content as Array<{ type: string; text?: string }>) ?? [])
      .map((b) => b.text ?? "")
      .join("\n");
    const passed =
      (c.expectError ? result.isError === true : result.isError !== true) &&
      (!c.expect || text.includes(c.expect)) &&
      (!c.notExpect || !text.includes(c.notExpect));
    console.log(`${passed ? "PASS" : "FAIL"}  ${c.name} ${JSON.stringify(c.args)}`);
    if (!passed) {
      failures++;
      console.log(`      expected to contain: ${JSON.stringify(c.expect)}` + (c.notExpect ? `, not: ${JSON.stringify(c.notExpect)}` : ""));
      console.log(text.slice(0, 800).split("\n").map((l) => `      | ${l}`).join("\n"));
    }
  } catch (err) {
    failures++;
    console.log(`ERROR ${c.name}: ${(err as Error).message}`);
  }
}

mock.close();
if (!sawBearerToken) {
  failures++;
  console.log("FAIL  mock Jobber API never received a Bearer token");
}

console.log(failures === 0 ? `\nAll ${cases.length} wiring cases passed.` : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
