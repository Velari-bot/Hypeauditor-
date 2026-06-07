import type { Platform } from "./parser";
import { removeUndefined } from "./parser";

type NormalizedFields = Record<string, unknown>;
type AirtableValueType = "text" | "number" | "currency" | "datetime" | "passthrough";
type AirtableFieldConfig = {
  airtableField: string;
  type: AirtableValueType;
};

type AirtableTable = {
  id: string;
  name: string;
  fields?: AirtableFieldMetadata[];
};

type AirtableFieldMetadata = {
  id: string;
  name: string;
  type: string;
  options?: unknown;
};

type SkippedAirtableField = {
  airtableField: string;
  normalizedKey?: string;
  airtableType?: string;
  reason: string;
};

type AirtableTarget = {
  apiKey: string;
  baseId: string;
  configuredTableId: string;
  initialTableId: string;
};

export type AirtableUpdateResult = {
  airtableFields: NormalizedFields;
  responseBody: unknown;
  configuredTableId: string;
  initialTableId: string;
  resolvedTableId: string;
  resolvedTableName: string | null;
  autoDiscoveryRan: boolean;
  skippedFields: SkippedAirtableField[];
};

export const TIKTOK_AIRTABLE_FIELD_CONFIG: Record<string, AirtableFieldConfig> = {
  tiktok_username: { airtableField: "Tiktok Username", type: "text" },
  country: { airtableField: "Country", type: "text" },
  niche: { airtableField: "Niche", type: "text" },
  bio: { airtableField: "Bio", type: "text" },
  tiktok_profile_url: { airtableField: "TikTok Profile URL", type: "text" },
  followers: { airtableField: "Followers", type: "number" },
  avg_views: { airtableField: "Avg Views", type: "number" },
  avg_likes: { airtableField: "Avg Likes", type: "number" },
  total_likes: { airtableField: "Total Likes", type: "number" },
  engagement_rate: { airtableField: "Engagement Rate", type: "number" },
  audience_country: { airtableField: "Audience Country", type: "text" },
  audience_gender: { airtableField: "Audience Gender Split", type: "text" },
  audience_age: { airtableField: "Audience Age", type: "text" },
  tiktok_rate: { airtableField: "Tiktok Rate", type: "currency" },
  tiktok_base_rate: { airtableField: "Tiktok Base Rate", type: "currency" },
  exclusivity: { airtableField: "Exclusivity", type: "passthrough" },
  phone_number: { airtableField: "Phone Number", type: "text" },
  hype_auditor_profile: { airtableField: "HypeAuditor Profile URL", type: "text" },
  last_updated: { airtableField: "Last Updated", type: "datetime" },
  instagram_url: { airtableField: "Instagram URL", type: "text" },
  instagram_rate: { airtableField: "Instagram Rate", type: "currency" },
  email: { airtableField: "Email", type: "text" },
};

export const INSTAGRAM_AIRTABLE_FIELD_CONFIG: Record<string, AirtableFieldConfig> = {
  instagram_username: { airtableField: "Instagram Username", type: "text" },
  country: { airtableField: "Country", type: "text" },
  niche: { airtableField: "Niche", type: "text" },
  bio: { airtableField: "Bio", type: "text" },
  instagram_profile_url: { airtableField: "Instagram Profile URL", type: "text" },
  followers: { airtableField: "Followers", type: "number" },
  avg_views: { airtableField: "Avg Views", type: "number" },
  average_likes: { airtableField: "Average Likes", type: "number" },
  total_likes: { airtableField: "Total Likes", type: "number" },
  engagement_rate: { airtableField: "Engagement Rate", type: "number" },
  audience_country: { airtableField: "Audience Country", type: "text" },
  audience_gender: { airtableField: "Audience Gender Split", type: "text" },
  audience_age: { airtableField: "Audience Age", type: "text" },
  instagram_rate: { airtableField: "Instagram Rate", type: "currency" },
  exclusivity: { airtableField: "Exclusivity", type: "passthrough" },
  phone_number: { airtableField: "Phone Number", type: "text" },
  hype_auditor_profile: { airtableField: "HypeAuditor Profile URL", type: "text" },
  last_updated: { airtableField: "Last Updated Timestamp", type: "datetime" },
};

