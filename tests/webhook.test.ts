import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import tiktokSample from "../fixtures/tiktok-hypeauditor-sample.json";
import instagramSample from "../fixtures/instagram-hypeauditor-sample.json";
import { POST } from "../app/api/webhooks/hypeauditor/route";

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
    expect(fetchMock).toHaveBeenCalledOnce();
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
    expect(fetchMock).toHaveBeenCalledOnce();
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
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "Bad Airtable request" } }), { status: 422 })),
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
    expect(fetchMock).toHaveBeenCalledWith(
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
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "rec123" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
