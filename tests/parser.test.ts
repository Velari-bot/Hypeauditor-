import { describe, expect, it } from "vitest";
import tiktokSample from "../fixtures/tiktok-hypeauditor-sample.json";
import instagramSample from "../fixtures/instagram-hypeauditor-sample.json";
import {
  extractEmail,
  extractPhone,
  formatAudienceAge,
  formatAudienceCountries,
  formatAudienceGender,
  formatLastUpdated,
  parseIncomingPayload,
  parseInstagram,
  parseTikTok,
  PayloadParseError,
} from "../lib/parser";

describe("parseIncomingPayload", () => {
  it("supports payload as object", () => {
    const parsed = parseIncomingPayload({
      recordId: "rec123",
      platform: "tiktok",
      hypeauditorData: tiktokSample,
    });

    expect(parsed.recordId).toBe("rec123");
    expect(parsed.platform).toBe("tiktok");
    expect(parseTikTok(parsed.raw).tiktok_username).toBe("mrbeast");
  });

  it("supports payload as stringified JSON", () => {
    const parsed = parseIncomingPayload(JSON.stringify({
      recordId: "rec123",
      platform: "instagram",
      hypeauditorData: JSON.stringify(instagramSample),
    }));

    expect(parsed.platform).toBe("instagram");
    expect(parseInstagram(parsed.raw).instagram_username).toBe("examplecreator");
  });

  it("supports payload nested under hypeauditorData", () => {
    const parsed = parseIncomingPayload({
      recordId: "rec456",
      platform: "tiktok",
      hypeauditorData: JSON.stringify(tiktokSample),
    });

    expect(parseTikTok(parsed.raw).followers).toBe(124700000);
  });

  it("accepts Zapier-style recordID casing", () => {
    const parsed = parseIncomingPayload({
      recordID: "recZapier123",
      platform: "tiktok",
      hypeauditorData: tiktokSample,
    });

    expect(parsed.recordId).toBe("recZapier123");
  });

  it("extracts optional input username fallback keys", () => {
    expect(
      parseIncomingPayload({
        recordId: "rec123",
        platform: "tiktok",
        inputUsername: "@fallback_creator",
        hypeauditorData: tiktokSample,
      }).inputUsername,
    ).toBe("fallback_creator");
    expect(
      parseIncomingPayload({
        recordId: "rec123",
        platform: "instagram",
        creatorUsername: "creatorgram",
        hypeauditorData: instagramSample,
      }).inputUsername,
    ).toBe("creatorgram");
  });

  it("accepts Airtable table override keys", () => {
    expect(
      parseIncomingPayload({
        recordId: "rec123",
        platform: "tiktok",
        airtableTableId: "tblOverride",
        hypeauditorData: tiktokSample,
      }).airtableTableId,
    ).toBe("tblOverride");
    expect(
      parseIncomingPayload({
        recordId: "rec123",
        platform: "tiktok",
        tableId: "tblTableId",
        hypeauditorData: tiktokSample,
      }).airtableTableId,
    ).toBe("tblTableId");
    expect(
      parseIncomingPayload({
        recordId: "rec123",
        platform: "tiktok",
        airtable_table_id: "tblSnake",
        hypeauditorData: tiktokSample,
      }).airtableTableId,
    ).toBe("tblSnake");
  });

  it("supports the full HypeAuditor result directly as the body", () => {
    const parsed = parseIncomingPayload(tiktokSample);

    expect(parseTikTok(parsed.raw).tiktok_username).toBe("mrbeast");
  });

  it("throws a helpful error for invalid JSON strings", () => {
    expect(() => parseIncomingPayload('{"recordId": "rec123",')).toThrow(PayloadParseError);
    expect(() => parseIncomingPayload({ hypeauditorData: '{"result": ' })).toThrow(/Invalid JSON/);
  });
});

