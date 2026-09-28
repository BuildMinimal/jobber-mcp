/**
 * Dump Jobber's live GraphQL schema surface so src/jobber/queries.ts can be
 * aligned with reality. Requires credentials:
 *
 *   JOBBER_ACCESS_TOKEN=… npm run introspect          # default type set
 *   npm run introspect Client EmailConnection …      # or specific types
 *
 * Prints root query/mutation field names, then fields / inputFields /
 * enumValues for each requested type. Read-only introspection only.
 */
import { loadConfig } from "../src/config.js";
import { JobberClient } from "../src/jobber/client.js";

const cfg = loadConfig();
if (!cfg.accessToken && !cfg.refreshToken) {
  console.error("Set JOBBER_ACCESS_TOKEN first (run `npm run auth`).");
  process.exit(1);
}
const jobber = new JobberClient(cfg);

interface TypeInfo {
  kind: string;
  name: string | null;
  ofType?: TypeInfo | null;
}
interface TypeField {
  name: string;
  type: TypeInfo;
}
interface TypeDetail {
  kind: string;
  name: string;
  fields?: TypeField[] | null;
  inputFields?: TypeField[] | null;
  enumValues?: Array<{ name: string }> | null;
}

const ROOT_QUERY = `{ __schema { queryType { fields { name } } mutationType { fields { name } } } }`;
const TYPE_QUERY = /* GraphQL */ `
  query ($name: String!) {
    __type(name: $name) {
      kind
      name
      fields {
        name
        type { kind name ofType { kind name ofType { kind name } } }
      }
      inputFields {
        name
        type { kind name ofType { kind name ofType { kind name } } }
      }
      enumValues { name }
    }
  }
`;

const defaultTypes = [
  "Job",
  "Invoice",
  "Quote",
  "Client",
  "Visit",
  "JobSearchInput",
  "InvoiceSearchInput",
  "QuoteSearchInput",
  "VisitSearchInput",
  "ClientSearchInput",
];
const typeNames = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultTypes;

try {
  const root = await jobber.graphql<{
    __schema: {
      queryType: { fields: Array<{ name: string }> } | null;
      mutationType: { fields: Array<{ name: string }> } | null;
    };
  }>(ROOT_QUERY);
  console.log(
    "== Root queries ==\n" + (root.__schema.queryType?.fields.map((f) => f.name).join(", ") || "(none)"),
  );
  if (root.__schema.mutationType) {
    console.log(
      "\n== Root mutations (NOT used by this read-only server) ==\n" +
        root.__schema.mutationType.fields.map((f) => f.name).join(", "),
    );
  }

  for (const name of typeNames) {
    const data = await jobber.graphql<{ __type: TypeDetail | null }>(TYPE_QUERY, { name });
    const t = data.__type;
    if (!t) {
      console.log(`\n== ${name} == (not found - check the exact type name in root fields above)`);
      continue;
    }
    const signature = (f: TypeField) => `${f.name}: ${typeName(f.type)}`;
    const parts: string[] = [`\n== ${t.kind} ${t.name} ==`];
    if (t.fields?.length) parts.push("fields:\n  " + t.fields.map(signature).join("\n  "));
    if (t.inputFields?.length) parts.push("inputFields:\n  " + t.inputFields.map(signature).join("\n  "));
    if (t.enumValues?.length) parts.push("enumValues: " + t.enumValues.map((v) => v.name).join(", "));
    if (!t.fields?.length && !t.inputFields?.length && !t.enumValues?.length) parts.push("(no exposed members)");
    console.log(parts.join("\n"));
  }
  console.log(
    "\nAlign src/jobber/queries.ts with the above (this is the only place queries live), " +
      "then re-run `npm run test:wiring` and try the tools against your sandbox.",
  );
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

function typeName(t: TypeInfo | null | undefined): string {
  if (!t) return "?";
  return t.name ?? typeName(t.ofType);
}
