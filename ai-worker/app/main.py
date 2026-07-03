"""AI worker — FastAPI service for daily recovery analysis (Phase 2.2).

Endpoint:
  POST /analyze_daily_stats   -> Insight

Deploy on Railway/Render/Fly. Called by the Supabase Edge Function
`process-daily-state`, which is triggered by a DB webhook on daily_check_ins.
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException

from .analysis import extract_features, summarize_training
from .llm import generate_insight
from .models import AnalyzeRequest, Insight

load_dotenv()
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AI Football Coach — Worker", version="0.1.0")

# Shared secret so only our Edge Function can call this service. Set WORKER_API_KEY
# in both the worker env and the Edge Function secrets.
_WORKER_API_KEY = os.environ.get("WORKER_API_KEY")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/analyze_daily_stats", response_model=Insight)
def analyze_daily_stats(
    payload: AnalyzeRequest,
    x_worker_key: str | None = Header(default=None),
) -> Insight:
    if _WORKER_API_KEY and x_worker_key != _WORKER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid worker key")

    if not payload.history:
        raise HTTPException(status_code=422, detail="history must not be empty")

    features = extract_features(payload.history)
    training_note = summarize_training(payload.training)
    return generate_insight(features, payload.is_in_season, training_note)
