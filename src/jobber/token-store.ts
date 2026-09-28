import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Local token storage (~/.jobber-mcp/tokens.json) so credentials survive
 * restarts without environment variables — used by the `authenticate` tool
 * and the Claude Desktop extension. Stays on the user's machine; never
 * leaves it except in requests to Jobber's own API.
 */
export interface StoredTokens {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  obtainedAt?: string;
}

const storeDir = join(homedir(), ".jobber-mcp");
const storeFile = join(storeDir, "tokens.json");

export function tokensFilePath(): string {
  return storeFile;
}

export function loadStoredTokens(): StoredTokens {
  try {
    return JSON.parse(readFileSync(storeFile, "utf8")) as StoredTokens;
  } catch {
    return {};
  }
}

export function saveStoredTokens(tokens: StoredTokens): void {
  try {
    mkdirSync(storeDir, { recursive: true });
    writeFileSync(storeFile, JSON.stringify({ ...tokens, obtainedAt: new Date().toISOString() }, null, 2), {
      mode: 0o600,
    });
  } catch (err) {
    console.error(`[jobber-mcp] could not persist tokens to ${storeFile}: ${(err as Error).message}`);
  }
}

export function storedTokensExist(): boolean {
  return existsSync(storeFile);
}
