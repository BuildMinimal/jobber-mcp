/**
 * GraphQL documents + response types for the Jobber API.
 *
 * VERIFIED against the live schema (version 2026-05-12, Sept 2026) via
 * `npm run introspect`. Key facts encoded here:
 *
 * - Root list queries take (filter: …FilterAttributes, searchTerm, sort, first, after)
 * - Ranges are Iso8601DateTimeRangeInput { after, before, eq }
 * - Money lives in `amounts` (InvoiceAmounts/QuoteAmounts) as plain Floats
 * - Statuses are typed enums: jobStatus/invoiceStatus/quoteStatus (lowercase),
 *   visitStatus (UPPERCASE)
 * - Job number field is `jobNumber: Int`; Invoice/Quote relate to jobs via
 *   `jobs: JobConnection` (plural)
 *
 * If the API version is bumped (see extensions.versioning in responses), re-run
 * `npm run introspect` and align here - this is the single place queries live.
 */

export interface PageInfo {
  hasNextPage: boolean | null;
  endCursor: string | null;
}

export interface ClientRef {
  id: string;
  name: string | null;
}

export interface JobRef {
  id: string;
  jobNumber: number | null;
  title: string | null;
}

export interface JobNode {
  id: string;
  jobNumber: number | null;
  title: string | null;
  jobStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  client: ClientRef | null;
}

export interface JobsData {
  jobs: { nodes: JobNode[]; totalCount?: number | null; pageInfo: PageInfo } | null;
}

export interface InvoiceAmounts {
  total: number | null;
  invoiceBalance: number | null;
  paymentsTotal?: number | null;
}

export interface InvoiceNode {
  id: string;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  amounts: InvoiceAmounts | null;
  client: ClientRef | null;
  jobs: { nodes: JobRef[] } | null;
}

export interface InvoicesData {
  invoices: { nodes: InvoiceNode[]; totalCount?: number | null; pageInfo: PageInfo } | null;
}

export interface InvoiceData {
  invoice: InvoiceNode | null;
}

export interface VisitNode {
  id: string;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean | null;
  visitStatus: string | null;
  isComplete: boolean | null;
  instructions: string | null;
  job: (JobRef & { client: ClientRef | null }) | null;
}

export interface VisitsData {
  visits: { nodes: VisitNode[]; totalCount?: number | null; pageInfo: PageInfo } | null;
}

export interface QuoteNode {
  id: string;
  quoteNumber: string | null;
  quoteStatus: string | null;
  title: string | null;
  createdAt: string | null;
  sentAt: string | null;
  amounts: { total: number | null } | null;
  client: ClientRef | null;
  jobs: { nodes: JobRef[] } | null;
}

export interface QuotesData {
  quotes: { nodes: QuoteNode[]; totalCount?: number | null; pageInfo: PageInfo } | null;
}

export interface ClientDetailNode {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  isCompany: boolean | null;
  isLead: boolean | null;
  email: string | null;
  phone: string | null;
  balance: number | null;
  createdAt: string | null;
  jobberWebUri: string | null;
  jobs: { nodes: Array<Pick<JobNode, "id" | "jobNumber" | "title" | "jobStatus" | "createdAt">> } | null;
  invoices: {
    nodes: Array<
      Pick<InvoiceNode, "id" | "invoiceNumber" | "invoiceStatus" | "issuedDate" | "dueDate"> & {
        amounts: InvoiceAmounts | null;
      }
    >;
  } | null;
}

export interface ClientData {
  client: ClientDetailNode | null;
}

export interface AccountData {
  account: { countryCode: string | null } | null;
}

/** Valid values for JobFilterAttributes.status */
export const JOB_STATUSES = [
  "requires_invoicing",
  "archived",
  "late",
  "today",
  "upcoming",
  "action_required",
  "on_hold",
  "unscheduled",
  "active",
  "expiring_within_30_days",
] as const;

/** Valid values for InvoiceFilterAttributes.status */
export const INVOICE_STATUSES = [
  "draft",
  "awaiting_payment",
  "paid",
  "past_due",
  "bad_debt",
  "sent_not_due",
  "voided",
] as const;

/** Valid values for QuoteFilterAttributes.status */
export const QUOTE_STATUSES = [
  "draft",
  "awaiting_response",
  "archived",
  "approved",
  "converted",
  "changes_requested",
] as const;

export const queries = {
  account: /* GraphQL */ `
    query Account {
      account {
        countryCode
      }
    }
  `,

  searchJobs: /* GraphQL */ `
    query SearchJobs($filter: JobFilterAttributes, $searchTerm: String, $first: Int!, $after: String) {
      jobs(filter: $filter, searchTerm: $searchTerm, first: $first, after: $after) {
        totalCount
        nodes {
          id
          jobNumber
          title
          jobStatus
          createdAt
          updatedAt
          client {
            id
            name
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  invoices: /* GraphQL */ `
    query Invoices($filter: InvoiceFilterAttributes, $sort: [InvoiceSortInput!], $first: Int!, $after: String) {
      invoices(filter: $filter, sort: $sort, first: $first, after: $after) {
        totalCount
        nodes {
          id
          invoiceNumber
          invoiceStatus
          issuedDate
          dueDate
          amounts {
            total
            invoiceBalance
            paymentsTotal
          }
          client {
            id
            name
          }
          jobs(first: 1) {
            nodes {
              id
              jobNumber
              title
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  invoiceById: /* GraphQL */ `
    query Invoice($id: EncodedId!) {
      invoice(id: $id) {
        id
        invoiceNumber
        invoiceStatus
        issuedDate
        dueDate
        amounts {
          total
          invoiceBalance
          paymentsTotal
        }
        client {
          id
          name
        }
        jobs {
          nodes {
            id
            jobNumber
            title
          }
        }
      }
    }
  `,

  clientById: /* GraphQL */ `
    query Client($id: EncodedId!) {
      client(id: $id) {
        id
        name
        firstName
        lastName
        companyName
        isCompany
        isLead
        email
        phone
        balance
        createdAt
        jobberWebUri
        jobs(first: 10) {
          nodes {
            id
            jobNumber
            title
            jobStatus
            createdAt
          }
        }
        invoices(first: 10) {
          nodes {
            id
            invoiceNumber
            invoiceStatus
            issuedDate
            dueDate
            amounts {
              total
              invoiceBalance
            }
          }
        }
      }
    }
  `,

  visits: /* GraphQL */ `
    query Visits($filter: VisitFilterAttributes, $sort: [VisitsSortInput!], $first: Int!, $after: String) {
      visits(filter: $filter, sort: $sort, first: $first, after: $after) {
        totalCount
        nodes {
          id
          title
          startAt
          endAt
          allDay
          visitStatus
          isComplete
          instructions
          job {
            id
            jobNumber
            title
            client {
              id
              name
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  quotes: /* GraphQL */ `
    query Quotes($filter: QuoteFilterAttributes, $first: Int!, $after: String) {
      quotes(filter: $filter, first: $first, after: $after) {
        totalCount
        nodes {
          id
          quoteNumber
          quoteStatus
          title
          createdAt
          sentAt
          amounts {
            total
          }
          client {
            id
            name
          }
          jobs(first: 1) {
            nodes {
              id
              jobNumber
              title
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,
} as const;
