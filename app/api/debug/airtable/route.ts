import { NextRequest, NextResponse } from "next/server";
import type { Platform } from "../../../../lib/parser";

export const runtime = "nodejs";

type AirtableTarget = {
  platform: Platform;
  baseId?: string;
  tableId?: string;
};

type AirtableBase = {
  id: string;
  name: string;
};

export async function GET(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  const targets: AirtableTarget[] = [
    {
      platform: "tiktok",
      baseId: process.env.TIKTOK_AIRTABLE_BASE_ID,
      tableId: process.env.TIKTOK_AIRTABLE_TABLE_ID,
    },
    {
      platform: "instagram",
      baseId: process.env.INSTAGRAM_AIRTABLE_BASE_ID,
      tableId: process.env.INSTAGRAM_AIRTABLE_TABLE_ID,
    },
  ];

  const platform = request.nextUrl.searchParams.get("platform");
  const recordId = request.nextUrl.searchParams.get("recordId");
  const searchAllBases = request.nextUrl.searchParams.get("searchAllBases") === "true";

  const checks = await Promise.all(
    targets.map(async (target) => ({
      ...target,
      env: {
        hasBaseId: Boolean(target.baseId),
        hasTableId: Boolean(target.tableId),
        baseId: target.baseId ?? null,
        tableId: target.tableId ?? null,
      },
      metadata: await checkTables(apiKey, target),
      record:
        recordId && platform === target.platform
          ? await checkRecord(apiKey, target, recordId)
          : null,
    })),
  );
  const recordLocator = recordId && searchAllBases ? await findRecordAcrossAccessibleBases(apiKey, recordId) : null;

  return NextResponse.json({
    success: true,
    env: {
      hasAirtableApiKey: Boolean(apiKey),
      airtableApiKeySuffix: apiKey ? apiKey.slice(-6) : null,
      hasWebhookSecret: Boolean(secret),
    },
    checks,
    recordLocator,
  });
}

async function checkTables(apiKey: string | undefined, target: AirtableTarget) {
  if (!apiKey) {
    return { ok: false, skipped: true, error: "AIRTABLE_API_KEY is missing." };
  }

  if (!target.baseId || !target.tableId) {
    return { ok: false, skipped: true, error: "Base ID or table ID is missing." };
  }

  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${target.baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const body = await readResponseBody(response);
  const tables = getTables(body);
  const matchingTable = tables.find((table) => table.id === target.tableId);

  return {
    ok: response.ok && Boolean(matchingTable),
    status: response.status,
    tableFound: Boolean(matchingTable),
    tableName: matchingTable?.name ?? null,
    availableTables: tables.map((table) => ({ id: table.id, name: table.name })),
    error: response.ok ? null : body,
  };
}

async function checkRecord(apiKey: string | undefined, target: AirtableTarget, recordId: string) {
  if (!apiKey) {
    return { ok: false, skipped: true, error: "AIRTABLE_API_KEY is missing." };
  }

  if (!target.baseId || !target.tableId) {
    return { ok: false, skipped: true, error: "Base ID or table ID is missing." };
  }

  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(target.baseId)}/${encodeURIComponent(
      target.tableId,
    )}/${encodeURIComponent(recordId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  const body = await readResponseBody(response);

  return {
    ok: response.ok,
    status: response.status,
    recordId,
    foundRecordId: getRecordId(body),
    error: response.ok ? null : body,
  };
}

async function findRecordAcrossAccessibleBases(apiKey: string | undefined, recordId: string) {
  if (!apiKey) {
    return { ok: false, skipped: true, error: "AIRTABLE_API_KEY is missing." };
  }

  const basesResponse = await fetch("https://api.airtable.com/v0/meta/bases", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const basesBody = await readResponseBody(basesResponse);
  if (!basesResponse.ok) {
    return {
      ok: false,
      status: basesResponse.status,
      error: basesBody,
      matches: [],
    };
  }

  const bases = getBases(basesBody);
  const matches = [];

  for (const base of bases) {
    const tables = await getTablesForBase(apiKey, base.id);
    for (const table of tables) {
      const response = await fetch(
        `https://api.airtable.com/v0/${encodeURIComponent(base.id)}/${encodeURIComponent(table.id)}/${encodeURIComponent(
          recordId,
        )}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );
      const body = await readResponseBody(response);

      if (response.ok) {
        matches.push({
          baseId: base.id,
          baseName: base.name,
          tableId: table.id,
          tableName: table.name,
          recordId: getRecordId(body),
        });
      }
    }
  }

  return {
    ok: matches.length > 0,
    searchedBases: bases.length,
    matches,
    hint:
      matches.length > 0
        ? "Use the base/table shown here for this Zapier recordID, or remap Zapier recordID to the record from the configured platform table."
        : "No accessible base/table contains this record ID. Zapier is likely sending an ID from another app/step or a deleted/inaccessible Airtable record.",
  };
}

async function getTablesForBase(apiKey: string, baseId: string) {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const body = await readResponseBody(response);
  return response.ok ? getTables(body) : [];
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

function getTables(body: unknown): { id: string; name: string }[] {
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
    .filter((table): table is { id: string; name: string } => Boolean(table));
}

function getBases(body: unknown): AirtableBase[] {
  if (typeof body !== "object" || body === null || !("bases" in body)) {
    return [];
  }

  const bases = (body as { bases?: unknown }).bases;
  if (!Array.isArray(bases)) {
    return [];
  }

  return bases
    .map((base) => {
      if (typeof base !== "object" || base === null) {
        return null;
      }

      const id = (base as { id?: unknown }).id;
      const name = (base as { name?: unknown }).name;

      return typeof id === "string" && typeof name === "string" ? { id, name } : null;
    })
    .filter((base): base is AirtableBase => Boolean(base));
}

function getRecordId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("id" in body)) {
    return null;
  }

  const id = (body as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}
