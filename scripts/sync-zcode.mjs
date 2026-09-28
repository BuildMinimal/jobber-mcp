/**
 * Sync Jobber credentials from .env into the ZCode user MCP config
 * (~/.zcode/cli/config.json → mcp.servers.jobber.env).
 *
 * Run after refreshing tokens with `npm run auth`:
 *
 *   npm run sync:zcode
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEYS = ["JOBBER_CLIENT_ID", "JOBBER_CLIENT_SECRET", "JOBBER_ACCESS_TOKEN", "JOBBER_REFRESH_TOKEN"];

const envPath = join(process.cwd(), ".env");
if (!existsSync(envPath)) {
  console.error("No .env found — run `npm run auth` first.");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^(JOBBER_[A-Z_]+)=(.*)$/);
  if (m && KEYS.includes(m[1]) && m[2].trim()) env[m[1]] = m[2].trim();
}
if (!env.JOBBER_ACCESS_TOKEN && !env.JOBBER_REFRESH_TOKEN) {
  console.error("No token found in .env — run `npm run auth` first.");
  process.exit(1);
}

const cfgPath = join(homedir(), ".zcode", "cli", "config.json");
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
cfg.mcp = cfg.mcp ?? {};
cfg.mcp.servers = cfg.mcp.servers ?? {};
cfg.mcp.servers.jobber = {
  command: "node",
  args: [join(process.cwd(), "dist", "src", "index.js").replace(/\\/g, "/")],
  env: env,
};
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(`Synced ${Object.keys(env).join(", ")} → ${cfgPath}`);
console.log("Restart ZCode (or start a new session) for the new credentials to take effect.");
