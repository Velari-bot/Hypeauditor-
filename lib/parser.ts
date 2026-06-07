export type Platform = "tiktok" | "instagram";

type UnknownRecord = Record<string, unknown>;

export type ParsedIncomingPayload = {
  recordId: string | null;
  platform: Platform | null;
  airtableTableId: string | null;
  inputUsername: string | null;
  raw: unknown;
};

export class PayloadParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadParseError";
  }
}

export type TikTokFields = {
  tiktok_username: string | null;
  country: string | null;
  niche: string | null;
  bio: string | null;
  tiktok_profile_url: string | null;
  followers: number | null;
  avg_views: number | null;
  avg_likes: number | null;
  total_likes: number | null;
  engagement_rate: number | null;
  audience_country: string | null;
  audience_gender: string | null;
  audience_age: string | null;
  tiktok_rate: string | null;
  tiktok_base_rate: string | null;
  exclusivity: null;
  phone_number: string | null;
  hype_auditor_profile: string | null;
  last_updated: string | null;
  instagram_url: string | null;
  instagram_rate: string | null;
  email: string | null;
};

export type InstagramFields = {
  instagram_username: string | null;
  country: string | null;
  niche: string | null;
  bio: string | null;
  instagram_profile_url: string | null;
  followers: number | null;
  avg_views: number | null;
  average_likes: number | null;
  total_likes: number | null;
  engagement_rate: number | null;
  audience_country: string | null;
  audience_gender: string | null;
  audience_age: string | null;
  instagram_rate: string | null;
  exclusivity: null;
  phone_number: string | null;
  hype_auditor_profile: string | null;
  last_updated: string | null;
};

const PAYLOAD_KEYS = [
  "hypeauditorData",
  "hypeAuditorData",
  "data",
  "result",
  "payload",
  "raw",
  "body",
];

const THEMATIC_MAP: Record<string, string> = {
  "1": "Beauty",
  "2": "Fashion",
  "3": "Fitness",
  "4": "Entertainment",
  "5": "Food",
  "6": "Travel",
  "7": "Gaming",
  "8": "Lifestyle",
  "9": "Music",
  "10": "Sports",
  "11": "Technology",
  "12": "Education",
  "13": "Family",
  "14": "Business",
  "15": "Art",
};

export function parseIncomingPayload(reqBody: unknown): ParsedIncomingPayload {
  const body = parseJsonDeep(reqBody, "request body");
  const bodyObject = isRecord(body) ? body : {};
  const recordId =
    toCleanString(bodyObject.recordId) ??
    toCleanString(bodyObject.recordID) ??
    toCleanString(bodyObject.record_id) ??
    toCleanString(bodyObject.airtableRecordId);
  const platformValue = toCleanString(bodyObject.platform)?.toLowerCase();
  const platform = platformValue === "tiktok" || platformValue === "instagram" ? platformValue : null;
  const airtableTableId =
    toCleanString(bodyObject.airtableTableId) ??
    toCleanString(bodyObject.tableId) ??
    toCleanString(bodyObject.airtable_table_id);
  const inputUsername =
    cleanUsername(toCleanString(bodyObject.inputUsername)) ??
    cleanUsername(toCleanString(bodyObject.username)) ??
    cleanUsername(toCleanString(bodyObject.handle)) ??
    cleanUsername(toCleanString(bodyObject.creatorUsername));
  const raw = findPayloadCandidate(bodyObject) ?? body;

  return {
    recordId,
    platform,
    airtableTableId,
    inputUsername,
    raw: normalizeHypeAuditorPayload(raw),
  };
}

export function normalizeHypeAuditorPayload(raw: unknown): unknown {
  const parsed = parseJsonDeep(raw, "HypeAuditor payload");

  if (isRecord(parsed) && !hasReportShape(parsed)) {
    for (const key of PAYLOAD_KEYS) {
      if (key in parsed) {
        const nested = parseJsonDeep(parsed[key], key);
        if (hasReportShape(nested)) {
          return nested;
        }
      }
    }
  }

  return parsed;
}

