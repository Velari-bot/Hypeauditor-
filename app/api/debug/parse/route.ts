import { NextRequest, NextResponse } from "next/server";
import {
  getWebhookPayloadDebugInfo,
  parseIncomingPayload,
  parseInstagram,
  parseTikTok,
  PayloadParseError,
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

  if (!parsedInput.platform) {
    return NextResponse.json(
      { success: false, error: "Missing or invalid platform. Expected 'tiktok' or 'instagram'." },
      { status: 400 },
    );
  }

  const normalized =
    parsedInput.platform === "tiktok"
      ? parseTikTok(parsedInput.raw, { inputUsername: parsedInput.inputUsername })
      : parseInstagram(parsedInput.raw, { inputUsername: parsedInput.inputUsername });

  return NextResponse.json({
    success: true,
    platform: parsedInput.platform,
    parsed: normalized,
    debug: getWebhookPayloadDebugInfo(requestBody, parsedInput.raw, {
      platform: parsedInput.platform,
      recordId: parsedInput.recordId,
    }),
  });
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
