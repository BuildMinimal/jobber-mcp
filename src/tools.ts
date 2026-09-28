import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JobberApiError, JobberClient } from "./jobber/client.js";
import {
  INVOICE_STATUSES,
  JOB_STATUSES,
  QUOTE_STATUSES,
  queries,
  type ClientData,
  type InvoiceData,
  type InvoicesData,
  type JobsData,
  type QuotesData,
  type VisitsData,
} from "./jobber/queries.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

function errorMessage(err: unknown): string {
  if (err instanceof JobberApiError) {
    const schemaHint = /field|type|argument|variable|schema|selection/i.test(err.message)
      ? "\n\nHint: the live Jobber schema may differ from this build. Run `npm run introspect` with a valid token and align src/jobber/queries.ts - it is the single place queries live."
      : "";
    return `Jobber API error: ${err.message}${schemaHint}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/* ---------- small helpers ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string | undefined, label: string): Date | undefined {
  if (value === undefined || value === "") return undefined;
  if (!DATE_RE.test(value)) throw new Error(`${label} must be a YYYY-MM-DD date, got: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

const day = (d: Date): string => d.toISOString().slice(0, 10);

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Currency follows the Jobber account (derived from account.countryCode -
 * the API exposes no direct currency field). The formatter is initialized
 * lazily on the first money-formatting tool call; on failure it falls back
 * to a plain number so tools still work.
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", UK: "GBP", IE: "EUR",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR",
  AT: "EUR", PT: "EUR", FI: "EUR", GR: "EUR", SK: "EUR", SI: "EUR",
  LT: "EUR", LV: "EUR", EE: "EUR", HR: "EUR", CY: "EUR", LU: "EUR", MT: "EUR",
  AU: "AUD", NZ: "NZD", IN: "INR", ZA: "ZAR", SG: "SGD", AE: "AED",
  PH: "PHP", MY: "MYR", MX: "MXN", BR: "BRL", JP: "JPY",
};

let accountFormatter: Intl.NumberFormat | null = null;
let accountFormatterReady = false;

async function ensureCurrency(jobber: JobberClient): Promise<void> {
  if (accountFormatterReady) return;
  const country = await jobber.accountCountryCode();
  const currency = country ? COUNTRY_TO_CURRENCY[country.toUpperCase()] : undefined;
  accountFormatter = currency ? new Intl.NumberFormat("en-US", { style: "currency", currency }) : null;
  accountFormatterReady = true;
}

const fmtMoney = (v: number | null | undefined): string =>
  v == null ? "n/a" : accountFormatter ? accountFormatter.format(v) : `$${v.toFixed(2)}`;

const moneyNum = (v: number | null | undefined): number => v ?? 0;

const statusOf = (s: unknown): string => (s == null || s === "" ? "unknown" : String(s));

const shortDate = (iso: string | null | undefined): string =>
  iso != null ? iso.slice(0, 10) : "?";

/** Visit timestamp in the configured local timezone (or UTC when unset). */
function stampInTz(iso: string, timezone?: string): string {
  if (!timezone) return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dtf.format(new Date(iso))} ${timezone}`;
}

/** Calendar day of an instant in the configured local timezone (or UTC when unset). */
function dayInTz(iso: string, timezone?: string): string {
  if (!timezone) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** RFC3339 timestamp for a UTC day start. */
const isoDayStart = (d: Date): string => `${day(d)}T00:00:00Z`;

/* ---------- registration ---------- */

export function registerTools(
  server: McpServer,
  jobber: JobberClient,
  defaultPageSize: number,
  timezone?: string,
): void {
  /* ----- search_jobs ----- */
  server.registerTool(
    "search_jobs",
    {
      title: "Search jobs",
      description:
        "Search Jobber jobs (work orders) with job number, title, status, client and created/updated dates. " +
        `Server-side filters: status (one of: ${JOB_STATUSES.join(", ")}), created_after / created_before ` +
        "(YYYY-MM-DD), and free-text search across job fields. Filter by client locally with client_id. " +
        `Returns up to limit results (default ${defaultPageSize}, max 100) plus a cursor when more pages exist.`,
      inputSchema: {
        search: z.string().optional().describe("Free-text search term (job title, etc.)"),
        status: z.string().optional().describe(`One of: ${JOB_STATUSES.join(", ")}`),
        client_id: z.string().optional().describe("Jobber client ID to restrict results to (local filter)"),
        created_after: z.string().optional().describe("Only jobs created on/after this date (YYYY-MM-DD)"),
        created_before: z.string().optional().describe("Only jobs created on/before this date (YYYY-MM-DD)"),
        limit: z.number().int().min(1).max(100).optional().describe(`Page size (default ${defaultPageSize})`),
        cursor: z.string().optional().describe("Pagination cursor from a previous search_jobs result"),
      },
    },
    async (args) => {
      try {
        if (args.status && !JOB_STATUSES.includes(args.status as never)) {
          return fail(`Invalid status "${args.status}". Valid values: ${JOB_STATUSES.join(", ")}`);
        }
        const after = parseDay(args.created_after, "created_after");
        const before = parseDay(args.created_before, "created_before");
        const first = args.limit ?? defaultPageSize;

        const filter: Record<string, unknown> = {};
        if (args.status) filter.status = args.status;
        if (after || before) {
          filter.createdAt = {
            ...(after ? { after: isoDayStart(after) } : {}),
            ...(before ? { before: isoDayStart(addDays(before, 1)) } : {}),
          };
        }
        const variables: Record<string, unknown> = { first, after: args.cursor };
        if (Object.keys(filter).length > 0) variables.filter = filter;
        if (args.search) variables.searchTerm = args.search;

        const data = await jobber.graphql<JobsData>(queries.searchJobs, variables);

        let nodes = data.jobs?.nodes ?? [];
        if (args.client_id) nodes = nodes.filter((n) => n.client?.id === args.client_id);
        // safety net for the unfiltered fallback path
        if (args.status) nodes = nodes.filter((n) => statusOf(n.jobStatus) === args.status);
        if (after) nodes = nodes.filter((n) => n.createdAt != null && new Date(n.createdAt) >= after);
        if (before) {
          nodes = nodes.filter((n) => n.createdAt != null && new Date(n.createdAt) < addDays(before, 1));
        }

        const total = data.jobs?.totalCount;
        if (nodes.length === 0) {
          return ok(
            total ? `No jobs matched (account has ${total} total). Try dropping filters.` : "No jobs matched.",
          );
        }

        const rows = nodes.map(
          (n) =>
            `#${n.jobNumber ?? n.id} - ${n.title ?? "untitled"} - ${statusOf(n.jobStatus)} - ` +
            `${n.client?.name ?? "no client"} - created ${shortDate(n.createdAt)}`,
        );
        let text = `Jobs (${nodes.length}${total ? ` of ${total}` : ""}):\n${rows.join("\n")}`;
        const pageInfo = data.jobs?.pageInfo;
        if (pageInfo?.hasNextPage && pageInfo.endCursor) {
          text += `\n\nMore results available - pass cursor: ${pageInfo.endCursor}`;
        }
        return ok(text);
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  /* ----- get_unpaid_invoices ----- */
  server.registerTool(
    "get_unpaid_invoices",
    {
      title: "Get unpaid invoices",
      description:
        "List invoices with a balance owing (status past_due / awaiting_payment), sorted oldest-due first, " +
        "with days overdue and the total outstanding. Use for accounts-receivable questions like " +
        '"which invoices are overdue?". Scans the most recent invoices (default 50) and filters on balance.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("How many recent invoices to scan (default 50)"),
      },
    },
    async (args) => {
      try {
        await ensureCurrency(jobber);
        const data = await jobber.graphql<InvoicesData>(queries.invoices, {
          first: args.limit ?? 50,
          sort: [{ key: "DUE_DATE", direction: "DESCENDING" }],
        });
        const all = data.invoices?.nodes ?? [];
        const owing = all
          .filter((n) => moneyNum(n.amounts?.invoiceBalance) > 0)
          .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

        if (owing.length === 0) {
          return ok(`No invoices with a balance owing among the ${all.length} most recent scanned.`);
        }

        const today = todayUtc();
        const totalOutstanding = owing.reduce((sum, n) => sum + moneyNum(n.amounts?.invoiceBalance), 0);
        const lines = owing.map((n) => {
          const dueDate = n.dueDate ? new Date(`${n.dueDate.slice(0, 10)}T00:00:00Z`) : null;
          const daysLate = dueDate && dueDate < today ? daysBetween(dueDate, today) : 0;
          const flag = dueDate && dueDate < today ? `OVERDUE ${daysLate}d` : "CURRENT";
          return (
            `${flag} [${statusOf(n.invoiceStatus)}] - INV ${n.invoiceNumber ?? n.id} - ` +
            `${n.client?.name ?? "no client"} - owing ${fmtMoney(n.amounts?.invoiceBalance)} of ` +
            `${fmtMoney(n.amounts?.total)} - due ${shortDate(n.dueDate)}`
          );
        });
        return ok(
          `${owing.length} invoice(s) with a balance owing, ${fmtMoney(totalOutstanding)} total outstanding ` +
            `(scanned ${all.length} most recent):\n${lines.join("\n")}`,
        );
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  /* ----- get_client_details ----- */
  server.registerTool(
    "get_client_details",
    {
      title: "Get client details",
      description:
        "Full profile for one client by Jobber client_id: name, email/phone, outstanding balance, member-since, " +
        "recent jobs and recent invoices. Find the client_id first via search_jobs (results include client ids) " +
        "when you only know the name.",
      inputSchema: {
        client_id: z.string().describe("Jobber client ID"),
      },
    },
    async (args) => {
      try {
        await ensureCurrency(jobber);
        const data = await jobber.graphql<ClientData>(queries.clientById, { id: args.client_id });
        const c = data.client;
        if (!c) return fail(`No client found with id ${args.client_id}.`);

        const name =
          c.isCompany
            ? c.companyName ?? c.name ?? "unknown"
            : c.name ?? ([c.firstName, c.lastName].filter(Boolean).join(" ") || "unknown");

        const lines: string[] = [
          `Client ${c.id}: ${name}${c.isLead ? " (lead)" : ""} - since ${shortDate(c.createdAt)}`,
          `Outstanding balance: ${fmtMoney(c.balance)}`,
          `Contact: ${c.email ?? "no email"} | ${c.phone ?? "no phone"}`,
        ];
        if (c.jobberWebUri) lines.push(`Open in Jobber: ${c.jobberWebUri}`);
        const jobs = c.jobs?.nodes ?? [];
        if (jobs.length > 0) {
          lines.push(`\nRecent jobs (${jobs.length}):`);
          for (const j of jobs) {
            lines.push(`  #${j.jobNumber ?? j.id} - ${j.title ?? "untitled"} - ${statusOf(j.jobStatus)} - ${shortDate(j.createdAt)}`);
          }
        }
        const invoices = c.invoices?.nodes ?? [];
        if (invoices.length > 0) {
          lines.push(`\nRecent invoices (${invoices.length}):`);
          for (const i of invoices) {
            lines.push(
              `  INV ${i.invoiceNumber ?? i.id} [${statusOf(i.invoiceStatus)}] - due ${shortDate(i.dueDate)} - ` +
                `owing ${fmtMoney(i.amounts?.invoiceBalance)} of ${fmtMoney(i.amounts?.total)}`,
            );
          }
        }
        return ok(lines.join("\n"));
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  /* ----- get_schedule ----- */
  server.registerTool(
    "get_schedule",
    {
      title: "Get schedule",
      description:
        "Visits/appointments in a date range (default today through +7 days), sorted by start time, with the " +
        "job and client for each. Dates are YYYY-MM-DD. Filtering happens server-side on visit start time.",
      inputSchema: {
        from: z.string().optional().describe("Range start, YYYY-MM-DD (default today)"),
        to: z.string().optional().describe("Range end inclusive, YYYY-MM-DD (default from + 7 days)"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size (default 50)"),
        cursor: z.string().optional().describe("Pagination cursor from a previous get_schedule result"),
      },
    },
    async (args) => {
      try {
        const from = parseDay(args.from, "from") ?? todayUtc();
        const to = parseDay(args.to, "to") ?? addDays(from, 7);
        if (to < from) return fail("`to` must be on or after `from`.");

        const data = await jobber.graphql<VisitsData>(queries.visits, {
          first: args.limit ?? 50,
          after: args.cursor,
          filter: {
            startAt: { after: isoDayStart(from), before: isoDayStart(addDays(to, 1)) },
          },
          sort: [{ key: "START_AT", direction: "ASCENDING" }],
        });

        const rangeEnd = addDays(to, 1);
        const nodes = (data.visits?.nodes ?? [])
          .filter((v) => {
            if (v.startAt == null) return false;
            const start = new Date(v.startAt);
            return start >= from && start < rangeEnd;
          })
          .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));

        const total = data.visits?.totalCount;
        if (nodes.length === 0) {
          return ok(`No visits scheduled between ${day(from)} and ${day(to)}.`);
        }

        const rows = nodes.map(
          (v) =>
            `${v.allDay ? dayInTz(v.startAt!, timezone) : stampInTz(v.startAt!, timezone)} - ${v.title ?? "visit"} - ` +
            `${statusOf(v.visitStatus)}${v.isComplete ? " (complete)" : ""} - ` +
            `job #${v.job?.jobNumber ?? "?"} ${v.job?.title ?? ""} (${v.job?.client?.name ?? "no client"})`,
        );
        let text = `Schedule ${day(from)} → ${day(to)} (${nodes.length} visit(s)${total ? ` of ${total}` : ""}):\n${rows.join("\n")}`;
        const pageInfo = data.visits?.pageInfo;
        if (pageInfo?.hasNextPage && pageInfo.endCursor) {
          text += `\n\nMore results available - pass cursor: ${pageInfo.endCursor}`;
        }
        return ok(text);
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  /* ----- get_quotes ----- */
  server.registerTool(
    "get_quotes",
    {
      title: "Get quotes",
      description:
        "Quote pipeline grouped by status, with quote number, client, total, and job. Use for pipeline " +
        `questions like "which quotes are awaiting a response?". Optional server-side filters: status ` +
        `(one of: ${QUOTE_STATUSES.join(", ")}) and client_id.`,
      inputSchema: {
        status: z.string().optional().describe(`One of: ${QUOTE_STATUSES.join(", ")}`),
        client_id: z.string().optional().describe("Jobber client ID"),
        limit: z.number().int().min(1).max(100).optional().describe(`Page size (default ${defaultPageSize})`),
        cursor: z.string().optional().describe("Pagination cursor from a previous get_quotes result"),
      },
    },
    async (args) => {
      try {
        await ensureCurrency(jobber);
        if (args.status && !QUOTE_STATUSES.includes(args.status as never)) {
          return fail(`Invalid status "${args.status}". Valid values: ${QUOTE_STATUSES.join(", ")}`);
        }
        const filter: Record<string, unknown> = {};
        if (args.status) filter.status = args.status;
        if (args.client_id) filter.clientId = args.client_id;
        const variables: Record<string, unknown> = { first: args.limit ?? defaultPageSize, after: args.cursor };
        if (Object.keys(filter).length > 0) variables.filter = filter;

        const data = await jobber.graphql<QuotesData>(queries.quotes, variables);
        let nodes = data.quotes?.nodes ?? [];
        // safety net for the unfiltered fallback path
        if (args.status) nodes = nodes.filter((n) => statusOf(n.quoteStatus) === args.status);
        if (args.client_id) nodes = nodes.filter((n) => n.client?.id === args.client_id);
        if (nodes.length === 0) return ok("No quotes found for the given filters.");

        const byStatus = new Map<string, typeof nodes>();
        for (const n of nodes) {
          const key = statusOf(n.quoteStatus);
          const bucket = byStatus.get(key) ?? [];
          bucket.push(n);
          byStatus.set(key, bucket);
        }

        const sections = [...byStatus.entries()].map(([status, bucket]) => {
          const rows = bucket.map(
            (n) =>
              `  Q#${n.quoteNumber ?? n.id} - ${n.title ?? "untitled"} - ${n.client?.name ?? "no client"} - ` +
              `${fmtMoney(n.amounts?.total)} - ${n.sentAt ? `sent ${shortDate(n.sentAt)}` : `created ${shortDate(n.createdAt)}`} - ` +
              `job #${n.jobs?.nodes[0]?.jobNumber ?? "-"}`,
          );
          return `${status} (${bucket.length}):\n${rows.join("\n")}`;
        });
        let text = `Quotes (${nodes.length}${data.quotes?.totalCount ? ` of ${data.quotes.totalCount}` : ""}):\n${sections.join("\n\n")}`;
        const pageInfo = data.quotes?.pageInfo;
        if (pageInfo?.hasNextPage && pageInfo.endCursor) {
          text += `\n\nMore results available - pass cursor: ${pageInfo.endCursor}`;
        }
        return ok(text);
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  /* ----- draft_client_message ----- */
  server.registerTool(
    "draft_client_message",
    {
      title: "Draft a client message",
      description:
        "Compose a DRAFT message (email or SMS) to a client, enriched with facts pulled live from Jobber " +
        "(invoice number, balance owing, due date, days overdue, client name). Nothing is ever sent or written " +
        "to Jobber - the draft is returned for human review. Provide `message` if you already wrote the body " +
        "(the tool attaches verified facts); omit it to get a template based on `purpose`.",
      inputSchema: {
        purpose: z.enum(["payment_reminder", "appointment_reminder", "follow_up", "custom"]).describe("Why this message exists"),
        channel: z.enum(["email", "sms"]).optional().describe("Draft format (default email)"),
        client_id: z.string().optional().describe("Jobber client ID - resolves the client's name"),
        invoice_id: z.string().optional().describe("Jobber invoice ID - pulls amount/due-date facts (payment reminders)"),
        tone: z.string().optional().describe('Desired tone, e.g. "polite but firm" (default "friendly, professional")'),
        key_points: z.array(z.string()).optional().describe("Points the message must cover (used by templates)"),
        message: z.string().optional().describe("Pre-written body from the assistant; used verbatim if provided"),
        signer: z.string().optional().describe("Sign-off name/company"),
      },
    },
    async (args) => {
      try {
        await ensureCurrency(jobber);
        const channel = args.channel ?? "email";
        const tone = args.tone ?? "friendly, professional";
        const signer = args.signer ?? "(add your signature)";

        const facts: string[] = [];
        const warnings: string[] = [];

        let clientName: string | null = null;
        if (args.client_id) {
          try {
            const data = await jobber.graphql<ClientData>(queries.clientById, { id: args.client_id });
            clientName = data.client?.name ?? data.client?.companyName ?? null;
            if (clientName) facts.push(`client name: ${clientName}`);
            else warnings.push(`no client found for id ${args.client_id}`);
          } catch (err) {
            warnings.push(`could not fetch client (${(err as Error).message}) - verify name manually`);
          }
        }

        let invoiceNumber: string | null = null;
        let balance: number | null = null;
        let dueDate: string | null = null;
        let daysLate: number | null = null;
        if (args.invoice_id) {
          try {
            const data = await jobber.graphql<InvoiceData>(queries.invoiceById, { id: args.invoice_id });
            const inv = data.invoice;
            if (inv) {
              invoiceNumber = inv.invoiceNumber ?? inv.id;
              balance = inv.amounts?.invoiceBalance ?? null;
              dueDate = shortDate(inv.dueDate);
              if (inv.client?.name && !clientName) clientName = inv.client.name;
              if (inv.dueDate) {
                const due = new Date(`${inv.dueDate.slice(0, 10)}T00:00:00Z`);
                if (due < todayUtc()) daysLate = daysBetween(due, todayUtc());
              }
              facts.push(`invoice: INV ${invoiceNumber} [${statusOf(inv.invoiceStatus)}]`);
              facts.push(`balance owing: ${fmtMoney(balance)}`);
              facts.push(`due date: ${dueDate}`);
              if (daysLate != null) facts.push(`days overdue: ${daysLate}`);
            } else {
              warnings.push(`no invoice found for id ${args.invoice_id}`);
            }
          } catch (err) {
            warnings.push(`could not fetch invoice (${(err as Error).message}) - verify amounts manually`);
          }
        }

        const salutation = clientName ? `Hi ${clientName},` : "Hi,";

        let subject: string;
        let body: string;
        if (args.message) {
          body = args.message;
          subject =
            args.purpose === "payment_reminder"
              ? `Invoice ${invoiceNumber ?? ""} - payment reminder`
              : args.purpose === "appointment_reminder"
                ? "Your upcoming appointment"
                : args.purpose === "follow_up"
                  ? "Following up"
                  : "A note from your service team";
        } else {
          const points = (args.key_points ?? [])
            .map((p) => `  • ${p}`)
            .join("\n");
          if (args.purpose === "payment_reminder") {
            subject = `Invoice ${invoiceNumber ?? ""} - payment reminder`;
            body =
              `${salutation}\n\n` +
              `This is a friendly reminder that invoice ${invoiceNumber ? `INV ${invoiceNumber}` : "(see your records)"} ` +
              `${balance != null ? `for ${fmtMoney(balance)} ` : ""}${dueDate ? `was due on ${dueDate}` : "is due"}` +
              `${daysLate != null ? ` and is now ${daysLate} day(s) past due` : ""}. ` +
              `You can pay via the link in your original invoice email.\n` +
              (points ? `\n${points}\n` : "\n") +
              `Thank you!\n${signer}`;
          } else if (args.purpose === "appointment_reminder") {
            subject = "Your upcoming appointment";
            body =
              `${salutation}\n\nA quick reminder about your upcoming appointment with us.\n` +
              (points ? `\n${points}\n` : "\n") +
              `We look forward to seeing you!\n${signer}`;
          } else {
            subject = args.purpose === "follow_up" ? "Following up" : "A note from your service team";
            body =
              `${salutation}\n\n` +
              (points || "(add your key points here)") +
              `\n\n${signer}`;
          }
        }

        if (channel === "sms") {
          body = body.replace(/\n{2,}/g, "\n").replace(/\s+\n/g, "\n");
        }

        const to = clientName ?? "(no client_id given - fill in the recipient)";
        const factBlock =
          facts.length > 0
            ? facts.map((f) => `  - ${f}`).join("\n")
            : "  (no Jobber facts attached - provide client_id / invoice_id to enrich)";
        const warnBlock = warnings.length > 0 ? `\nWarnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}` : "";

        return ok(
          `DRAFT ${channel.toUpperCase()} - NOT SENT\nTo: ${to}\nSubject: ${subject}\n\n${body}\n\n` +
            `---\nFacts pulled from Jobber (verify before sending):\n${factBlock}${warnBlock}\n` +
            `NOTE: This is a draft only - nothing was sent or written to Jobber. Review and send via Jobber, ` +
            `or ask about a send tool once write access is validated.`,
        );
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );
}