export function parseTikTok(raw: unknown, options: { inputUsername?: string | null } = {}): TikTokFields {
  const parsed = normalizeHypeAuditorPayload(raw);
  const report = getReport(parsed);
  const basic = asRecord(report.basic);
  const metrics = asRecord(report.metrics);
  const features = asRecord(report.features);
  const username = cleanUsername(toCleanString(basic.username)) ?? cleanUsername(options.inputUsername ?? null);
  const bio = toCleanString(basic.description);
  const email = extractEmail(bio) ?? extractEmail(firstArrayValue(valueAt(features, ["blogger_emails", "data"])));

  return removeUndefined({
    tiktok_username: username,
    country: uppercaseOrNull(valueAt(features, ["blogger_geo", "data", "country"])),
    niche: formatNiche(valueAt(features, ["blogger_thematics", "data"])),
    bio,
    tiktok_profile_url: username ? `https://www.tiktok.com/@${username}` : null,
    followers: toNumber(valueAt(metrics, ["subscribers_count", "value"])),
    avg_views: toNumber(valueAt(metrics, ["views_avg", "value"])),
    avg_likes: toNumber(valueAt(metrics, ["alikes_avg", "value"])),
    total_likes: toNumber(valueAt(metrics, ["likes_count", "value"])),
    engagement_rate: toNumber(valueAt(metrics, ["er", "value"])),
    audience_country: formatAudienceCountries(valueAt(features, ["audience_geo", "data", "countries"])),
    audience_gender: formatAudienceGender(valueAt(features, ["audience_age_gender", "data"])),
    audience_age: formatAudienceAge(valueAt(features, ["audience_age_gender", "data"])),
    tiktok_rate: formatCurrency(valueAt(features, ["blogger_prices", "data", "post_price"])),
    tiktok_base_rate: formatCurrency(valueAt(features, ["blogger_prices", "data", "post_price_from"])),
    exclusivity: null,
    phone_number: extractPhone(bio),
    hype_auditor_profile: username ? `https://hypeauditor.com/tiktok/${username}/` : null,
    last_updated: formatLastUpdated(),
    instagram_url: findConnectedInstagramUrl(report.social_networks, username),
    instagram_rate: null,
    email,
  }) as TikTokFields;
}

export function parseInstagram(raw: unknown, options: { inputUsername?: string | null } = {}): InstagramFields {
  const parsed = normalizeHypeAuditorPayload(raw);
  const report = getReport(parsed);
  const basic = asRecord(report.basic);
  const metrics = asRecord(report.metrics);
  const features = asRecord(report.features);
  const username = cleanUsername(toCleanString(basic.username)) ?? cleanUsername(options.inputUsername ?? null);
  const bio = toCleanString(basic.description);

  return removeUndefined({
    instagram_username: username,
    country: uppercaseOrNull(valueAt(features, ["blogger_geo", "data", "country"])),
    niche: formatNiche(valueAt(features, ["blogger_thematics", "data"])),
    bio,
    instagram_profile_url: username ? `https://www.instagram.com/${username}/` : null,
    followers: toNumber(valueAt(metrics, ["subscribers_count", "value"])),
    avg_views: toNumber(valueAt(metrics, ["views_avg", "value"])),
    average_likes: toNumber(valueAt(metrics, ["alikes_avg", "value"])),
    total_likes: toNumber(valueAt(metrics, ["likes_count", "value"])),
    engagement_rate: toNumber(valueAt(metrics, ["er", "value"])),
    audience_country: formatAudienceCountries(valueAt(features, ["audience_geo", "data", "countries"])),
    audience_gender: formatAudienceGender(valueAt(features, ["audience_age_gender", "data"])),
    audience_age: formatAudienceAge(valueAt(features, ["audience_age_gender", "data"])),
    instagram_rate: formatCurrency(valueAt(features, ["blogger_prices", "data", "post_price"])),
    exclusivity: null,
    phone_number: extractPhone(bio),
    hype_auditor_profile: username ? `https://hypeauditor.com/instagram/${username}/` : null,
    last_updated: formatLastUpdated(),
  }) as InstagramFields;
}

export function formatAudienceCountries(countries: unknown): string | null {
  if (!Array.isArray(countries)) {
    return null;
  }

  const formatted = countries
    .map((country) => {
      const item = asRecord(country);
      const code = uppercaseOrNull(item.code ?? item.id ?? item.country);
      const percent = toNumber(item.prc ?? item.percent ?? item.percentage);
      return code && percent !== null ? `${code} ${formatPercent(percent, 2)}%` : null;
    })
    .filter(Boolean)
    .slice(0, 5);

  return formatted.length > 0 ? formatted.join(", ") : null;
}

export function formatAudienceGender(ageGender: unknown): string | null {
  const data = asRecord(ageGender);
  let male = 0;
  let female = 0;
  let found = false;

  for (const bucket of Object.values(data)) {
    const row = asRecord(bucket);
    const maleValue = toNumber(row.male);
    const femaleValue = toNumber(row.female);
    if (maleValue !== null || femaleValue !== null) {
      found = true;
      male += maleValue ?? 0;
      female += femaleValue ?? 0;
    }
  }

  return found ? `Male ${formatPercent(male, 2)}% / Female ${formatPercent(female, 2)}%` : null;
}

export function formatAudienceAge(ageGender: unknown): string | null {
  const data = asRecord(ageGender);
  const buckets = Object.entries(data)
    .map(([age, value]) => {
      const row = asRecord(value);
      const male = toNumber(row.male) ?? 0;
      const female = toNumber(row.female) ?? 0;
      return { age, total: male + female };
    })
    .filter((bucket) => bucket.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map((bucket) => `${bucket.age} (${formatPercent(bucket.total, 2)}%)`);

  return buckets.length > 0 ? buckets.join(", ") : null;
}

export function extractEmail(text: unknown): string | null {
  const value = toCleanString(text);
  if (!value) {
    return null;
  }

  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

export function extractPhone(text: unknown): string | null {
  const value = toCleanString(text);
  if (!value) {
    return null;
  }

  const match = value.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/);
  return match?.[0].trim() ?? null;
}

export function formatCurrency(value: unknown): string | null {
  const number = toNumber(value);
  return number === null ? null : `$${number.toFixed(2)}`;
}

export function formatLastUpdated(date = new Date()): string {
  return date.toISOString();
}

export function removeUndefined<T extends UnknownRecord>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
}

