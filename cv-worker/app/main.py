"""CV worker — FastAPI service for video biomechanics analysis (Phase 3).

Endpoint:
  POST /process_video  -> AnalysisResult

Called by the Supabase Edge Function `process-video`. Deploy separately (needs
the OpenCV/MediaPipe stack); falls back to synthetic pose if those are missing
or the video can't be fetched.
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException

from .models import AnalysisResult, ProcessVideoRequest
from .pipeline import analyze

load_dotenv()
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AI Football Coach — CV Worker", version="0.1.0")

_WORKER_API_KEY = os.environ.get("WORKER_API_KEY")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/process_video", response_model=AnalysisResult)
def process_video(
    payload: ProcessVideoRequest,
    x_worker_key: str | None = Header(default=None),
) -> AnalysisResult:
    if _WORKER_API_KEY and x_worker_key != _WORKER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid worker key")
    return analyze(payload)
