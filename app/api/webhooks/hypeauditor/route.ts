import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AirtableUpdateError,
  getConfiguredAirtableTarget,
  mapToAirtableFields,
  updateAirtable,
} from "../../../../lib/airtable";
import {
  getReportState,
  getWebhookPayloadDebugInfo,
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
      parsedInput.platform === "tiktok"
        ? parseTikTok(parsedInput.raw, { inputUsername: parsedInput.inputUsername })
        : parseInstagram(parsedInput.raw, { inputUsername: parsedInput.inputUsername });
    await capturePayloadIfEnabled(parsedInput.platform, parsedInput.recordId, requestBody);
    const username = getUsername(normalized, parsedInput.platform);
    const reportState = getReportState(parsedInput.raw);
    const warnings = reportState && reportState !== "READY" ? [`HypeAuditor report_state is ${reportState}.`] : [];
    const mappedAirtableFields = mapToAirtableFields(normalized, parsedInput.platform);
    const configuredAirtableTarget = getConfiguredAirtableTarget(parsedInput.platform);

    if (parsedInput.platform === "instagram" && countUsableFields(normalized) < 2) {
      const debug = getWebhookPayloadDebugInfo(requestBody, parsedInput.raw);
      console.log("INSTAGRAM PAYLOAD DEBUG", {
        recordId: parsedInput.recordId,
        bodyKeys: debug.bodyKeys,
        hypeauditorDataKeys: debug.hypeauditorDataKeys,
        reportFound: debug.reportFound,
        foundPath: debug.foundPath,
        reportKeys: debug.reportKeys,
        basicKeys: debug.basicKeys,
        metricsKeys: debug.metricsKeys,
        featuresKeys: debug.featuresKeys,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Parsed Instagram payload produced no usable fields",
          debug,
          parsed: normalized,
        },
        { status: 422 },
      );
    }

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
      skippedFields: updateResult.skippedFields,
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
          skippedFields: error.skippedFields ?? [],
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

function countUsableFields(fields: Record<string, unknown>): number {
  const ignored = new Set(["last_updated", "exclusivity"]);
  return Object.entries(fields).filter(([key, value]) => !ignored.has(key) && !isEmptyParsedValue(value)).length;
}

function isEmptyParsedValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

async function capturePayloadIfEnabled(platform: Platform, recordId: string, requestBody: unknown) {
  if (process.env.ENABLE_PAYLOAD_CAPTURE !== "true") {
    return;
  }

  try {
    const payloadDir = path.join(process.cwd(), "debug", "payloads");
    await mkdir(payloadDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeRecordId = recordId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.join(payloadDir, `${platform}-${safeRecordId}-${timestamp}.json`);
    await writeFile(filePath, JSON.stringify(requestBody, null, 2));
    console.log("Captured webhook payload", { platform, recordId, filePath });
  } catch (error) {
    console.warn("Failed to capture webhook payload", {
      platform,
      recordId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
