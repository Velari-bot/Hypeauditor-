import {
  getAirtableTableSchema,
  INSTAGRAM_AIRTABLE_FIELD_CONFIG,
  TIKTOK_AIRTABLE_FIELD_CONFIG,
  type AirtableFieldMetadata,
} from "../lib/airtable";
import type { Platform } from "../lib/parser";

type Args = {
  platform?: Platform;
  recordId?: string;
  noRestore?: boolean;
};

const args = parseArgs(process.argv.slice(2));
if ((args.platform !== "tiktok" && args.platform !== "instagram") || !args.recordId) {
  console.error("Usage: npm run test:airtable -- platform=tiktok recordId=recXXXXXXXXXXXXXX [noRestore=true]");
  process.exit(1);
}

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = args.platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_BASE_ID : process.env.INSTAGRAM_AIRTABLE_BASE_ID;
const tableId = args.platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_TABLE_ID : process.env.INSTAGRAM_AIRTABLE_TABLE_ID;

if (!apiKey || !baseId || !tableId) {
  console.error("Missing AIRTABLE_API_KEY or platform Airtable base/table env vars.");
  process.exit(1);
}

const schema = await getAirtableTableSchema(args.platform);
if (!schema) {
  console.error("Could not fetch Airtable schema.");
  process.exit(1);
}

const existing = await readRecord(apiKey, baseId, tableId, args.recordId);
const config = args.platform === "tiktok" ? TIKTOK_AIRTABLE_FIELD_CONFIG : INSTAGRAM_AIRTABLE_FIELD_CONFIG;
const results = [];

for (const fieldConfig of Object.values(config)) {
  const field = schema.fields?.find((item) => item.name === fieldConfig.airtableField);
  if (!field) {
    results.push({
      fieldName: fieldConfig.airtableField,
      fieldType: "missing",
      testValue: "",
      result: "SKIP",
      error: "Field not found in configured table.",
    });
    continue;
  }

  if (!isWritable(field)) {
    results.push({
      fieldName: field.name,
      fieldType: field.type,
      testValue: "",
      result: "SKIP",
      error: "Field is not writable.",
    });
    continue;
  }

  const testValue = safeTestValue(field);
  const patch = await patchRecord(apiKey, baseId, tableId, args.recordId, { [field.name]: testValue });
  results.push({
    fieldName: field.name,
    fieldType: field.type,
    testValue: JSON.stringify(testValue),
    result: patch.ok ? "OK" : "FAIL",
    error: patch.ok ? "" : JSON.stringify(patch.body),
  });

  if (patch.ok && !args.noRestore) {
    const previousValue = existing.fields[field.name] ?? null;
    await patchRecord(apiKey, baseId, tableId, args.recordId, { [field.name]: previousValue });
  }
}

console.table(results);

function parseArgs(argv: string[]): Args {
  return Object.fromEntries(
    argv.map((arg) => {
      const [key, ...rest] = arg.split("=");
      return [key, rest.join("=") || "true"];
    }),
  ) as Args;
}

async function readRecord(apiKey: string, baseId: string, tableId: string, recordId: string) {
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Could not read record: ${JSON.stringify(body)}`);
  }
  return body as { id: string; fields: Record<string, unknown> };
}

async function patchRecord(apiKey: string, baseId: string, tableId: string, recordId: string, fields: Record<string, unknown>) {
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    },
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { ok: response.ok, body };
}

function safeTestValue(field: AirtableFieldMetadata): unknown {
  if (["singleLineText", "multilineText", "richText"].includes(field.type)) return "Webhook test";
  if (field.type === "email") return "test@example.com";
  if (field.type === "phoneNumber") return "+1 212-555-0199";
  if (field.type === "url") return "https://example.com";
  if (["number", "percent", "rating", "duration", "currency"].includes(field.type)) return 123;
  if (field.type === "checkbox") return true;
  if (field.type === "date") return new Date().toISOString().slice(0, 10);
  if (field.type === "dateTime") return new Date().toISOString();
  if (field.type === "singleSelect") return firstChoice(field) ? { name: firstChoice(field) } : "Webhook test";
  if (field.type === "multipleSelects") return firstChoice(field) ? [{ name: firstChoice(field) }] : [];
  return "Webhook test";
}

function firstChoice(field: AirtableFieldMetadata): string | null {
  const options = field.options;
  if (typeof options !== "object" || options === null || !("choices" in options)) return null;
  const choices = (options as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null || !("name" in first)) return null;
  const name = (first as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function isWritable(field: AirtableFieldMetadata): boolean {
  return ![
    "formula",
    "rollup",
    "lookup",
    "count",
    "autoNumber",
    "createdTime",
    "lastModifiedTime",
    "createdBy",
    "lastModifiedBy",
    "button",
    "externalSyncSource",
    "syncSource",
    "multipleLookupValues",
  ].includes(field.type);
}
