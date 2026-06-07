import { afterEach, describe, expect, it, vi } from "vitest";
import { mapToAirtableFields, removeEmptyValues, updateAirtable } from "../lib/airtable";

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

  it("coerces Airtable values by configured field type", () => {
    expect(
      mapToAirtableFields(
        {
          followers: "124,700,000",
          tiktok_rate: "$204139.00",
          last_updated: "2026-06-07T15:28:00.000Z",
          bio: 12345,
        },
        "tiktok",
      ),
    ).toEqual({
      Followers: 124700000,
      "Tiktok Rate": 204139,
      "Last Updated": "2026-06-07T15:28:00.000Z",
      Bio: "12345",
    });
  });

  it("removes empty values while keeping 0 and false", () => {
    expect(
      removeEmptyValues({
        Null: null,
        Undefined: undefined,
        EmptyString: "",
        EmptyArray: [],
        Zero: 0,
        False: false,
        Text: "value",
      }),
    ).toEqual({
      Zero: 0,
      False: false,
      Text: "value",
    });
  });

  it("sends the expected Airtable PATCH body", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi.fn().mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }])).mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.airtable.com/v0/base/table/rec123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            "Tiktok Username": "mrbeast",
          },
        }),
      }),
    );
  });

  it("returns table metadata when the configured table PATCH succeeds", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "configuredTable";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(tablesResponse([{ id: "configuredTable", name: "Link" }])).mockResolvedValueOnce(jsonResponse({ id: "rec123" })),
    );

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
      .mockResolvedValueOnce(tablesResponse([{ id: "configuredTable", name: "Link" }]))
      .mockResolvedValueOnce(modelNotFoundResponse())
      .mockResolvedValueOnce(
        tablesResponse([
          { id: "configuredTable", name: "Link" },
          { id: "ownerTable", name: "Creators" },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }))
      .mockResolvedValueOnce(tablesResponse([{ id: "ownerTable", name: "Creators" }]))
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
      6,
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
      .mockResolvedValueOnce(tablesResponse([{ id: "configuredTable", name: "Link" }]))
      .mockResolvedValueOnce(modelNotFoundResponse())
      .mockResolvedValueOnce(
        tablesResponse([
          { id: "configuredTable", name: "Link" },
          { id: "otherTable", name: "Creators" },
        ]),
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
    const fetchMock = vi.fn().mockResolvedValueOnce(tablesResponse([{ id: "overrideTable", name: "Override" }])).mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: "mrbeast" },
      airtableTableId: "overrideTable",
    });

    expect(result.initialTableId).toBe("overrideTable");
    expect(result.resolvedTableId).toBe("overrideTable");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.airtable.com/v0/base/overrideTable/rec123",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("skips non-writable Airtable fields before PATCH", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        tablesResponse([
          {
            id: "table",
            name: "Link",
            fields: [
              { id: "fldUsername", name: "Tiktok Username", type: "singleLineText" },
              { id: "fldFollowers", name: "Followers", type: "formula" },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: "mrbeast", followers: 124700000 },
    });

    expect(result.airtableFields).toEqual({ "Tiktok Username": "mrbeast" });
    expect(result.skippedFields).toMatchObject([{ airtableField: "Followers", airtableType: "formula" }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.airtable.com/v0/base/table/rec123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ fields: { "Tiktok Username": "mrbeast" } }),
      }),
    );
  });

  it("coerces values using live Airtable text field metadata", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        tablesResponse([
          {
            id: "table",
            name: "Link",
            fields: [
              { id: "fldFollowers", name: "Followers", type: "singleLineText" },
              { id: "fldRate", name: "Tiktok Rate", type: "singleLineText" },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { followers: 124700000, tiktok_rate: "$204139.00" },
    });

    expect(result.airtableFields).toEqual({
      Followers: "124700000",
      "Tiktok Rate": "$204139.00",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.airtable.com/v0/base/table/rec123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ fields: { Followers: "124700000", "Tiktok Rate": "$204139.00" } }),
      }),
    );
  });

  it("retries once without a field Airtable rejects", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }]))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: "INVALID_VALUE_FOR_COLUMN",
              message: 'Field "Followers" cannot accept the provided value',
            },
          },
          422,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: "mrbeast", followers: 124700000 },
    });

    expect(result.airtableFields).toEqual({ "Tiktok Username": "mrbeast" });
    expect(result.skippedFields).toEqual([
      {
        airtableField: "Followers",
        reason: "Airtable rejected this field value; retried without it.",
      },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.airtable.com/v0/base/table/rec123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ fields: { "Tiktok Username": "mrbeast" } }),
      }),
    );
  });

  it("fails on non-writable Airtable fields when strict updates are enabled", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    process.env.STRICT_AIRTABLE_UPDATES = "true";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      tablesResponse([
        {
          id: "table",
          name: "Link",
          fields: [{ id: "fldFollowers", name: "Followers", type: "formula" }],
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateAirtable({
        platform: "tiktok",
        recordId: "rec123",
        fields: { followers: 124700000 },
      }),
    ).rejects.toThrow('Airtable field "Followers" is not writable.');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not clear an existing TikTok username when normalized username is null", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "rec123", fields: { "Tiktok Username": "existingcreator" } }))
      .mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }]))
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: null, bio: "New bio" },
    });

    expect(result.airtableFields).toEqual({
      "Tiktok Username": "existingcreator",
      Bio: "New bio",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.airtable.com/v0/base/table/rec123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ fields: { "Tiktok Username": "existingcreator", Bio: "New bio" } }),
      }),
    );
  });

  it("does not clear an existing TikTok username when normalized username is empty", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "rec123", fields: { "Tiktok Username": "existingcreator" } }))
      .mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }]))
      .mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: "", bio: "New bio" },
    });

    expect(result.airtableFields["Tiktok Username"]).toBe("existingcreator");
  });

  it("returns a helpful error when no non-empty Airtable fields remain", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "rec123", fields: {} }))
      .mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateAirtable({
        platform: "tiktok",
        recordId: "rec123",
        fields: { tiktok_username: null, email: null },
      }),
    ).rejects.toThrow("No non-empty Airtable fields to update");
  });

  it("allows null clearing only when ALLOW_CLEARING_AIRTABLE_FIELDS is true", async () => {
    process.env.AIRTABLE_API_KEY = "key";
    process.env.TIKTOK_AIRTABLE_BASE_ID = "base";
    process.env.TIKTOK_AIRTABLE_TABLE_ID = "table";
    process.env.ALLOW_CLEARING_AIRTABLE_FIELDS = "true";
    const fetchMock = vi.fn().mockResolvedValueOnce(tablesResponse([{ id: "table", name: "Link" }])).mockResolvedValueOnce(jsonResponse({ id: "rec123" }));
    vi.stubGlobal("fetch", fetchMock);

    await updateAirtable({
      platform: "tiktok",
      recordId: "rec123",
      fields: { tiktok_username: null },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.airtable.com/v0/base/table/rec123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ fields: { "Tiktok Username": null } }),
      }),
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function tablesResponse(tables: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }> }>) {
  return jsonResponse({ tables });
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
