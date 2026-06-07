# HypeAuditor Webhook Server

A deterministic Next.js webhook that replaces Zapier/OpenAI parsing for HypeAuditor payloads. It receives a Zapier webhook, parses the HypeAuditor response without AI, normalizes creator fields, and updates the original Airtable record.

## Environment Variables

```bash
AIRTABLE_API_KEY=
WEBHOOK_SECRET=

TIKTOK_AIRTABLE_BASE_ID=
TIKTOK_AIRTABLE_TABLE_ID=

INSTAGRAM_AIRTABLE_BASE_ID=
INSTAGRAM_AIRTABLE_TABLE_ID=

AIRTABLE_USE_FIELD_IDS=false
```

`WEBHOOK_SECRET` is optional. When it is set, every webhook request must include:

```text
x-webhook-secret: <WEBHOOK_SECRET>
```

`AIRTABLE_USE_FIELD_IDS` is included for clarity when you switch the centralized field maps in `lib/airtable.ts` from Airtable field names to field IDs. The outgoing `fields` object always uses the map values.

## Zapier Setup

1. Keep your existing Airtable trigger that creates or receives the creator record.
2. Send the TikTok or Instagram username to HypeAuditor as you do today.
3. Add a webhook POST step pointing to:

```text
https://your-vercel-domain.vercel.app/api/webhooks/hypeauditor
```

4. Send JSON in this shape:

```json
{
  "recordId": "recXXXXXXXXXXXXXX",
  "platform": "tiktok",
  "hypeauditorData": "{ huge HypeAuditor JSON string or object }"
}
```

The server also supports HypeAuditor data under `hypeAuditorData`, `data`, `result`, `payload`, `raw`, `body`, or as the full request body.

### Zapier Record ID

The `recordId` / `recordID` value must come from the Airtable step that creates or finds the exact record the webhook should update.

For TikTok:

```text
platform = tiktok
recordID = Airtable ID from Beyond Vision Creator Database -> Link
```

For Instagram:

```text
platform = instagram
recordID = Airtable ID from BV Creator Database (5/2) -> Instagram
```

Do not map `recordID` from HypeAuditor, Formatter, Webhooks, or an Airtable step from a different base. If Airtable returns `Record ID was not found in any table`, the record ID is from the wrong Zapier step or wrong Airtable base.

## Local Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run coverage:

```bash
npm run test:coverage
```

Start the local server:

```bash
npm run dev
```

The webhook will be available at:

```text
http://localhost:3000/api/webhooks/hypeauditor
```

## Testing and Dry Run

Use dry-run mode to verify parsing, normalized fields, and the exact Airtable request body without sending anything to Airtable:

```text
POST /api/webhooks/hypeauditor?dryRun=true
```

Dry run still validates `recordId`, `platform`, payload parsing, and `WEBHOOK_SECRET` when configured. The response includes `parsed`, `updatedFields`, and:

```json
{
  "airtableBody": {
    "fields": {
      "tiktok_username": "mrbeast",
      "email": "contact@mrbeastbusiness.com"
    }
  }
}
```

Example dry-run curl:

```bash
curl -X POST 'http://localhost:3000/api/webhooks/hypeauditor?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-secret: test-secret' \
  -d '{
    "recordId": "recTEST123",
    "platform": "tiktok",
    "hypeauditorData": {
      "result": {
        "report_state": "READY",
        "report": {
          "basic": {
            "username": "mrbeast",
            "description": "Business: [contact@mrbeastbusiness.com](mailto:contact@mrbeastbusiness.com) Call +1 704-236-4517"
          },
          "metrics": {
            "subscribers_count": { "value": 124700000 },
            "views_avg": { "value": 12100000 },
            "alikes_avg": { "value": 520100 },
            "likes_count": { "value": 1300000000 },
            "er": { "value": 6.83 }
          },
          "features": {
            "blogger_geo": { "data": { "country": "us" } },
            "blogger_prices": { "data": { "post_price": 204139, "post_price_from": 102000 } }
          }
        }
      }
    }
  }'
```

To verify the Airtable body before connecting Zapier, run the server locally, send a `dryRun=true` request, and inspect `airtableBody.fields` in the JSON response. No Airtable request is made in dry-run mode.

## Airtable Debugging

The debug endpoint is protected by the same `x-webhook-secret` header:

```bash
curl -H 'x-webhook-secret: your-secret' \
  'https://your-domain.up.railway.app/api/debug/airtable?platform=tiktok&recordId=recXXXXXXXXXXXXXX'
```

To find which accessible Airtable base/table owns a record ID, add `searchAllBases=true`:

```bash
curl -H 'x-webhook-secret: your-secret' \
  'https://your-domain.up.railway.app/api/debug/airtable?recordId=recXXXXXXXXXXXXXX&searchAllBases=true'
```

If `recordLocator.matches` is empty, Zapier is not sending an Airtable record ID that the token can access. If it finds a base/table different from the configured platform table, remap Zapier `recordID` to the right Airtable step or update the Railway base/table variables.

## Example Request

```bash
curl -X POST http://localhost:3000/api/webhooks/hypeauditor \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-secret: your-secret-if-configured' \
  -d '{
    "recordId": "recXXXXXXXXXXXXXX",
    "platform": "tiktok",
    "hypeauditorData": {
      "result": {
        "report_state": "READY",
        "report": {
          "basic": {
            "username": "mrbeast",
            "description": "Business: contact@mrbeastbusiness.com"
          },
          "metrics": {
            "subscribers_count": { "value": 124700000 },
            "views_avg": { "value": 12100000 },
            "alikes_avg": { "value": 520100 },
            "likes_count": { "value": 1300000000 },
            "er": { "value": 6.83 }
          },
          "features": {}
        }
      }
    }
  }'
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add the environment variables above in Vercel Project Settings.
4. Deploy.
5. Update the Zapier webhook URL to the production Vercel endpoint.

## Airtable Field Maps

Edit `TIKTOK_AIRTABLE_FIELD_MAP` and `INSTAGRAM_AIRTABLE_FIELD_MAP` in `lib/airtable.ts` whenever Airtable field names or field IDs change.

The endpoint patches:

```text
PATCH https://api.airtable.com/v0/{baseId}/{tableId}/{recordId}
```

with:

```json
{
  "fields": {
    "field_name_or_id": "value"
  }
}
```
