import { describe, expect, it } from "vitest";
import tiktokSample from "../fixtures/tiktok-hypeauditor-sample.json";
import instagramSample from "../fixtures/instagram-hypeauditor-sample.json";
import instagramUserSample from "../fixtures/instagram-hypeauditor-user-sample.json";
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
  findHypeAuditorReport,
  getPayloadDebugInfo,
  getWebhookPayloadDebugInfo,
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

  it("supports report nested under output.result.report", () => {
    const parsed = parseIncomingPayload({
      recordId: "rec123",
      platform: "instagram",
      hypeauditorData: {
        output: instagramSample,
      },
    });

    expect(parseInstagram(parsed.raw).instagram_username).toBe("examplecreator");
    expect(getPayloadDebugInfo(parsed.raw).foundPath).toBe("raw.output.result.report");
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

  it("parses Instagram result.user payloads", () => {
    const parsed = parseInstagram(instagramUserSample);

    expect(parsed).toMatchObject({
      instagram_username: "mrbeast",
      bio: "Watch my latest video!! 👇",
      instagram_profile_url: "https://www.instagram.com/mrbeast/",
      followers: 86954423,
      average_likes: 6167,
      niche: "Entertainment, Video & Movies",
      avg_views: null,
      total_likes: null,
      audience_country: null,
      audience_gender: null,
      audience_age: null,
      instagram_rate: null,
      phone_number: null,
      hype_auditor_profile: "https://hypeauditor.com/instagram/mrbeast/",
    });
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

  it("recursively finds a report object inside unknown wrappers", () => {
    const found = findHypeAuditorReport({
      wrapper: {
        inner: {
          final: instagramSample.result.report,
        },
      },
    });

    expect(found.foundPath).toBe("raw.wrapper.inner.final");
    expect(found.report?.basic).toBeTruthy();
  });

  it("recursively finds a report object at depth 8", () => {
    const found = findHypeAuditorReport({
      a: { b: { c: { d: { e: { f: { g: { h: instagramSample.result.report } } } } } } },
    });

    expect(found.foundPath).toBe("raw.a.b.c.d.e.f.g.h");
    expect(found.report?.basic).toBeTruthy();
  });

  it("recognizes alternate Instagram report-like shapes", () => {
    const profileShape = findHypeAuditorReport({
      nested: {
        profile: { username: "profilecreator" },
        metrics: {},
        audience: {},
      },
    });
    const userShape = findHypeAuditorReport({
      nested: {
        user: { username: "usercreator" },
        metrics: {},
        audience: {},
      },
    });
    const reportWrapperShape = findHypeAuditorReport({
      nested: {
        report: {
          basic: { username: "wrappedcreator" },
          metrics: {},
        },
      },
    });

    expect(profileShape.foundPath).toBe("raw.nested");
    expect(profileShape.report?.profile).toBeTruthy();
    expect(userShape.foundPath).toBe("raw.nested");
    expect(userShape.report?.user).toBeTruthy();
    expect(reportWrapperShape.foundPath).toBe("raw.nested");
    expect(reportWrapperShape.report?.basic).toBeTruthy();
  });

  it("includes string diagnostics and a 5000 character preview for webhook debug info", () => {
    const longBio = "x".repeat(6000);
    const stringifiedPayload = JSON.stringify({
      result: {
        report_state: "READY",
        report: {
          basic: { username: "longcreator", description: longBio },
          metrics: {},
          features: {},
        },
      },
    });
    const debug = getWebhookPayloadDebugInfo(
      {
        recordID: "recInstagram",
        platform: "instagram",
        hypeauditorData: stringifiedPayload,
      },
      JSON.parse(stringifiedPayload),
      { platform: "instagram", recordId: "recInstagram" },
    );

    expect(debug.platform).toBe("instagram");
    expect(debug.recordID).toBe("recInstagram");
    expect(debug.hypeauditorDataWasString).toBe(true);
    expect(debug.stringLength).toBe(stringifiedPayload.length);
    expect(debug.stringPreview).toBe(stringifiedPayload.slice(0, 500));
    expect(debug.jsonParseSucceeded).toBe(true);
    expect(debug.samplePreview.length).toBeLessThanOrEqual(5003);
    expect(debug.foundReportPath).toBe("raw.result.report");
    expect(debug.checkedPaths).toContain("raw.result.report");
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
