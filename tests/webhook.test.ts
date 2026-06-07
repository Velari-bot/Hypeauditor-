import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import tiktokSample from "../fixtures/tiktok-hypeauditor-sample.json";
import instagramSample from "../fixtures/instagram-hypeauditor-sample.json";
import instagramUserSample from "../fixtures/instagram-hypeauditor-user-sample.json";
import { POST } from "../app/api/webhooks/hypeauditor/route";
import { POST as DEBUG_PARSE_POST } from "../app/api/debug/parse/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/hypeauditor", () => {
  it("returns 200 and success true for a valid TikTok payload", async () => {
    setTikTokEnv();
    const fetchMock = mockAirtableSuccess();

    const response = await postWebhook({
      recordId: "recTiktok",
      platform: "tiktok",
      hypeauditorData: tiktokSample,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      platform: "tiktok",
      recordId: "recTiktok",
      username: "mrbeast",
      parsed: {
        tiktok_username: "mrbeast",
        email: "contact@mrbeastbusiness.com",
      },
    });
    expect(body.updatedFields).toContain("Tiktok Username");
    expect(body.airtableTarget).toMatchObject({
      configuredTableId: "table",
      initialTableId: "table",
      resolvedTableId: "table",
      resolvedTableName: null,
      autoDiscoveryRan: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 200 and success true for a valid Instagram payload", async () => {
    setInstagramEnv();
    const fetchMock = mockAirtableSuccess();

    const response = await postWebhook({
      recordId: "recInstagram",
      platform: "instagram",
      hypeauditorData: instagramSample,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      platform: "instagram",
      recordId: "recInstagram",
      username: "examplecreator",
      parsed: {
        instagram_username: "examplecreator",
        average_likes: 8500,
      },
    });
    expect(body.updatedFields).toContain("Instagram Username");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 200 and success true for an Instagram result.user payload", async () => {
    setInstagramEnv();
    const fetchMock = mockAirtableSuccess();

    const response = await postWebhook({
      recordId: "recInstagram",
      platform: "instagram",
      hypeauditorData: instagramUserSample,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      platform: "instagram",
      recordId: "recInstagram",
      username: "mrbeast",
      parsed: {
        instagram_username: "mrbeast",
        bio: "Watch my latest video!! 👇",
        instagram_profile_url: "https://www.instagram.com/mrbeast/",
        followers: 86954423,
        average_likes: 6167,
        niche: "Entertainment, Video & Movies",
        hype_auditor_profile: "https://hypeauditor.com/instagram/mrbeast/",
      },
    });
    expect(body.updatedFields).toContain("Instagram Username");
    expect(body.updatedFields).toContain("Average Likes");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when recordId is missing", async () => {
    const response = await postWebhook({
      platform: "tiktok",
      hypeauditorData: tiktokSample,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/recordId/);
  });

  it("returns 400 for an invalid platform", async () => {
    const response = await postWebhook({
      recordId: "rec123",
      platform: "youtube",
      hypeauditorData: tiktokSample,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/platform/);
  });

  it("returns 401 when a configured secret is missing or wrong", async () => {
    process.env.WEBHOOK_SECRET = "test-secret";

    const missing = await postWebhook({
      recordId: "rec123",
      platform: "tiktok",
      hypeauditorData: tiktokSample,
    });
    const wrong = await postWebhook(
      {
        recordId: "rec123",
        platform: "tiktok",
        hypeauditorData: tiktokSample,
      },
      { secret: "wrong-secret" },
    );

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  it("returns 500 with a useful message when Airtable fails", async () => {
    setTikTokEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }]))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Bad Airtable request" } }), { status: 422 })),
    );

    const response = await postWebhook({
      recordId: "rec123",
      platform: "tiktok",
      hypeauditorData: tiktokSample,
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Bad Airtable request");
    expect(body.airtableStatus).toBe(422);
  });

  it("returns 422 when an Instagram payload produces no usable parsed fields", async () => {
    setInstagramEnv();
    const fetchMock = vi.fn();
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postWebhook({
      recordId: "recInstagram",
      platform: "instagram",
      hypeauditorData: { result: { report_state: "READY", report: { basic: {}, metrics: {}, features: {} } } },
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      error: "Parsed Instagram payload produced no usable fields",
      debug: {
        bodyKeys: expect.arrayContaining(["recordId", "platform", "hypeauditorData"]),
        hypeauditorDataKeys: expect.arrayContaining(["result"]),
        platform: "instagram",
        recordID: "recInstagram",
        reportFound: true,
        checkedReportPaths: expect.arrayContaining(["raw.result.report", "raw.output.result.report"]),
        checkedPaths: expect.arrayContaining(["raw.result.report", "raw.output.result.report"]),
        reportPath: "raw.result.report",
        foundReportPath: "raw.result.report",
        reportKeys: expect.arrayContaining(["basic", "metrics", "features"]),
        basicKeys: [],
        metricsKeys: [],
        featuresKeys: [],
        hypeauditorDataWasString: false,
        stringLength: null,
        stringPreview: null,
        jsonParseSucceeded: null,
        samplePreview: expect.stringContaining("report_state"),
      },
    });
    expect(body.message).toMatch(/payload was received/i);
    expect(logMock).toHaveBeenCalledWith(
      "INSTAGRAM NO USABLE FIELDS DEBUG",
      expect.objectContaining({
        platform: "instagram",
        recordID: "recInstagram",
        foundReportPath: "raw.result.report",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debug parse endpoint returns parsed and debug info without Airtable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await DEBUG_PARSE_POST(
      new NextRequest("http://localhost/api/debug/parse", {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          platform: "instagram",
          hypeauditorData: {
            output: instagramSample,
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      platform: "instagram",
      parsed: {
        instagram_username: "examplecreator",
      },
      debug: {
        reportFound: true,
        foundPath: "raw.output.result.report",
        foundReportPath: "raw.output.result.report",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debug parse endpoint returns string diagnostics without Airtable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const stringifiedPayload = JSON.stringify({
      result: {
        report_state: "READY",
        report: {
          basic: {},
          metrics: {},
          features: {},
        },
      },
    });

    const response = await DEBUG_PARSE_POST(
      new NextRequest("http://localhost/api/debug/parse", {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          platform: "instagram",
          hypeauditorData: stringifiedPayload,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      platform: "instagram",
      debug: {
        platform: "instagram",
        hypeauditorDataWasString: true,
        stringLength: stringifiedPayload.length,
        stringPreview: stringifiedPayload.slice(0, 500),
        jsonParseSucceeded: true,
        foundReportPath: "raw.result.report",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dry-run returns normalized and mapped fields without calling Airtable", async () => {
    setTikTokEnv();
    process.env.WEBHOOK_SECRET = "test-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postWebhook(
      {
        recordId: "recTEST123",
        platform: "tiktok",
        hypeauditorData: tiktokSample,
      },
      { dryRun: true, secret: "test-secret" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      platform: "tiktok",
      recordId: "recTEST123",
      username: "mrbeast",
      airtableBody: {
        fields: {
          "Tiktok Username": "mrbeast",
          Email: "contact@mrbeastbusiness.com",
        },
      },
      parsed: {
        tiktok_username: "mrbeast",
      },
    });
    expect(body.updatedFields).toContain("Tiktok Username");
    expect(body.airtableTarget).toMatchObject({
      configuredTableId: "table",
      incomingTableOverride: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes an incoming table override through to Airtable", async () => {
    setTikTokEnv();
    const fetchMock = mockAirtableSuccess();

    const response = await postWebhook({
      recordId: "recTiktok",
      platform: "tiktok",
      airtableTableId: "overrideTable",
      hypeauditorData: tiktokSample,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.airtableTarget).toMatchObject({
      configuredTableId: "table",
      initialTableId: "overrideTable",
      resolvedTableId: "overrideTable",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.airtable.com/v0/base/overrideTable/recTiktok",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

function postWebhook(
  body: Record<string, unknown>,
  options: { dryRun?: boolean; secret?: string } = {},
) {
  const url = `http://localhost/api/webhooks/hypeauditor${options.dryRun ? "?dryRun=true" : ""}`;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.secret) {
    headers.set("x-webhook-secret", options.secret);
  }

  return POST(
    new NextRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function setTikTokEnv() {
  process.env.AIRTABLE_API_KEY = "key";
  process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
  process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
}

function setInstagramEnv() {
  process.env.AIRTABLE_API_KEY = "key";
  process.env.INSTAGRAM_AIRTABLE_BASE_ID = "base";
  process.env.INSTAGRAM_AIRTABLE_TABLE_ID = "table";
}

function mockAirtableSuccess() {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }, { id: "overrideTable", name: "Override" }]))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "rec123" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function tablesResponse(tables: Array<{ id: string; name: string }>) {
  return new Response(JSON.stringify({ tables }), { status: 200 });
}
