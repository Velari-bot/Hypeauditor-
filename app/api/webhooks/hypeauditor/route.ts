import { NextRequest, NextResponse } from "next/server";
import {
  AirtableUpdateError,
  getConfiguredAirtableTarget,
  mapToAirtableFields,
  updateAirtable,
} from "../../../../lib/airtable";
import {
  getReportState,
  PayloadParseError,
  parseIncomingPayload,
  parseInstagram,
  parseTikTok,
  type Platform,
} from "../../../../lib/parser";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const requestBody = await readRequestBody(request);
  let parsedInput;

  try {
    parsedInput = parseIncomingPayload(requestBody);
  } catch (error) {
    if (error instanceof PayloadParseError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    throw error;
  }

  if (!parsedInput.recordId) {
    return NextResponse.json({ success: false, error: "Missing required recordId." }, { status: 400 });
  }

  if (!parsedInput.platform) {
    return NextResponse.json(
      { success: false, error: "Missing or invalid platform. Expected 'tiktok' or 'instagram'." },
      { status: 400 },
    );
  }

  if (typeof parsedInput.raw === "string") {
    return NextResponse.json(
      { success: false, error: "HypeAuditor payload could not be parsed as JSON." },
      { status: 400 },
    );
  }

  try {
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
    const normalized =
      parsedInput.platform === "tiktok" ? parseTikTok(parsedInput.raw) : parseInstagram(parsedInput.raw);
    const username = getUsername(normalized, parsedInput.platform);
    const reportState = getReportState(parsedInput.raw);
    const warnings = reportState && reportState !== "READY" ? [`HypeAuditor report_state is ${reportState}.`] : [];
    const mappedAirtableFields = mapToAirtableFields(normalized, parsedInput.platform);
    const configuredAirtableTarget = getConfiguredAirtableTarget(parsedInput.platform);

    if (dryRun) {
      const updatedFields = Object.keys(mappedAirtableFields);

      console.log("HypeAuditor webhook dry run processed", {
        platform: parsedInput.platform,
        recordId: parsedInput.recordId,
        report_state: reportState,
        username,
        updatedFields,
        configuredTableId: configuredAirtableTarget.tableId,
        incomingTableOverride: parsedInput.airtableTableId,
      });

      return NextResponse.json({
        success: true,
        dryRun: true,
        platform: parsedInput.platform,
        recordId: parsedInput.recordId,
        username,
        updatedFields,
        airtableTarget: {
          baseId: configuredAirtableTarget.baseId,
          configuredTableId: configuredAirtableTarget.tableId,
          incomingTableOverride: parsedInput.airtableTableId,
          liveModeNote: "Live mode will use the incoming table override if provided, then auto-resolve the record table if needed.",
        },
        airtableBody: { fields: mappedAirtableFields },
        warnings,
        parsed: normalized,
      });
    }

    const updateResult = await updateAirtable({
      platform: parsedInput.platform,
      recordId: parsedInput.recordId,
      fields: normalized,
      airtableTableId: parsedInput.airtableTableId,
    });
    const updatedFields = Object.keys(updateResult.airtableFields);

    console.log("HypeAuditor webhook processed", {
      platform: parsedInput.platform,
      recordId: parsedInput.recordId,
      report_state: reportState,
      username,
      updatedFields,
      configuredTableId: updateResult.configuredTableId,
      resolvedTableId: updateResult.resolvedTableId,
      resolvedTableName: updateResult.resolvedTableName,
      autoDiscoveryRan: updateResult.autoDiscoveryRan,
    });

    return NextResponse.json({
      success: true,
      platform: parsedInput.platform,
      recordId: parsedInput.recordId,
      username,
      updatedFields,
      airtableTarget: {
        configuredTableId: updateResult.configuredTableId,
        initialTableId: updateResult.initialTableId,
        resolvedTableId: updateResult.resolvedTableId,
        resolvedTableName: updateResult.resolvedTableName,
        autoDiscoveryRan: updateResult.autoDiscoveryRan,
      },
      warnings,
      parsed: normalized,
    });
  } catch (error) {
    if (error instanceof AirtableUpdateError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          airtableStatus: error.status,
          airtableTarget: {
            configuredTableId: error.configuredTableId ?? null,
            initialTableId: error.initialTableId ?? null,
            resolvedTableId: error.resolvedTableId ?? null,
            resolvedTableName: error.resolvedTableName ?? null,
            autoDiscoveryRan: error.autoDiscoveryRan ?? false,
          },
        },
        { status: 500 },
      );
    }

    console.error("HypeAuditor webhook failed", {
      platform: parsedInput.platform,
      recordId: parsedInput.recordId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unexpected webhook error.",
      },
      { status: 500 },
    );
  }
}

async function readRequestBody(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getUsername(fields: Record<string, unknown>, platform: Platform): string | null {
  const key = platform === "tiktok" ? "tiktok_username" : "instagram_username";
  const value = fields[key];
  return typeof value === "string" ? value : null;
}
