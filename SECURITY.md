# Security Policy

## Trust model

- **Your credentials stay on your machine.** Tokens are read from environment
  variables or a local, gitignored `.env`. This project has no telemetry, no
  analytics, and no backend - the server talks only to Jobber's API and your
  MCP client.
- **Least privilege by design.** The documented setup requests only read
  scopes (Clients, Jobs, Quotes, Scheduled Items, Invoices). Write scopes are
  deliberately not requested in v1.
- **Read-only by construction.** v1 issues GraphQL queries only. The one
  "compositional" tool, `draft_client_message`, produces text for human review
  and never sends anything.
- **Silent refresh uses your own app credentials.** Refresh tokens and client
  secrets belong to the Jobber developer app you create; they are never
  transmitted anywhere except Jobber's OAuth endpoints.

## Reporting a vulnerability

If you find a security issue, please report it privately:

- Email: arkdezin@gmail.com
- Or open a GitHub security advisory ("Report a vulnerability" under the
  Security tab)

Please include reproduction steps and affected versions. You'll get an
acknowledgment within a few days. Please avoid public disclosure until a fix
is released.

## Scope

- The MCP server code in this repository
- The OAuth helper script (`npm run auth`)

Out of scope: vulnerabilities in Jobber's own API (report those to Jobber),
issues in MCP clients, and compromised tokens caused by sharing your `.env`.

## Hardening tips for users

- Create a dedicated developer app with only the read scopes you need.
- Re-run `npm run auth` and rotate tokens if you suspect exposure; you can
  disconnect the app from your Jobber account at any time.
- Keep `.env` out of any synced/shared folders.
