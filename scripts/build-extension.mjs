/**
 * Build a Claude Desktop extension (.mcpb) — a single-file, double-clickable
 * install of this server for non-technical users. The bundle is a zip
 * containing manifest.json, icon.png, and an esbuild-bundled single-file
 * server (Claude Desktop ships its own Node runtime, so users install
 * nothing else).
 *
 *   npm run build:extension
 *
 * Output: dist/jobber-mcp.mcpb
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "fflate";
import { fileURLToPath } from "node:url";

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const pkg = JSON.parse(readFileSync(path("../package.json"), "utf8"));
const outDir = path("../dist/extension");

mkdirSync(outDir, { recursive: true });

// 1. Bundle the server to a single file
await build({
  entryPoints: [path("../src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: `${outDir}/bundle.js`,
  legalComments: "none",
  logLevel: "info",
});

// 2. Extension manifest (Claude Desktop format)
const manifest = {
  dxt_version: "0.1",
  name: "jobber",
  display_name: "Jobber",
  version: pkg.version,
  description:
    "Ask your assistant about your Jobber business: overdue invoices, this week's schedule, quote pipeline, jobs and clients. Read-only — nothing can be changed.",
  author: { name: "buildminimal" },
  homepage_url: pkg.homepage,
  icon: "icon.png",
  server: {
    type: "node",
    entry_point: "bundle.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/bundle.js"],
      env: {},
    },
  },
  tools: [
    { name: "authenticate", description: "Connect your Jobber account (one time, via browser)" },
    { name: "search_jobs", description: "Find jobs by client, status, or date" },
    { name: "get_unpaid_invoices", description: "Overdue invoices and total outstanding" },
    { name: "get_client_details", description: "Client profile, balance, history" },
    { name: "get_schedule", description: "Visits in a date range" },
    { name: "get_quotes", description: "Quote pipeline by status" },
    { name: "draft_client_message", description: "Draft a payment reminder (never sends)" },
  ],
};
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));

// 3. Icon: generated 128x128 PNG (indigo field, white diagonal band) —
//    replace dist/extension/icon.png or edit drawIcon() to rebrand.
const iconPng = makeIcon();
writeFileSync(`${outDir}/icon.png`, iconPng);

// 4. Package as .mcpb (zip format with STORE for small files)
const files = {
  "manifest.json": Buffer.from(JSON.stringify(manifest, null, 2)),
  "icon.png": iconPng,
  "bundle.js": readFileSync(`${outDir}/bundle.js`),
};
const mcpb = zip(files);
const outPath = path("../dist/jobber-mcp.mcpb");
writeFileSync(outPath, mcpb);
console.log(`\nExtension written: ${outPath} (${(mcpb.length / 1024).toFixed(1)} KB)`);
console.log("Install in Claude Desktop: Settings → Extensions → Install extension → select the .mcpb file.");

/* ---- minimal zip writer (STORE method) ---- */
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ---- generated icon ---- */
function makeIcon() {
  const W = 128;
  const rgba = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // rounded-corner indigo field
      const r = 28;
      const cx = Math.min(Math.max(x, r), W - r);
      const cy = Math.min(Math.max(y, r), W - r);
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      // white diagonal band (like a wrench slash)
      const d = Math.abs(x + y - W);
      const band = d < 26 && x > 18 && y > 18 && x < W - 18 && y < W - 18;
      if (band && inside) {
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255;
      } else if (inside) {
        rgba[i] = 0x4f; rgba[i + 1] = 0x46; rgba[i + 2] = 0xe5; rgba[i + 3] = 255;
      } else {
        rgba[i + 3] = 0;
      }
    }
  }
  return encodePng(W, W, rgba);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibDeflate(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function zlibDeflate(buf) {
  return Buffer.from(deflateSync(buf));
}