export const TIKTOK_AIRTABLE_FIELD_MAP = Object.fromEntries(
  Object.entries(TIKTOK_AIRTABLE_FIELD_CONFIG).map(([key, config]) => [key, config.airtableField]),
);

export const INSTAGRAM_AIRTABLE_FIELD_MAP = Object.fromEntries(
  Object.entries(INSTAGRAM_AIRTABLE_FIELD_CONFIG).map(([key, config]) => [key, config.airtableField]),
);

export class AirtableUpdateError extends Error {
  status: number;
  responseBody: unknown;
  configuredTableId?: string;
  initialTableId?: string;
  resolvedTableId?: string | null;
  resolvedTableName?: string | null;
  autoDiscoveryRan?: boolean;
  skippedFields?: SkippedAirtableField[];

  constructor(
    message: string,
    status: number,
    responseBody: unknown,
    context: {
      configuredTableId?: string;
      initialTableId?: string;
      resolvedTableId?: string | null;
      resolvedTableName?: string | null;
      autoDiscoveryRan?: boolean;
      skippedFields?: SkippedAirtableField[];
    } = {},
  ) {
    super(message);
    this.name = "AirtableUpdateError";
    this.status = status;
    this.responseBody = responseBody;
    this.configuredTableId = context.configuredTableId;
    this.initialTableId = context.initialTableId;
    this.resolvedTableId = context.resolvedTableId;
    this.resolvedTableName = context.resolvedTableName;
    this.autoDiscoveryRan = context.autoDiscoveryRan;
    this.skippedFields = context.skippedFields;
  }
}

export function mapToAirtableFields(fields: NormalizedFields, platform: Platform): NormalizedFields {
  const config = platform === "tiktok" ? TIKTOK_AIRTABLE_FIELD_CONFIG : INSTAGRAM_AIRTABLE_FIELD_CONFIG;
  const mapped = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key in config)
      .map(([key, value]) => [config[key].airtableField, coerceForAirtable(value, config[key].type)]),
  );

  return removeUndefined(mapped);
}

