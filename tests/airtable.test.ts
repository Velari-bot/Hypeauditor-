import { afterEach, describe, expect, it, vi } from "vitest";
import { mapToAirtableFields, updateAirtable } from "../lib/airtable";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("mapToAirtableFields", () => {
  it("maps TikTok normalized keys to Airtable fields", () => {
    expect(
      mapToAirtableFields(
        {
          tiktok_username: "mrbeast",
          avg_likes: 520100,
          unknown: "ignored",
        },
        "tiktok",
      ),
    ).toEqual({
      "Tiktok Username": "mrbeast",
      "Avg Likes": 520100,
    });
  });

  it("maps Instagram normalized keys to Airtable fields", () => {
    expect(
      mapToAirtableFields(
        {
          instagram_username: "creatorgram",
          average_likes: 12300,
          unknown: "ignored",
        },
        "instagram",
      ),
    ).toEqual({
      "Instagram Username": "creatorgram",
      "Average Likes": 12300,
    });
  });

  it("ignores unknown fields and preserves null fields", () => {
    expect(
      mapToAirtableFields(
        {
          tiktok_username: "mrbeast",
          email: null,
          unknown: "ignored",
        },
        "tiktok",
      ),
    ).toEqual({
      "Tiktok Username": "mrbeast",
      Email: null,
    });
  });

  it("does not send normalized snake_case keys to Airtable", () => {
    const mapped = mapToAirtableFields(
      {
        tiktok_username: "mrbeast",
        audience_gender: "Male 60% / Female 40%",
        hype_auditor_profile: "https://hypeauditor.com/tiktok/mrbeast/",
      },
      "tiktok",
    );

    expect(mapped).toEqual({
      "Tiktok Username": "mrbeast",
      "Audience Gender Split": "Male 60% / Female 40%",
      "HypeAuditor Profile URL": "https://hypeauditor.com/tiktok/mrbeast/",
    });
    expect(mapped).not.toHaveProperty("tiktok_username");
    expect(mapped).not.toHaveProperty("audience_gender");
    expect(mapped).not.toHaveProperty("hype_auditor_profile");
  });

  it("sends the expected Airtable PATCH body", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "rec123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: {
        tiktok_username: "mrbeast",
        email: null,
        unknown: "ignored",
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.airtable.com/v0/base/table/rec123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            "Tiktok Username": "mrbeast",
            Email: null,
          },
        }),
      }),
    );
  });

  it("returns table metadata when the configured table PATCH succeeds", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "configuredTable";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "rec123" }), { status: 200 })));

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: "mrbeast" },
    });

    expect(result).toMatchObject({
      configuredTableId: "configuredTable",
      initialTableId: "configuredTable",
      resolvedTableId: "configuredTable",
      resolvedTableName: null,
      autoDiscoveryRan: false,
    });
  });

  it("discovers the owning table and retries PATCH when configured table cannot read the record", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "configuredTable";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelNotFoundResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          tables: [
            { id: "configuredTable", name: "Link" },
            { id: "ownerTable", name: "Creators" },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }))
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: "mrbeast" },
    });

    expect(result).toMatchObject({
      configuredTableId: "configuredTable",
      initialTableId: "configuredTable",
      resolvedTableId: "ownerTable",
      resolvedTableName: "Creators",
      autoDiscoveryRan: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.airtable.com/v0/base/ownerTable/rec123",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("returns a helpful error when the record is not found in any table", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "configuredTable";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelNotFoundResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          tables: [
            { id: "configuredTable", name: "Link" },
            { id: "otherTable", name: "Creators" },
          ],
        }),
      )
      .mockResolvedValueOnce(modelNotFoundResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateAirtable({
        platform: "tiktok",
        recordId: "recMissing",
        fields: { tiktok_username: "mrbeast" },
      }),
    ).rejects.toThrow("Record ID was not found in any table");
  });

  it("prefers an incoming Airtable table override", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "configuredTable";
    const fetchMock = vi.fn(async () => jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: "mrbeast" },
      airtableTableId: "overrideTable",
    });

    expect(result.initialTableId).toBe("overrideTable");
    expect(result.resolvedTableId).toBe("overrideTable");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.airtable.com/v0/base/overrideTable/rec123",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function modelNotFoundResponse() {
  return jsonResponse(
    {
      error: {
        type: "INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND",
        message: "Invalid permissions, or the requested model was not found.",
      },
    },
    403,
  );
}