describe("creator parsers", () => {
  it("parses TikTok fields", () => {
    const parsed = parseTikTok(tiktokSample);

    expect(parsed).toMatchObject({
      tiktok_username: "mrbeast",
      country: "US",
      niche: "Entertainment",
      bio: "Business: [contact@mrbeastbusiness.com](mailto:contact@mrbeastbusiness.com) Call +1 704-236-4517",
      tiktok_profile_url: "https://www.tiktok.com/@mrbeast",
      followers: 124700000,
      avg_views: 12100000,
      avg_likes: 520100,
      total_likes: 1300000000,
      engagement_rate: 6.83,
      tiktok_rate: "$204139.00",
      tiktok_base_rate: "$102000.00",
      hype_auditor_profile: "https://hypeauditor.com/tiktok/mrbeast/",
      instagram_url: "https://www.instagram.com/mrbeast/",
      email: "contact@mrbeastbusiness.com",
      phone_number: "+1 704-236-4517",
    });
    expect(parsed.audience_country).toBe("US 35.05%, GB 6.34%, PK 4.45%, BD 3.52%, MX 3.3%");
    expect(parsed.audience_gender).toBe("Male 64.59% / Female 32.19%");
    expect(parsed.audience_age).toContain("25-34 (46.12%)");
  });

  it("parses Instagram fields", () => {
    const parsed = parseInstagram(instagramSample);

    expect(parsed).toMatchObject({
      instagram_username: "examplecreator",
      country: "GB",
      niche: "Lifestyle",
      instagram_profile_url: "https://www.instagram.com/examplecreator/",
      followers: 500000,
      avg_views: 100000,
      average_likes: 8500,
      total_likes: 2000000,
      engagement_rate: 4.2,
      instagram_rate: "$1500.00",
      phone_number: "+1 646-555-0100",
      hype_auditor_profile: "https://hypeauditor.com/instagram/examplecreator/",
    });
    expect("avg_likes" in parsed).toBe(false);
    expect("tiktok_rate" in parsed).toBe(false);
  });

  it("returns nulls instead of crashing on missing nested fields", () => {
    const parsed = parseTikTok({ result: { report_state: "READY", report: { basic: {} } } });

    expect(parsed.tiktok_username).toBeNull();
    expect(parsed.followers).toBeNull();
    expect(parsed.audience_country).toBeNull();
    expect(parsed.exclusivity).toBeNull();
  });

  it("uses inputUsername when TikTok basic username is missing", () => {
    const parsed = parseTikTok({ result: { report_state: "READY", report: { basic: {} } } }, { inputUsername: "@backup" });

    expect(parsed.tiktok_username).toBe("backup");
    expect(parsed.tiktok_profile_url).toBe("https://www.tiktok.com/@backup");
  });

  it("uses inputUsername when Instagram basic username is missing", () => {
    const parsed = parseInstagram({ result: { report_state: "READY", report: { basic: {} } } }, { inputUsername: "backupgram" });

    expect(parsed.instagram_username).toBe("backupgram");
    expect(parsed.instagram_profile_url).toBe("https://www.instagram.com/backupgram/");
  });
});

describe("formatters and extractors", () => {
  const ageGender = {
    "13-17": { male: 5.92, female: 4.43 },
    "18-24": { male: 12.65, female: 10.22 },
    "25-34": { male: 30.93, female: 15.19 },
    "35-44": { male: 15.09, female: 2.35 },
  };

  it("formats audience countries", () => {
    expect(
      formatAudienceCountries([
        { code: "us", prc: 35.05 },
        { code: "gb", prc: 6.34 },
        { code: "pk", prc: 4.45 },
        { code: "bd", prc: 3.52 },
        { code: "mx", prc: 3.3 },
        { code: "ca", prc: 2.1 },
      ]),
    ).toBe("US 35.05%, GB 6.34%, PK 4.45%, BD 3.52%, MX 3.3%");
  });

  it("formats audience gender", () => {
    expect(formatAudienceGender(ageGender)).toBe("Male 64.59% / Female 32.19%");
  });

  it("formats audience age", () => {
    expect(formatAudienceAge(ageGender)).toBe("25-34 (46.12%), 18-24 (22.87%), 35-44 (17.44%)");
  });

  it("extracts email from bio", () => {
    expect(extractEmail("Email me at creator@example.com")).toBe("creator@example.com");
  });

  it("falls back to blogger email when bio has no email", () => {
    const sample = structuredClone(tiktokSample);
    sample.result.report.basic.description = "No email here.";

    expect(parseTikTok(sample).email).toBe("fallback@mrbeast.com");
  });

  it("extracts phone from bio", () => {
    expect(extractPhone("Call +1 (212) 555-0199 today")).toBe("+1 (212) 555-0199");
  });

  it("formats last updated as an ISO timestamp for Airtable date fields", () => {
    expect(formatLastUpdated(new Date("2026-06-07T15:28:00.000Z"))).toBe("2026-06-07T15:28:00.000Z");
  });
});
