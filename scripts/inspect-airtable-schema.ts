import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAirtableTableSchema } from "../lib/airtable";
import type { Platform } from "../lib/parser";

const platforms: Platform[] = ["tiktok", "instagram"];
const output: Record<string, unknown> = {};

for (const platform of platforms) {
  const schema = await getAirtableTableSchema(platform);
  output[platform] = schema;

  console.log(`\n${platform.toUpperCase()} Airtable schema`);
  if (!schema) {
    console.log("Missing Airtable env vars or metadata could not be fetched.");
    continue;
  }

  console.log(`Table: ${schema.name} (${schema.id})`);
  for (const field of schema.fields ?? []) {
    console.log(`- ${field.name} | ${field.id} | ${field.type}`);
    if (field.options) {
      console.log(`  options: ${JSON.stringify(field.options)}`);
    }
  }
}

const debugDir = path.join(process.cwd(), "debug");
await mkdir(debugDir, { recursive: true });
const outputPath = path.join(debugDir, "airtable-schema.json");
await writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(`\nSaved schema to ${outputPath}`);
