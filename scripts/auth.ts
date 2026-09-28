/**
 * Local OAuth 2.0 helper for Jobber.
 *
 * 1. Create a developer account + app at https://developer.getjobber.com
 * 2. Enable read-only scopes (Clients, Jobs, Quotes, Scheduled Items,
 *    Invoices). Leave the Callback URL blank — Jobber allows localhost
 *    redirects automatically on any port (RFC 8252 loopback).
 * 3. Put JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET in .env
 * 4. Run: npm run auth
 *
 * Prints an access (and refresh) token to paste into .env or your MCP
 * client config. Tokens stay on this machine — nothing is uploaded.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { loadConfig } from "../src/config.js";

const cfg = loadConfig();
if (!cfg.clientId || !cfg.clientSecret) {
  console.error(
    "Set JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET in .env first.\n" +
      "Create an app at https://developer.getjobber.com and add redirect URI\n" +
      "http://localhost:7331/oauth/callback to it.",
  );
  process.exit(1);
}

const port = Number.parseInt(process.env.JOBBER_CALLBACK_PORT ?? "7331", 10);
const redirectUri = `http://localhost:${port}/oauth/callback`;
const state = randomUUID();

const authUrl = new URL(cfg.authorizeUrl);
authUrl.searchParams.set("client_id", cfg.clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("state", state);
const scopes = process.env.JOBBER_SCOPES;
if (scopes) authUrl.searchParams.set("scope", scopes);

console.log(
  `Opening browser for Jobber authorization…\n\n  ${authUrl.toString()}\n\n` +
    `If the browser does not open, visit the URL above.\n` +
    `Localhost callbacks are allowed automatically by Jobber — no registration needed (using ${redirectUri}).\n`,
);
openBrowser(authUrl.toString());

const code = await waitForCode(port, state);
console.log("Authorization code received — exchanging for tokens…");

const tokenRes = await fetch(cfg.tokenUrl, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
  }),
});
const tokens = (await tokenRes.json()) as Record<string, unknown>;

if (!tokenRes.ok || typeof tokens.access_token !== "string") {
  console.error(`Token exchange failed (${tokenRes.status}):\n${JSON.stringify(tokens, null, 2)}`);
  process.exit(1);
}

const lines = [
  "Success. Add these to your .env (and MCP client env):",
  "",
  `JOBBER_ACCESS_TOKEN=${tokens.access_token}`,
];
if (typeof tokens.refresh_token === "string") {
  lines.push(`JOBBER_REFRESH_TOKEN=${tokens.refresh_token}`);
}
if (typeof tokens.expires_in !== "undefined") {
  lines.push(
    `# token expires in ~${Math.round(Number(tokens.expires_in) / 60)} minutes; keep JOBBER_CLIENT_ID/JOBBER_CLIENT_SECRET ` +
      `+ the refresh token set for automatic renewal`,
  );
}
console.log(`\n${lines.join("\n")}\n`);

function waitForCode(port: number, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/oauth/callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      if (error) {
        res.end(`Authorization failed: ${error}`);
        srv.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400).end("Missing code parameter");
        return;
      }
      if (returnedState !== expectedState) {
        res.writeHead(400).end("State mismatch — possible CSRF, retry the script");
        srv.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }
      res.end("Authorized! You can close this tab and return to your terminal.");
      srv.close();
      resolve(code);
    });
    srv.listen(port, "localhost");
    srv.on("error", (err) =>
      reject(
        new Error(
          `Could not listen on port ${port}: ${err.message}. ` +
            "Set JOBBER_CALLBACK_PORT to a free port and update your app's redirect URI.",
        ),
      ),
    );
  });
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  spawnSync(cmd, { shell: true, stdio: "ignore" });
}