export async function updateAirtable({
  platform,
  recordId,
  fields,
  airtableTableId,
}: {
  platform: Platform;
  recordId: string;
  fields: NormalizedFields;
  airtableTableId?: string | null;
}): Promise<AirtableUpdateResult> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_BASE_ID : process.env.INSTAGRAM_AIRTABLE_BASE_ID;
  const configuredTableId =
    platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_TABLE_ID : process.env.INSTAGRAM_AIRTABLE_TABLE_ID;
  const initialTableId = airtableTableId ?? configuredTableId;

  if (!apiKey) {
    throw new Error("AIRTABLE_API_KEY is required.");
  }

  if (!baseId || !configuredTableId || !initialTableId) {
    throw new Error(`Airtable base and table environment variables are required for ${platform}.`);
  }

  const airtableFields = mapToAirtableFields(fields, platform);
  const strictUpdates = process.env.STRICT_AIRTABLE_UPDATES === "true";
  logPreparedUpdate({
    platform,
    recordId,
    fields,
    airtableFields,
    skippedFields: [],
  });
  const target = { apiKey, baseId, configuredTableId, initialTableId };
  const firstSanitized = await sanitizeAirtableFields(target, platform, fields, airtableFields, initialTableId, strictUpdates);
  const firstAttempt = await patchRecordSafely(target, recordId, firstSanitized.airtableFields, initialTableId, strictUpdates);
  if (firstAttempt.response.ok) {
    return buildUpdateResult({
      airtableFields: firstAttempt.airtableFields,
      responseBody: firstAttempt.body,
      configuredTableId,
      initialTableId,
      resolvedTableId: initialTableId,
      resolvedTableName: null,
      autoDiscoveryRan: false,
      skippedFields: [...firstSanitized.skippedFields, ...firstAttempt.skippedFields],
    });
  }

  if (!isModelNotFound(firstAttempt.body)) {
    logAirtableFailure({
      status: firstAttempt.response.status,
      platform,
      recordId,
      configuredTableId,
      initialTableId,
      resolvedTableId: initialTableId,
      resolvedTableName: null,
      autoDiscoveryRan: false,
      responseBody: firstAttempt.body,
    });
    throw new AirtableUpdateError(getAirtableErrorMessage(firstAttempt.body), firstAttempt.response.status, firstAttempt.body, {
      configuredTableId,
      initialTableId,
      resolvedTableId: initialTableId,
      resolvedTableName: null,
      autoDiscoveryRan: false,
      skippedFields: [...firstSanitized.skippedFields, ...firstAttempt.skippedFields],
    });
  }

  const resolved = await resolveRecordTable(target, recordId, initialTableId);
  if (!resolved) {
    const message =
      "Record ID was not found in any table for the selected platform base. Check that Zapier is sending the original Airtable record ID from the same base.";
    logAirtableFailure({
      status: firstAttempt.response.status,
      platform,
      recordId,
      configuredTableId,
      initialTableId,
      resolvedTableId: null,
      resolvedTableName: null,
      autoDiscoveryRan: true,
      responseBody: firstAttempt.body,
    });
    throw new AirtableUpdateError(message, firstAttempt.response.status, firstAttempt.body, {
      configuredTableId,
      initialTableId,
      resolvedTableId: null,
      resolvedTableName: null,
      autoDiscoveryRan: true,
      skippedFields: [...firstSanitized.skippedFields, ...firstAttempt.skippedFields],
    });
  }

  const retrySanitized = await sanitizeAirtableFields(target, platform, fields, airtableFields, resolved.id, strictUpdates);
  const retry = await patchRecordSafely(target, recordId, retrySanitized.airtableFields, resolved.id, strictUpdates);
  if (!retry.response.ok) {
    logAirtableFailure({
      status: retry.response.status,
      platform,
      recordId,
      configuredTableId,
      initialTableId,
      resolvedTableId: resolved.id,
      resolvedTableName: resolved.name,
      autoDiscoveryRan: true,
      responseBody: retry.body,
    });
    throw new AirtableUpdateError(getAirtableErrorMessage(retry.body), retry.response.status, retry.body, {
      configuredTableId,
      initialTableId,
      resolvedTableId: resolved.id,
      resolvedTableName: resolved.name,
      autoDiscoveryRan: true,
      skippedFields: [...firstSanitized.skippedFields, ...retrySanitized.skippedFields, ...retry.skippedFields],
    });
  }

  return buildUpdateResult({
    airtableFields: retry.airtableFields,
    responseBody: retry.body,
    configuredTableId,
    initialTableId,
    resolvedTableId: resolved.id,
    resolvedTableName: resolved.name,
    autoDiscoveryRan: true,
    skippedFields: [...firstSanitized.skippedFields, ...retrySanitized.skippedFields, ...retry.skippedFields],
  });
}

export function getConfiguredAirtableTarget(platform: Platform) {
  return {
    baseId: platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_BASE_ID ?? null : process.env.INSTAGRAM_AIRTABLE_BASE_ID ?? null,
    tableId:
      platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_TABLE_ID ?? null : process.env.INSTAGRAM_AIRTABLE_TABLE_ID ?? null,
  };
}

async function patchRecord(target: AirtableTarget, recordId: string, airtableFields: NormalizedFields, tableId: string) {
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(target.baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(
      recordId,
    )}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${target.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: airtableFields }),
    },
  );

  return {
    response,
    body: await readResponseBody(response),
  };
}

