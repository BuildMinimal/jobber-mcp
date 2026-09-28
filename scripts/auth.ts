/**
 * CLI OAuth helper for Jobber — the terminal equivalent of the
 * `authenticate` MCP tool. Shares the same flow (src/jobber/oauth.ts) and
 * persists tokens to ~/.jobber-mcp/tokens.json so the server picks them up
 * automatically on next start.
 *
 *   npm run auth
 *
 * Prerequisites: JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET in .env from a free
 * app at https://developer.getjobber.com (read-only scopes; no callback URL
 * needed — localhost redirects are allowed automatically).
 */
import { loadConfig } from "../src/config.js";
import { runOAuthFlow } from "../src/jobber/oauth.js";
import { saveStoredTokens, tokensFilePath } from "../src/jobber/token-store.js";

const cfg = loadConfig();
if (!cfg.clientId || !cfg.clientSecret) {
  console.error(
    "Set JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET in .env first.\n" +
      "Create an app at https://developer.getjobber.com with read-only scopes\n" +
      "(Clients, Jobs, Quotes, Scheduled Items, Invoices) — no callback URL needed.",
  );
  process.exit(1);
}

console.log("Opening browser for Jobber authorization…\n");
const result = await runOAuthFlow({
  clientId: cfg.clientId,
  clientSecret: cfg.clientSecret,
  authorizeUrl: cfg.authorizeUrl,
  tokenUrl: cfg.tokenUrl,
});

saveStoredTokens({
  accessToken: result.accessToken,
  refreshToken: result.refreshToken,
  clientId: cfg.clientId,
  clientSecret: cfg.clientSecret,
});

const lines = [
  `Success. Tokens saved to ${tokensFilePath()} (picked up automatically on next start).`,
  "",
  "If your MCP client needs them as environment variables instead:",
  "",
  `JOBBER_ACCESS_TOKEN=${result.accessToken}`,
];
if (result.refreshToken) lines.push(`JOBBER_REFRESH_TOKEN=${result.refreshToken}`);
lines.push(`JOBBER_CLIENT_ID=${cfg.clientId}`, `JOBBER_CLIENT_SECRET=${cfg.clientSecret}`);
if (result.expiresInSeconds) {
  lines.push(
    `# access token expires in ~${Math.round(result.expiresInSeconds / 60)} minutes; ` +
      "the server refreshes it automatically using the refresh token",
  );
}
console.log(`\n${lines.join("\n")}\n`);
