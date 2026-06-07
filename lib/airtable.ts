import type { Platform } from "./parser";
import { removeUndefined } from "./parser";

type NormalizedFields = Record<string, unknown>;

type AirtableTable = {
  id: string;
  name: string;
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
};

export const TIKTOK_AIRTABLE_FIELD_MAP: Record<string, string> = {
  tiktok_username: "tiktok_username",
  country: "country",
  niche: "niche",
  bio: "bio",
  tiktok_profile_url: "tiktok_profile_url",
  followers: "followers",
  avg_views: "avg_views",
  avg_likes: "avg_likes",
  total_likes: "total_likes",
  engagement_rate: "engagement_rate",
  audience_country: "audience_country",
  audience_gender: "audience_gender",
  audience_age: "audience_age",
  tiktok_rate: "tiktok_rate",
  tiktok_base_rate: "tiktok_base_rate",
  exclusivity: "exclusivity",
  phone_number: "phone_number",
  hype_auditor_profile: "hype_auditor_profile",
  last_updated: "last_updated",
  instagram_url: "instagram_url",
  instagram_rate: "instagram_rate",
  email: "email",
};

export const INSTAGRAM_AIRTABLE_FIELD_MAP: Record<string, string> = {
  instagram_username: "instagram_username",
  country: "country",
  niche: "niche",
  bio: "bio",
  instagram_profile_url: "instagram_profile_url",
  followers: "followers",
  avg_views: "avg_views",
  average_likes: "average_likes",
  total_likes: "total_likes",
  engagement_rate: "engagement_rate",
  audience_country: "audience_country",
  audience_gender: "audience_gender",
  audience_age: "audience_age",
  instagram_rate: "instagram_rate",
  exclusivity: "exclusivity",
  phone_number: "phone_number",
  hype_auditor_profile: "hype_auditor_profile",
  last_updated: "last_updated",
};

export class AirtableUpdateError extends Error {
  status: number;
  responseBody: unknown;
  configuredTableId?: string;
  initialTableId?: string;
  resolvedTableId?: string | null;
  resolvedTableName?: string | null;
  autoDiscoveryRan?: boolean;

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
  }
}

export function mapToAirtableFields(fields: NormalizedFields, platform: Platform): NormalizedFields {
  const map = platform === "tiktok" ? TIKTOK_AIRTABLE_FIELD_MAP : INSTAGRAM_AIRTABLE_FIELD_MAP;
  const mapped = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key in map)
      .map(([key, value]) => [map[key], value]),
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
  const target = { apiKey, baseId, configuredTableId, initialTableId };
  const firstAttempt = await patchRecord(target, recordId, airtableFields, initialTableId);
  if (firstAttempt.response.ok) {
    return buildUpdateResult({
      airtableFields,
      responseBody: firstAttempt.body,
      configuredTableId,
      initialTableId,
      resolvedTableId: initialTableId,
      resolvedTableName: null,
      autoDiscoveryRan: false,
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
    });
  }

  const retry = await patchRecord(target, recordId, airtableFields, resolved.id);
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
    });
  }

  return buildUpdateResult({
    airtableFields,
    responseBody: retry.body,
    configuredTableId,
    initialTableId,
    resolvedTableId: resolved.id,
    resolvedTableName: resolved.name,
    autoDiscoveryRan: true,
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

  return tables
    .map((table) => {
      if (typeof table !== "object" || table === null) {
        return null;
      }

      const id = (table as { id?: unknown }).id;
      const name = (table as { name?: unknown }).name;
      return typeof id === "string" && typeof name === "string" ? { id, name } : null;
    })
    .filter((table): table is AirtableTable => Boolean(table));
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