async function patchRecordSafely(
  target: AirtableTarget,
  recordId: string,
  airtableFields: NormalizedFields,
  tableId: string,
  strictUpdates: boolean,
) {
  const firstAttempt = await patchRecord(target, recordId, airtableFields, tableId);
  if (firstAttempt.response.ok || strictUpdates) {
    return { ...firstAttempt, airtableFields, skippedFields: [] as SkippedAirtableField[] };
  }

  const rejectedField = getRejectedFieldName(firstAttempt.body);
  if (!rejectedField || !(rejectedField in airtableFields)) {
    return { ...firstAttempt, airtableFields, skippedFields: [] as SkippedAirtableField[] };
  }

  const retryFields = { ...airtableFields };
  delete retryFields[rejectedField];
  const skippedFields = [
    {
      airtableField: rejectedField,
      reason: "Airtable rejected this field value; retried without it.",
    },
  ];
  console.warn("Retrying Airtable update without rejected field", {
    recordId,
    tableId,
    skippedFields,
  });

  const retry = await patchRecord(target, recordId, retryFields, tableId);
  return {
    ...retry,
    airtableFields: retryFields,
    skippedFields,
  };
}

async function sanitizeAirtableFields(
  target: AirtableTarget,
  platform: Platform,
  normalizedFields: NormalizedFields,
  airtableFields: NormalizedFields,
  tableId: string,
  strictUpdates: boolean,
) {
  const metadata = await fetchTableMetadata(target, tableId);
  if (!metadata) {
    return { airtableFields, skippedFields: [] as SkippedAirtableField[] };
  }

  const config = platform === "tiktok" ? TIKTOK_AIRTABLE_FIELD_CONFIG : INSTAGRAM_AIRTABLE_FIELD_CONFIG;
  const fields = { ...airtableFields };
  const skippedFields: SkippedAirtableField[] = [];

  for (const [normalizedKey, fieldConfig] of Object.entries(config)) {
    if (!(normalizedKey in normalizedFields) || !(fieldConfig.airtableField in fields)) {
      continue;
    }

    const field = (metadata.fields ?? []).find((item) => item.name === fieldConfig.airtableField);
    if (!field) {
      continue;
    }

    if (!isWritableAirtableField(field)) {
      const skipped = {
        normalizedKey,
        airtableField: fieldConfig.airtableField,
        airtableType: field.type,
        reason: "Airtable field is not writable.",
      };

      if (strictUpdates) {
        throw new AirtableUpdateError(`Airtable field "${fieldConfig.airtableField}" is not writable.`, 422, { error: skipped });
      }

      delete fields[fieldConfig.airtableField];
      skippedFields.push(skipped);
    }
  }

  if (skippedFields.length > 0) {
    console.warn("Skipping non-writable Airtable fields", {
      platform,
      tableId,
      skippedFields,
    });
  }

  return { airtableFields: fields, skippedFields };
}

async function fetchTableMetadata(target: AirtableTarget, tableId: string) {
  const tables = await fetchTables(target);
  return tables.find((table) => table.id === tableId) ?? null;
}

