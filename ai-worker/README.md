# AI Worker (Phase 2.2)

Python/FastAPI microservice that turns a user's recent journal history into a
recovery **Insight**: a deterministic injury-risk score + fatigue trend (NumPy/
Pandas/SciPy) plus an LLM-generated coaching tip (Anthropic `claude-opus-4-8`,
structured outputs). Deploy separately from Supabase (Railway / Render / Fly).

## Endpoints

- `GET /health` → `{ "status": "ok" }`
- `POST /analyze_daily_stats` → `Insight`

Request:
```json
{
  "user_id": "abc-123",
  "is_in_season": true,
  "history": [
    { "date": "2026-06-21", "pain": { "knee_left": 7 }, "sleep": 4, "fatigue": 7, "nutrition": 6, "hrv": 60 }
  ]
}
```
Response (`Insight`):
```json
{
  "risk_score": 0.82,
  "fatigue_trend": "declining",
  "ai_summary_text": "Knee pain spiked after poor sleep — prioritise hip-flexor + pigeon stretches today.",
  "recommended_action": "static_stretching_lower_body",
  "focus_body_part": "left knee"
}
```

## How it works

1. `analysis.py` — deterministic features (z-scores of sleep/HRV vs the window,
   7-day rolling pain, fatigue trend, a clamped 0–1 risk score). The numbers the
   narrative is grounded in.
2. `llm.py` — asks `claude-opus-4-8` (adaptive thinking, `output_config.format`
   JSON schema) for only the **tip** + **recommended_action**; the numeric fields
   stay deterministic so the prose can't contradict the math.
3. **No `ANTHROPIC_API_KEY`?** A deterministic fallback narrative is used, so the
   service runs end-to-end in dev without a key.

## Run locally

```bash
cd ai-worker
python -m venv .venv && .venv/Scripts/activate   # or: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optionally set ANTHROPIC_API_KEY + WORKER_API_KEY
uvicorn app.main:app --reload
```

## Test

```bash
python -m unittest discover -s tests    # no network — exercises the fallback path
```

## Auth

If `WORKER_API_KEY` is set, requests must send a matching `x-worker-key` header.
The Supabase Edge Function `process-daily-state` calls this endpoint with that
header and persists the result to `daily_insights`.

## Deploy

`Procfile` (Railway/Render) and `Dockerfile` are provided. Set `ANTHROPIC_API_KEY`
and `WORKER_API_KEY` in the host's environment; point the Edge Function's
`AI_WORKER_URL` secret at the deployed URL.
