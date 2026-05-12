# Rate Limiting — Causes & Fixes

## Actual error message

```
Resource exhausted. Please try again later. Please refer to
https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.
```

## What the GCP quota console shows

The only relevant quota visible for `gemini-2.5-flash-image` in the console is:

| Name | Type | Value | Adjustable |
|------|------|-------|------------|
| Generate content requests with **image input** per minute (per project / region / model / resolution) | **System limit** | 40,248,000 | **No** |

Two important conclusions:

1. **This quota is measuring image pixels or tokens per minute, not API call count.** Current usage is ~1,900 out of 40M — it is not the bottleneck.
2. **The requests-per-minute (QPM) count limit is not user-visible.** It is enforced at the model serving layer as a system limit. You cannot increase it through the standard quota request form.

This is typical for preview/experimental models. The QPM limit is implicit and enforced server-side.

---

## What you can actually do

### Option 1 — Slow the request interval (works immediately)

The app currently sends one request every **6 seconds (~10 RPM)**. If the system limit is 1–2 QPM, we need to space requests much further apart to avoid hitting the limit on nearly every second item.

Getting rate-limited on request 2 of a run with a 6s interval implies the effective limit is close to **1 QPM**.

Change in [`app/api/generate/route.ts`](app/api/generate/route.ts):

```ts
const REQUEST_INTERVAL_MS = 6_000;   // ← change this
```

| Effective QPM limit | Safe interval to set |
|--------------------|---------------------|
| 1 QPM | `65_000` ms (65s) |
| 2 QPM | `32_000` ms (32s) |
| 5 QPM | `13_000` ms (13s) |

The same 6s interval is in [`app/api/refine/generate/route.ts`](app/api/refine/generate/route.ts) — find `setTimeout(r, 6_000)`.

### Option 2 — Enable billing on the GCP project

Even without spending anything, linking a billing account often moves the project to a higher serving tier with a higher implicit QPM. This is the most likely path to a meaningful increase without a support ticket.

1. GCP Console → **Billing** → link a billing account
2. Wait ~5 minutes, then test with a small generation run

### Option 3 — Contact Google Cloud support

Because the QPM limit is a system limit (not adjustable in the quota console), the only formal path to increase it is through a support ticket or the Vertex AI quota increase request form:

`https://cloud.google.com/vertex-ai/generative-ai/docs/request-quota-increase`

Mention the model name (`gemini-2.5-flash-image`) and your use case.

### Option 4 — Use the 70s backoff as-is

The app already retries after 70 seconds when rate-limited. At 1 QPM with a 70s wait, a 100-image run takes roughly **3–4 hours** but will complete without manual intervention. The checkpoint ensures no images are regenerated if you stop and restart.

---

## How the app handles rate limits

When a 429 is received:
1. **per_minute** — waits 70 seconds, then retries (up to 2 retries per item)
2. **per_day** — stops immediately and logs `DAILY QUOTA HIT`

The 500/day limit (free tier) is a separate hard ceiling that resets at midnight UTC.