async function resolveRecordTable(target: AirtableTarget, recordId: string, skippedTableId: string): Promise<AirtableTable | null> {
  const tables = await fetchTables(target);
  for (const table of tables) {
    if (table.id === skippedTableId) {
      continue;
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${encodeURIComponent(target.baseId)}/${encodeURIComponent(table.id)}/${encodeURIComponent(
        recordId,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${target.apiKey}`,
        },
      },
    );

    if (response.ok) {
      return table;
    }
  }

  return null;
}

async function fetchTables(target: AirtableTarget): Promise<AirtableTable[]> {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${target.baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${target.apiKey}`,
    },
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    return [];
  }

  return getTables(body);
}

function buildUpdateResult(result: AirtableUpdateResult): AirtableUpdateResult {
  return result;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getAirtableErrorMessage(responseBody: unknown): string {
  if (typeof responseBody === "string") {
    return responseBody;
  }

  if (typeof responseBody === "object" && responseBody !== null && "error" in responseBody) {
    const error = (responseBody as { error?: unknown }).error;
    if (typeof error === "string") {
      return error;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
      return String((error as { message: unknown }).message);
    }
  }

  return "Airtable returned an error.";
}

function getTables(body: unknown): AirtableTable[] {
  if (typeof body !== "object" || body === null || !("tables" in body)) {
    return [];
  }

  const tables = (body as { tables?: unknown }).tables;
  if (!Array.isArray(tables)) {
    return [];
  }

  const parsedTables: AirtableTable[] = [];
  for (const table of tables) {
    if (typeof table !== "object" || table === null) {
      continue;
    }

    const id = (table as { id?: unknown }).id;
    const name = (table as { name?: unknown }).name;
    const fields = (table as { fields?: unknown }).fields;
    if (typeof id === "string" && typeof name === "string") {
      parsedTables.push({ id, name, fields: getFields(fields) });
    }
  }

  return parsedTables;
}

function getFields(fields: unknown): AirtableFieldMetadata[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  const parsedFields: AirtableFieldMetadata[] = [];
  for (const field of fields) {
    if (typeof field !== "object" || field === null) {
      continue;
    }

    const id = (field as { id?: unknown }).id;
    const name = (field as { name?: unknown }).name;
    const type = (field as { type?: unknown }).type;
    const options = (field as { options?: unknown }).options;

    if (typeof id === "string" && typeof name === "string" && typeof type === "string") {
      parsedFields.push({ id, name, type, options });
    }
  }

  return parsedFields;
}

function isModelNotFound(responseBody: unknown): boolean {
  if (typeof responseBody !== "object" || responseBody === null || !("error" in responseBody)) {
    return false;
  }

  const error = (responseBody as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: unknown }).type === "INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND"
  );
}

function logAirtableFailure({
  status,
  platform,
  recordId,
  configuredTableId,
  initialTableId,
  resolvedTableId,
  resolvedTableName,
  autoDiscoveryRan,
  responseBody,
}: {
  status: number;
  platform: Platform;
  recordId: string;
  configuredTableId: string;
  initialTableId: string;
  resolvedTableId: string | null;
  resolvedTableName: string | null;
  autoDiscoveryRan: boolean;
  responseBody: unknown;
}) {
  console.error("Airtable update failed", {
    status,
    platform,
    recordId,
    configuredTableId,
    initialTableId,
    resolvedTableId,
    resolvedTableName,
    autoDiscoveryRan,
    responseBody,
  });
}

function logPreparedUpdate({
  platform,
  recordId,
  fields,
  airtableFields,
  skippedFields,
}: {
  platform: Platform;
  recordId: string;
  fields: NormalizedFields;
  airtableFields: NormalizedFields;
  skippedFields: SkippedAirtableField[];
}) {
  console.log("Preparing Airtable update", {
    platform,
    recordId,
    normalizedFieldKeys: Object.keys(fields),
    mappedAirtableFields: previewAirtableFields(fields, platform, airtableFields),
    skippedFields,
  });
}

function coerceForAirtable(value: unknown, type: AirtableValueType): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (type === "number" || type === "currency") {
    const number = Number(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  if (type === "datetime") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  if (type === "text") {
    return String(value);
  }

  return value;
}

function isWritableAirtableField(field: AirtableFieldMetadata): boolean {
  const nonWritableTypes = new Set([
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
  ]);

  return !nonWritableTypes.has(field.type);
}

function getRejectedFieldName(responseBody: unknown): string | null {
  const message = getAirtableErrorMessage(responseBody);
  const cannotAcceptMatch = message.match(/Field "([^"]+)" cannot accept the provided value/i);
  if (cannotAcceptMatch?.[1]) {
    return cannotAcceptMatch[1];
  }

  const invalidDateMatch = message.match(/for field ([^"]+)$/i);
  if (invalidDateMatch?.[1]) {
    return invalidDateMatch[1].trim();
  }

  return null;
}

function previewAirtableFields(fields: NormalizedFields, platform: Platform, airtableFields: NormalizedFields) {
  const config = platform === "tiktok" ? TIKTOK_AIRTABLE_FIELD_CONFIG : INSTAGRAM_AIRTABLE_FIELD_CONFIG;

  return Object.entries(fields)
    .filter(([key]) => key in config)
    .map(([key]) => {
      const fieldConfig = config[key];
      const value = airtableFields[fieldConfig.airtableField];
      return {
        normalizedKey: key,
        airtableField: fieldConfig.airtableField,
        type: fieldConfig.type,
        valueType: value === null ? "null" : typeof value,
        valuePreview: previewValue(value),
      };
    });
}

function previewValue(value: unknown) {
  if (value === null || value === undefined) {
    return value;
  }

  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
