import type { Platform } from "./parser";
import { removeUndefined } from "./parser";

type NormalizedFields = Record<string, unknown>;

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

  constructor(message: string, status: number, responseBody: unknown) {
    super(message);
    this.name = "AirtableUpdateError";
    this.status = status;
    this.responseBody = responseBody;
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
}: {
  platform: Platform;
  recordId: string;
  fields: NormalizedFields;
}) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_BASE_ID : process.env.INSTAGRAM_AIRTABLE_BASE_ID;
  const tableId =
    platform === "tiktok" ? process.env.TIKTOK_AIRTABLE_TABLE_ID : process.env.INSTAGRAM_AIRTABLE_TABLE_ID;

  if (!apiKey) {
    throw new Error("AIRTABLE_API_KEY is required.");
  }

  if (!baseId || !tableId) {
    throw new Error(`Airtable base and table environment variables are required for ${platform}.`);
  }

  const airtableFields = mapToAirtableFields(fields, platform);
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(
      recordId,
    )}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: airtableFields }),
    },
  );

  const responseBody = await readResponseBody(response);
  if (!response.ok) {
    console.error("Airtable update failed", {
      status: response.status,
      platform,
      recordId,
      responseBody,
    });
    throw new AirtableUpdateError(getAirtableErrorMessage(responseBody), response.status, responseBody);
  }

  return {
    airtableFields,
    responseBody,
  };
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
