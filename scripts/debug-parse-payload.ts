import { readFile } from "node:fs/promises";
import { getPayloadDebugInfo, parseInstagram, parseTikTok, type Platform } from "../lib/parser";

const [filePath, platformArg] = process.argv.slice(2);
const platform = platformArg as Platform | undefined;

if (!filePath || (platform !== "tiktok" && platform !== "instagram")) {
  console.error("Usage: npm run debug:parse -- fixtures/live-instagram-payload.json instagram");
  process.exit(1);
}

const rawText = await readFile(filePath, "utf8");
const raw = JSON.parse(rawText);
const topLevelKeys = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? Object.keys(raw) : [];
const debug = getPayloadDebugInfo(raw);
const normalized = platform === "tiktok" ? parseTikTok(raw) : parseInstagram(raw);
const usableFields = Object.entries(normalized).filter(
  ([key, value]) => !["last_updated", "exclusivity"].includes(key) && value !== null && value !== undefined && value !== "",
);

console.log(
  JSON.stringify(
    {
      inputTopLevelKeys: topLevelKeys,
      detected: debug,
      normalized,
      usableFieldCount: usableFields.length,
      message:
        usableFields.length === 0
          ? "Parser could not find expected HypeAuditor report paths"
          : "Parser found usable normalized fields",
      possibleReportPaths: ["result.report", "report", "data.result.report", "data.report"],
    },
    null,
    2,
  ),
);
