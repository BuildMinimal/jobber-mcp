#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { JobberClient } from "./jobber/client.js";
import { registerTools } from "./tools.js";

const cfg = loadConfig();
if (!cfg.accessToken && !cfg.refreshToken) {
  console.error(
    "jobber-mcp: missing Jobber credentials.\n" +
      "Set JOBBER_ACCESS_TOKEN (or JOBBER_REFRESH_TOKEN plus JOBBER_CLIENT_ID/JOBBER_CLIENT_SECRET) " +
      "in the environment or .env, or run `npm run auth` to obtain tokens.\n" +
      "See README.md → Setup.",
  );
  process.exit(1);
}

const server = new McpServer(
  { name: "jobber-mcp", version: "1.0.0" },
  {
    instructions:
      "Read-only access to a Jobber field-service business account: jobs, invoices, quotes, " +
      "scheduled visits, and clients. Prefer the specific tool for the question " +
      "(get_unpaid_invoices for AR, get_schedule for 'what's coming up', get_quotes for the pipeline). " +
      "Dates are YYYY-MM-DD. draft_client_message composes drafts only — nothing is sent to clients " +
      "without explicit human action.",
  },
);

registerTools(server, new JobberClient(cfg), cfg.defaultPageSize, cfg.timezone);

await server.connect(new StdioServerTransport());
