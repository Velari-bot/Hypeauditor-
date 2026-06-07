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
      tiktok_username: "mrbeast",
      avg_likes: 520100,
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
      instagram_username: "creatorgram",
      average_likes: 12300,
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
      tiktok_username: "mrbeast",
      email: null,
    });
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
            tiktok_username: "mrbeast",
            email: null,
          },
        }),
      }),
    );
  });
});