export function getReport(raw: unknown): UnknownRecord {
  const parsed = asRecord(normalizeHypeAuditorPayload(raw));
  const candidates = [
    valueAt(parsed, ["result", "report"]),
    parsed.report,
    valueAt(parsed, ["data", "result", "report"]),
    valueAt(parsed, ["data", "report"]),
  ];

  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return {};
}

export function getReportState(raw: unknown): string | null {
  const parsed = asRecord(normalizeHypeAuditorPayload(raw));
  return (
    toCleanString(valueAt(parsed, ["result", "report_state"])) ??
    toCleanString(parsed.report_state) ??
    toCleanString(valueAt(parsed, ["data", "result", "report_state"])) ??
    toCleanString(valueAt(parsed, ["data", "report_state"]))
  );
}

export function getPayloadDebugInfo(raw: unknown) {
  const parsed = asRecord(normalizeHypeAuditorPayload(raw));
  const reportPath = findReportPath(parsed);
  const report = getReport(parsed);
  const basic = asRecord(report.basic);
  const metrics = asRecord(report.metrics);
  const features = asRecord(report.features);

  return {
    topLevelKeys: Object.keys(parsed),
    reportPath,
    report_state: getReportState(parsed),
    basicUsername: toCleanString(basic.username),
    basicDescriptionPresent: Boolean(toCleanString(basic.description)),
    metricKeys: Object.keys(metrics),
    featureKeys: Object.keys(features),
  };
}

function findReportPath(parsed: UnknownRecord): string | null {
  const candidates: Array<[string, unknown]> = [
    ["result.report", valueAt(parsed, ["result", "report"])],
    ["report", parsed.report],
    ["data.result.report", valueAt(parsed, ["data", "result", "report"])],
    ["data.report", valueAt(parsed, ["data", "report"])],
  ];

  return candidates.find(([, candidate]) => isRecord(candidate))?.[0] ?? null;
}

function findPayloadCandidate(body: UnknownRecord): unknown {
  for (const key of PAYLOAD_KEYS) {
    if (key in body) {
      const value = body[key];
      if (key === "result" && !hasReportShape({ result: value })) {
        continue;
      }
      return value;
    }
  }
  return undefined;
}

function parseJsonDeep(value: unknown, label: string): unknown {
  let current = value;

  for (let index = 0; index < 5; index += 1) {
    if (typeof current !== "string") {
      return current;
    }

    const trimmed = current.trim();
    if (!trimmed) {
      return current;
    }

    try {
      current = JSON.parse(trimmed);
    } catch (error) {
      if (looksLikeJson(trimmed)) {
        throw new PayloadParseError(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : "parse failed"}`);
      }
      return current;
    }
  }

  return current;
}

function hasReportShape(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(
    valueAt(record, ["result", "report"]) ||
      record.report ||
      valueAt(record, ["data", "result", "report"]) ||
      valueAt(record, ["data", "report"]),
  );
}

function findConnectedInstagramUrl(socialNetworks: unknown, currentUsername: string | null): string | null {
  const socials = asRecord(socialNetworks);
  const data = socials.data;
  if (!Array.isArray(data)) {
    return null;
  }

  const instagram = data.find((item) => {
    const record = asRecord(item);
    const type = toCleanString(record.type)?.toLowerCase();
    const title = toCleanString(record.title)?.toLowerCase() ?? "";
    const network = toCleanString(record.social_network)?.toLowerCase() ?? "";
    return type === "2" || title.includes("instagram") || network.includes("instagram");
  });

  const username = cleanUsername(toCleanString(asRecord(instagram).username));
  if (!username || username === currentUsername) {
    return username ? `https://www.instagram.com/${username}/` : null;
  }

  return `https://www.instagram.com/${username}/`;
}

function formatNiche(value: unknown): string | null {
  if (Array.isArray(value)) {
    const labels = value
      .map((item) => toCleanString(THEMATIC_MAP[String(item)] ?? item))
      .filter((item): item is string => Boolean(item));
    return labels.length > 0 ? labels.join(", ") : null;
  }

  return toCleanString(value);
}

function valueAt(source: unknown, path: string[]): unknown {
  let current = source;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function firstArrayValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function uppercaseOrNull(value: unknown): string | null {
  return toCleanString(value)?.toUpperCase() ?? null;
}

function cleanUsername(value: string | null): string | null {
  return value?.replace(/^@+/, "") ?? null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toCleanString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeJson(value: string): boolean {
  return value.startsWith("{") || value.startsWith("[");
}

function formatPercent(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
