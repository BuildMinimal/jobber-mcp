import type { Config } from "../config.js";

export interface GraphQLErrorItem {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export class JobberApiError extends Error {
  constructor(
    message: string,
    readonly errors: GraphQLErrorItem[] = [],
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "JobberApiError";
  }
}

interface GraphQLResult<T> {
  data: T | null;
  errors?: GraphQLErrorItem[];
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

/** Arguments we can drop and retry without if a schema change rejects them. */
const DROPPABLE_SEARCH_ARGS = ["filter", "searchTerm", "sort"] as const;

/**
 * Errors that mean "the live schema doesn't accept this input field/argument".
 * When we see one, retrying without the search arguments lets tools fall back
 * to fetching a page and filtering locally.
 */
const VARIABLE_COERCION_ERROR =
  /(variable|argument|input field|unknown field|not defined|expected type|coercion)/i;

export class JobberClient {
  private accessToken: string | undefined;
  private refreshedOnce = false;
  private countryCode?: string | null;

  constructor(private readonly config: Config) {
    this.accessToken = stripBearer(config.accessToken);
  }

  /** Account country (fetched once, cached) — drives currency selection. */
  async accountCountryCode(): Promise<string | null> {
    if (this.countryCode !== undefined) return this.countryCode;
    try {
      const data = await this.execute<{ account: { countryCode: string | null } | null }>(
        `query Account { account { countryCode } }`,
        {},
      );
      this.countryCode = data?.account?.countryCode ?? null;
    } catch {
      // non-fatal — tools fall back to a plain number format
      this.countryCode = null;
    }
    return this.countryCode;
  }

  /**
   * Execute a GraphQL operation with two self-healing retries:
   *
   * 1. Throttled by Jobber's query-cost budget (10k points, +500/sec):
   *    wait for the budget to restore, then retry (up to twice).
   * 2. Schema drift: if the live schema rejects our filter/search arguments,
   *    retry once without them — tools compensate by filtering locally.
   */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const hasSearchArgs = DROPPABLE_SEARCH_ARGS.some((k) => k in variables);
    let current = variables;
    let fellBack = false;
    for (let throttleRetries = 0; ; ) {
      try {
        return await this.execute<T>(query, current);
      } catch (err) {
        if (err instanceof JobberApiError) {
          if (err.errors.some((e) => /throttl/i.test(e.message)) && throttleRetries < 2) {
            throttleRetries++;
            const waitMs = 1250 * throttleRetries;
            console.error(
              `[jobber-mcp] throttled by Jobber query-cost budget — waiting ${waitMs}ms before retry`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
          if (
            hasSearchArgs &&
            !fellBack &&
            err.errors.some((e) => VARIABLE_COERCION_ERROR.test(e.message))
          ) {
            fellBack = true;
            current = Object.fromEntries(
              Object.entries(variables).filter(([k]) => !DROPPABLE_SEARCH_ARGS.includes(k as never)),
            );
            continue;
          }
        }
        throw err;
      }
    }
  }

  private async execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (!this.accessToken) {
        throw new JobberApiError(
          "No Jobber access token configured. Run `npm run auth` or set JOBBER_ACCESS_TOKEN.",
        );
      }

      let response: Response;
      try {
        response = await fetch(this.config.graphqlUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: `Bearer ${this.accessToken}`,
            "x-jobber-graphql-version": this.config.apiVersion,
            "user-agent": "jobber-mcp/1.0.0",
          },
          body: JSON.stringify({ query, variables }),
        });
      } catch (cause) {
        throw new JobberApiError(
          `Could not reach the Jobber API at ${this.config.graphqlUrl}: ${(cause as Error).message}`,
        );
      }

      if (response.status === 401 && attempt === 0 && (await this.tryRefresh())) continue;

      const bodyText = await response.text();
      if (!response.ok) {
        if (response.status === 404) {
          throw new JobberApiError(
            `Jobber API returned 404 for ${this.config.graphqlUrl}. The GraphQL path may differ — ` +
              `try setting JOBBER_API_URL=https://api.getjobber.com/graphql in .env.`,
            [],
            response.status,
          );
        }
        throw new JobberApiError(
          `Jobber API responded ${response.status}: ${truncate(bodyText, 500)}`,
          [],
          response.status,
        );
      }

      let parsed: GraphQLResult<T>;
      try {
        parsed = JSON.parse(bodyText) as GraphQLResult<T>;
      } catch {
        throw new JobberApiError(`Jobber API returned non-JSON body: ${truncate(bodyText, 200)}`);
      }

      if (parsed.errors?.length) {
        throw new JobberApiError(
          `Jobber GraphQL error(s): ${parsed.errors.map((e) => e.message).join("; ")}`,
          parsed.errors,
          response.status,
        );
      }
      return parsed.data as T;
    }
  }

  /** One-shot silent refresh using the customer-held refresh token. */
  private async tryRefresh(): Promise<boolean> {
    const { refreshToken, clientId, clientSecret, tokenUrl } = this.config;
    if (this.refreshedOnce || !refreshToken || !clientId || !clientSecret) return false;
    this.refreshedOnce = true;
    try {
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      const body = (await res.json()) as TokenResponse;
      if (!res.ok || !body.access_token) {
        console.error(
          `[jobber-mcp] token refresh failed: ${body.error ?? res.status} ${body.error_description ?? ""}`,
        );
        return false;
      }
      this.accessToken = body.access_token;
      if (body.refresh_token) this.config.refreshToken = body.refresh_token;
      console.error("[jobber-mcp] access token refreshed");
      return true;
    } catch (cause) {
      console.error(`[jobber-mcp] token refresh error: ${(cause as Error).message}`);
      return false;
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Tolerate tokens pasted with the auth scheme ("Bearer xyz"). */
function stripBearer(token: string | undefined): string | undefined {
  return token?.replace(/^\s*bearer\s+/i, "");
}
