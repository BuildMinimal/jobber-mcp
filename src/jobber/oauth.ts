import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

export interface OAuthFlowOptions {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  port?: number;
  scopes?: string;
  /** Skip opening a browser (used when a browser can't be spawned). */
  openBrowser?: boolean;
}

export interface OAuthFlowResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  /** The redirect URI that was used (for reference in messages). */
  redirectUri: string;
}

/**
 * Run the OAuth 2.0 authorization-code flow against Jobber with a localhost
 * callback: open the browser, wait for the redirect, exchange the code.
 * Resolves with tokens; rejects with a readable error.
 */
export async function runOAuthFlow(options: OAuthFlowOptions): Promise<OAuthFlowResult> {
  const port = options.port ?? Number.parseInt(process.env.JOBBER_CALLBACK_PORT ?? "7331", 10);
  const redirectUri = `http://localhost:${port}/oauth/callback`;
  const state = randomUUID();

  const authorize = new URL(options.authorizeUrl);
  authorize.searchParams.set("client_id", options.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  if (options.scopes) authorize.searchParams.set("scope", options.scopes);

  if (options.openBrowser !== false) openBrowser(authorize.toString());

  const code = await waitForCode(port, state, TEN_MINUTES_MS);
  const tokens = await exchangeCode(options, code, redirectUri);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresInSeconds: tokens.expires_in,
    redirectUri,
  };
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function exchangeCode(
  options: OAuthFlowOptions,
  code: string,
  redirectUri: string,
): Promise<TokenResponse & { access_token: string }> {
  const response = await fetch(options.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(
      `Jobber rejected the token exchange (${response.status}): ${body.error ?? "unknown error"} ` +
        `${body.error_description ?? ""}`.trim(),
    );
  }
  return { ...body, access_token: body.access_token };
}

function waitForCode(port: number, expectedState: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for the Jobber authorization redirect (port ${port}). Re-run and complete the login in the browser.`));
    }, timeoutMs);

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
        cleanup();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400).end("Missing code parameter");
        return;
      }
      if (returnedState !== expectedState) {
        res.writeHead(400).end("State mismatch — possible CSRF, retry");
        cleanup();
        reject(new Error("OAuth state mismatch"));
        return;
      }
      res.end("Connected! You can close this tab and return to your assistant.");
      cleanup();
      resolve(code);
    });

    const cleanup = () => {
      clearTimeout(timer);
      srv.close();
    };

    srv.setTimeout(timeoutMs);
    srv.listen(port, "localhost");
    srv.on("error", (err) => {
      cleanup();
      reject(
        new Error(
          `Could not listen on localhost port ${port}: ${err.message}. ` +
            "Close whatever is using it or set JOBBER_CALLBACK_PORT.",
        ),
      );
    });
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
