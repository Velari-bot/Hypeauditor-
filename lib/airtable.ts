import type { Platform } from "./parser";
import { removeUndefined } from "./parser";

type NormalizedFields = Record<string, unknown>;
type AirtableValueType = "text" | "number" | "currency" | "datetime" | "passthrough";
type AirtableFieldConfig = {
  airtableField: string;
  type: AirtableValueType;
};

export type AirtableTable = {
  id: string;
  name: string;
  fields?: AirtableFieldMetadata[];
};

export type AirtableFieldMetadata = {
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

type PatchAttempt = {
  response: Response;
  body: unknown;
  airtableFields: NormalizedFields;
  skippedFields: SkippedAirtableField[];
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

export function removeEmptyValues(fields: NormalizedFields): NormalizedFields {
  return cleanEmptyValues(fields, false).fields;
}

export async function getAirtableTableSchema(platform: Platform, tableIdOverride?: string | null): Promise<AirtableTable | null> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_BASE_ID : process.env.INSTAGRAM_AIRTABLE_BASE_ID;
  const configuredTableId =
    platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_TABLE_ID : process.env.INSTAGRAM_AIRTABLE_TABLE_ID;
  const tableId = tableIdOverride ?? configuredTableId;

  if (!apiKey || !baseId || !configuredTableId || !tableId) {
    return null;
  }

  return fetchTableMetadata({ apiKey, baseId, configuredTableId, initialTableId: tableId }, tableId);
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
  const allowClearing = process.env.ALLOW_CLEARING_AIRTABLE_FIELDS === "true";
  logPreparedUpdate({
    platform,
    recordId,
    fields,
    airtableFields,
    skippedFields: [],
  });
  const target = { apiKey, baseId, configuredTableId, initialTableId };
  const firstExistingRecord = !allowClearing && needsIdentityFallback(platform, airtableFields)
    ? await readRecord(target, recordId, initialTableId)
    : null;
  const firstFieldsWithFallback = applyExistingIdentityFallback(platform, recordId, airtableFields, firstExistingRecord?.fields ?? null);
  const firstSanitized = await sanitizeAirtableFields(target, platform, fields, firstFieldsWithFallback, initialTableId, strictUpdates);
  const firstCleaned = cleanEmptyValues(firstSanitized.airtableFields, allowClearing);
  const firstAttempt = await patchRecordSafely({
    target,
    platform,
    recordId,
    airtableFields: firstCleaned.fields,
    tableId: initialTableId,
    strictUpdates,
    skippedFields: [...firstSanitized.skippedFields, ...firstCleaned.skippedFields],
  });
  if (firstAttempt.response.ok) {
    return buildUpdateResult({
      airtableFields: firstAttempt.airtableFields,
      responseBody: firstAttempt.body,
      configuredTableId,
      initialTableId,
      resolvedTableId: initialTableId,
      resolvedTableName: null,
      autoDiscoveryRan: false,
      skippedFields: firstAttempt.skippedFields,
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
      skippedFields: firstAttempt.skippedFields,
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
      skippedFields: firstAttempt.skippedFields,
    });
  }

  const retryExistingRecord = !allowClearing && needsIdentityFallback(platform, airtableFields)
    ? await readRecord(target, recordId, resolved.id)
    : null;
  const retryFieldsWithFallback = applyExistingIdentityFallback(platform, recordId, airtableFields, retryExistingRecord?.fields ?? null);
  const retrySanitized = await sanitizeAirtableFields(target, platform, fields, retryFieldsWithFallback, resolved.id, strictUpdates);
  const retryCleaned = cleanEmptyValues(retrySanitized.airtableFields, allowClearing);
  const retry = await patchRecordSafely({
    target,
    platform,
    recordId,
    airtableFields: retryCleaned.fields,
    tableId: resolved.id,
    strictUpdates,
    skippedFields: [...firstAttempt.skippedFields, ...retrySanitized.skippedFields, ...retryCleaned.skippedFields],
  });
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
      skippedFields: retry.skippedFields,
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
    skippedFields: retry.skippedFields,
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

async function readRecord(target: AirtableTarget, recordId: string, tableId: string) {
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(target.baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(
      recordId,
    )}`,
    {
      headers: {
        Authorization: `Bearer ${target.apiKey}`,
      },
    },
  );
  const body = await readResponseBody(response);
  if (!response.ok) {
    return null;
  }

  return {
    body,
    fields: getRecordFields(body),
  };
}

async function patchRecordSafely({
  target,
  platform,
  recordId,
  airtableFields,
  tableId,
  strictUpdates,
  skippedFields,
}: {
  target: AirtableTarget;
  platform: Platform;
  recordId: string;
  airtableFields: NormalizedFields;
  tableId: string;
  strictUpdates: boolean;
  skippedFields: SkippedAirtableField[];
}): Promise<PatchAttempt> {
  let fields = { ...airtableFields };
  const allSkippedFields = [...skippedFields];

  for (let attempt = 0; attempt <= 5; attempt += 1) {
    if (Object.keys(fields).length === 0) {
      return emptyPatchAttempt(fields, allSkippedFields);
    }

    console.log("FINAL CLEANED AIRTABLE PATCH BODY", {
      platform,
      recordId,
      fieldCount: Object.keys(fields).length,
      fields,
    });

    const result = await patchRecord(target, recordId, fields, tableId);
    console.log("AIRTABLE PATCH RESPONSE", {
      platform,
      recordId,
      status: result.response.status,
      airtableRecordId: getRecordId(result.body),
      returnedFields: getRecordFields(result.body),
    });

    if (result.response.ok || strictUpdates) {
      return { ...result, airtableFields: fields, skippedFields: allSkippedFields };
    }

    const rejectedField = getRejectedFieldName(result.body);
    if (!rejectedField || !(rejectedField in fields) || attempt === 5) {
      return { ...result, airtableFields: fields, skippedFields: allSkippedFields };
    }

    fields = { ...fields };
    delete fields[rejectedField];
    const skippedField = {
      airtableField: rejectedField,
      reason: "Airtable rejected this field value; retried without it.",
    };
    allSkippedFields.push(skippedField);
    console.warn("Retrying Airtable update without rejected field", {
      platform,
      recordId,
      tableId,
      skippedField,
      remainingFieldCount: Object.keys(fields).length,
    });
  }

  return emptyPatchAttempt(fields, allSkippedFields);
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
      continue;
    }

    fields[fieldConfig.airtableField] = coerceForAirtableFieldMetadata(normalizedFields[normalizedKey], field);
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

function cleanEmptyValues(airtableFields: NormalizedFields, allowClearing: boolean) {
  if (allowClearing) {
    return { fields: airtableFields, skippedFields: [] as SkippedAirtableField[] };
  }

  const fields: NormalizedFields = {};
  const skippedFields: SkippedAirtableField[] = [];

  for (const [airtableField, value] of Object.entries(airtableFields)) {
    if (isEmptyAirtableValue(value)) {
      skippedFields.push({
        airtableField,
        reason: "Empty Airtable value was not sent to avoid clearing existing data.",
      });
      continue;
    }

    fields[airtableField] = value;
  }

  if (skippedFields.length > 0) {
    console.warn("Skipping empty Airtable fields", {
      skippedFields,
    });
  }

  return { fields, skippedFields };
}

function isEmptyAirtableValue(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function emptyPatchAttempt(airtableFields: NormalizedFields, skippedFields: SkippedAirtableField[]): PatchAttempt {
  const body = {
    error: {
      message: "No non-empty Airtable fields to update",
    },
  };

  return {
    response: new Response(JSON.stringify(body), { status: 422 }),
    body,
    airtableFields,
    skippedFields,
  };
}

function applyExistingIdentityFallback(
  platform: Platform,
  recordId: string,
  airtableFields: NormalizedFields,
  existingFields: NormalizedFields | null,
): NormalizedFields {
  if (!existingFields) {
    return airtableFields;
  }

  const primaryField = platform === "tiktok" ? "Tiktok Username" : "Instagram Username";
  if (!isEmptyAirtableValue(airtableFields[primaryField])) {
    return airtableFields;
  }

  const existingUsername = getExistingIdentityValue(existingFields, platform);
  if (!existingUsername) {
    return airtableFields;
  }

  console.warn("Parser did not find username. Preserving existing Airtable username.", {
    platform,
    recordId,
    airtableField: primaryField,
  });

  return {
    ...airtableFields,
    [primaryField]: existingUsername,
  };
}

function needsIdentityFallback(platform: Platform, airtableFields: NormalizedFields): boolean {
  const primaryField = platform === "tiktok" ? "Tiktok Username" : "Instagram Username";
  return primaryField in airtableFields && isEmptyAirtableValue(airtableFields[primaryField]);
}

function getExistingIdentityValue(existingFields: NormalizedFields, platform: Platform): unknown {
  const candidates =
    platform === "tiktok"
      ? ["Tiktok Username", "TikTok Username", "Username", "Handle"]
      : ["Instagram Username", "Username", "Handle"];

  for (const field of candidates) {
    const value = existingFields[field];
    if (!isEmptyAirtableValue(value)) {
      return value;
    }
  }

  return null;
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

function getRecordId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("id" in body)) {
    return null;
  }

  const id = (body as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function getRecordFields(body: unknown): NormalizedFields | null {
  if (typeof body !== "object" || body === null || !("fields" in body)) {
    return null;
  }

  const fields = (body as { fields?: unknown }).fields;
  return typeof fields === "object" && fields !== null && !Array.isArray(fields) ? (fields as NormalizedFields) : null;
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

function coerceForAirtableFieldMetadata(value: unknown, field: AirtableFieldMetadata): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (isTextFieldType(field.type)) {
    return String(value);
  }

  if (["number", "percent", "rating", "duration", "currency"].includes(field.type)) {
    const number = Number(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  if (field.type === "checkbox") {
    if (typeof value === "boolean") {
      return value;
    }

    const text = String(value).trim().toLowerCase();
    if (["true", "yes", "1", "y"].includes(text)) {
      return true;
    }
    if (["false", "no", "0", "n"].includes(text)) {
      return false;
    }
    return Boolean(value);
  }

  if (field.type === "date") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  if (field.type === "dateTime") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (field.type === "singleSelect") {
    const optionName = findSelectOptionName(field, value);
    return optionName ? { name: optionName } : null;
  }

  if (field.type === "multipleSelects") {
    const values = Array.isArray(value) ? value : String(value).split(",");
    const options = values.map((item) => findSelectOptionName(field, item)).filter((item): item is string => Boolean(item));
    return options.length > 0 ? options.map((name) => ({ name })) : null;
  }

  return value;
}

function isTextFieldType(type: string): boolean {
  return ["singleLineText", "multilineText", "richText", "email", "phoneNumber", "url"].includes(type);
}

function findSelectOptionName(field: AirtableFieldMetadata, value: unknown): string | null {
  const requested = String(value).trim();
  if (!requested) {
    return null;
  }

  const choices = getSelectChoices(field.options);
  const match = choices.find((choice) => choice === requested || choice.toLowerCase() === requested.toLowerCase());
  return match ?? null;
}

function getSelectChoices(options: unknown): string[] {
  if (typeof options !== "object" || options === null || !("choices" in options)) {
    return [];
  }

  const choices = (options as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return [];
  }

  return choices
    .map((choice) => {
      if (typeof choice !== "object" || choice === null || !("name" in choice)) {
        return null;
      }

      const name = (choice as { name?: unknown }).name;
      return typeof name === "string" ? name : null;
    })
    .filter((name): name is string => Boolean(name));
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
