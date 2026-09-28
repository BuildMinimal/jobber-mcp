import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal .env loader — zero dependencies, never overrides real env vars. */
function loadDotEnv(): void {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadDotEnv();

export interface Config {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  /** API origin, e.g. https://api.getjobber.com */
  apiOrigin: string;
  /** Value for the required X-JOBBER-GRAPHQL-VERSION header */
  apiVersion: string;
  graphqlUrl: string;
  tokenUrl: string;
  authorizeUrl: string;
  defaultPageSize: number;
}

export function loadConfig(): Config {
  const apiOrigin = (process.env.JOBBER_API_ORIGIN ?? "https://api.getjobber.com").replace(/\/+$/, "");
  return {
    accessToken: process.env.JOBBER_ACCESS_TOKEN,
    refreshToken: process.env.JOBBER_REFRESH_TOKEN,
    clientId: process.env.JOBBER_CLIENT_ID,
    clientSecret: process.env.JOBBER_CLIENT_SECRET,
    apiOrigin,
    apiVersion: process.env.JOBBER_API_VERSION ?? "2026-05-12",
    graphqlUrl: process.env.JOBBER_API_URL ?? `${apiOrigin}/api/graphql`,
    tokenUrl: process.env.JOBBER_TOKEN_URL ?? `${apiOrigin}/oauth/token`,
    authorizeUrl: process.env.JOBBER_AUTHORIZE_URL ?? `${apiOrigin}/oauth/authorize`,
    defaultPageSize: clampInt(process.env.JOBBER_PAGE_SIZE, 1, 100, 25),
  };
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
