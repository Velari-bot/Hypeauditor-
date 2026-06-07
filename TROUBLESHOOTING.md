# HypeAuditor Webhook Troubleshooting Notes

## What Was Built

This repo is a deterministic webhook server that replaces the old Zapier/OpenAI parsing step.

It exposes:

```text
POST /api/webhooks/hypeauditor
```

The webhook receives a Zapier payload like:

```json
{
  "recordID": "recXXXXXXXXXXXXXX",
  "platform": "tiktok",
  "hypeauditorData": "{ HypeAuditor JSON }"
}
```

It then:

1. validates `x-webhook-secret` if `WEBHOOK_SECRET` is set
2. parses weird Zapier/HypeAuditor payload shapes
3. normalizes TikTok or Instagram creator data
4. maps normalized fields to Airtable fields
5. PATCHes the Airtable record using `recordID`

It also supports:

```text
POST /api/webhooks/hypeauditor?dryRun=true
```

Dry run parses and returns the Airtable update body without touching Airtable.

## Current Railway Env Vars

The app expects these names:

```text
AIRTABLE_API_KEY
WEBHOOK_SECRET

TIKTOK_AIRTABLE_BASE_ID
TIKTOK_AIRTABLE_TABLE_ID

INSTAGRAM_AIRTABLE_BASE_ID
INSTAGRAM_AIRTABLE_TABLE_ID
```

The configured Airtable targets are:

```text
TikTok:
base appCMWLsB1DXj1REq
table tblZvVUYThAlPHn2O
table name Link

Instagram:
base appd9kkDzoQ4FHGSh
table tblAcp0tbwYJRbu8S
table name Instagram
```

Do not put real PATs or webhook secrets in this file.

## What Has Been Verified

The debug endpoint proved that:

1. Railway has `AIRTABLE_API_KEY`.
2. Railway has `WEBHOOK_SECRET`.
3. Airtable PAT can read base metadata.
4. Airtable PAT can see both configured bases.
5. Airtable PAT can see both configured tables:
   - TikTok table `Link`
   - Instagram table `Instagram`

So this is not currently a server deployment issue, not a missing env var issue, and not a basic PAT scope issue.

## Original Errors And Fixes

### `Only absolute URLs are supported`

Zapier URL was missing protocol/path.

Correct URL:

```text
https://hypeauditor-production.up.railway.app/api/webhooks/hypeauditor?dryRun=true
```

### `Missing required recordId`

Zapier sent `recordID`, while the app initially expected `recordId`.

Fixed in code. The server now accepts:

```text
recordId
recordID
record_id
airtableRecordId
```

### `Missing or invalid platform`

Zapier sent a misspelled platform like:

```text
Intagram
```

Correct values are exactly:

```text
tiktok
instagram
```

### `AIRTABLE_API_KEY is required`

Railway had the wrong/missing env var name at one point.

The app needs:

```text
AIRTABLE_API_KEY
```

not:

```text
AIRTABLE_PAT
```

### `INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`

At first this looked like a PAT/base/table permissions problem. Diagnostics proved the token can see the configured bases and tables.

The deeper issue is that the `recordID` values Zapier is sending do not exist in the configured destination tables.

## The Actual Current Issue

The app is receiving these live values:

```text
TikTok:
platform = tiktok
recordID = rec5NcuaVvKhkVWjK

Instagram:
platform = instagram
recordID = recucyWurvj4QhMKy
```

The app tried to update:

```text
TikTok:
base appCMWLsB1DXj1REq
table tblZvVUYThAlPHn2O / Link
record rec5NcuaVvKhkVWjK

Instagram:
base appd9kkDzoQ4FHGSh
table tblAcp0tbwYJRbu8S / Instagram
record recucyWurvj4QhMKy
```

Airtable returned:

```text
INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND
```

Then the app auto-discovery code searched all tables inside each configured platform base. It still could not find those record IDs.

That means:

```text
rec5NcuaVvKhkVWjK is not in any accessible table inside appCMWLsB1DXj1REq
recucyWurvj4QhMKy is not in any accessible table inside appd9kkDzoQ4FHGSh
```

So the Zapier `recordID` mapping is coming from the wrong place.

## Why The Mapping Is Wrong

Zapier has multiple steps, and many steps can expose fields named `id`, `ID`, `record id`, or similar.

The webhook needs the Airtable record ID from the Airtable record that should be updated.

It must not come from:

```text
HypeAuditor step
Formatter step
Webhooks step
another Airtable base
another Airtable table
another Zap's trigger
```

The current `recordID` values look like Airtable record IDs because they start with `rec`, but Airtable record IDs are only valid inside the table/base where they were created. A valid-looking `rec...` from another base/table will fail exactly like this.

## Correct Zapier Mapping

For the TikTok Zap:

```text
platform = tiktok
recordID = ID from Airtable step for Beyond Vision Creator Database -> Link
hypeauditorData = HypeAuditor output/result
```

For the Instagram Zap:

```text
platform = instagram
recordID = ID from Airtable step for BV Creator Database (5/2) -> Instagram
hypeauditorData = HypeAuditor output/result
```

In Zapier, click the value inserted into `recordID` and make sure its preview is the Airtable record ID from the Airtable step that created/found the record in the same table you are updating.

## How To Prove The Right Record ID

Use the debug endpoint:

```bash
curl --max-time 10 -H "x-webhook-secret: YOUR_SECRET" \
"https://hypeauditor-production.up.railway.app/api/debug/airtable?platform=tiktok&recordId=REC_FROM_ZAPIER"
```

Correct result:

```json
{
  "record": {
    "ok": true,
    "foundRecordId": "REC_FROM_ZAPIER"
  }
}
```

If `record.ok` is false, the record ID is not in the configured table for that platform.

To locate a record across all accessible Airtable bases/tables:

```bash
curl --max-time 20 -H "x-webhook-secret: YOUR_SECRET" \
"https://hypeauditor-production.up.railway.app/api/debug/airtable?recordId=REC_FROM_ZAPIER&searchAllBases=true"
```

Look at:

```text
recordLocator.matches
```

If it finds a match, that is where the record really lives. If it returns no matches, Zapier is probably sending an ID from a deleted record, inaccessible record, or non-destination step.

## What Code Was Added To Help

### Dry Run

```text
/api/webhooks/hypeauditor?dryRun=true
```

Returns parsed creator data and the Airtable body without updating Airtable.

### Airtable Debug Endpoint

```text
/api/debug/airtable
```

Checks env vars, configured base/table metadata, and specific record IDs.

### Record Table Auto-Discovery

If live mode tries the configured table and Airtable says the record is not found, the app now searches all tables inside that platform base and retries the PATCH if it finds the record.

This helps only when the record is in another table inside the same base.

It cannot fix a record ID from a totally different base. That must be fixed in Zapier or Railway env vars.

## Next Step

Fix the Zapier `recordID` mapping first.

Do not change `hypeauditorData` yet. Dry run proves payload parsing works.

Once `recordID` points to the correct Airtable table, the next possible issue may be Airtable field names. If that happens, Airtable will return a different error naming an unknown field. Then update the field maps in:

```text
lib/airtable.ts
```

## Security Note

Several secrets were pasted during debugging. After the Zap works, rotate:

```text
AIRTABLE_API_KEY
WEBHOOK_SECRET
```

Update both Railway and Zapier with the new values.
