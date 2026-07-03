"""Deterministic biomechanics/recovery feature extraction.

Pure NumPy/Pandas/SciPy — no LLM. Produces the numeric features that both the
risk score and the LLM narrative are grounded in, so the qualitative summary
can never contradict the math.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats

from .models import FatigueTrend, HistoryDay

Z_FLAG_THRESHOLD = -1.5  # sleep/HRV this many SDs below baseline is notable


@dataclass
class Features:
    n_days: int
    max_pain_today: float
    focus_body_part: Optional[str]
    pain_7d_avg: Optional[float]
    sleep_today: Optional[float]
    sleep_z: Optional[float]  # z-score of latest sleep vs window
    hrv_today: Optional[float]
    hrv_z: Optional[float]
    fatigue_trend: FatigueTrend
    risk_score: float
    flags: list[str]

    def as_dict(self) -> dict:
        return asdict(self)


def _pretty_body_part(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    parts = key.split("_")
    side = next((p for p in parts if p in ("left", "right")), None)
    joint = " ".join(p for p in parts if p not in ("left", "right"))
    return f"{side} {joint}" if side else joint


def _max_pain(pain: dict[str, float]) -> tuple[Optional[str], float]:
    if not pain:
        return None, 0.0
    part, value = max(pain.items(), key=lambda kv: kv[1])
    return (part, float(value)) if value > 0 else (None, 0.0)


def _zscore_latest(series: pd.Series) -> Optional[float]:
    """Z-score of the most recent value against the rest of the window."""
    clean = series.dropna()
    if len(clean) < 3:
        return None
    sd = clean.std(ddof=0)
    if sd == 0:
        return 0.0
    return float((clean.iloc[-1] - clean.mean()) / sd)


def _fatigue_trend(fatigue: pd.Series) -> FatigueTrend:
    clean = fatigue.dropna()
    if len(clean) < 4:
        return "stable"
    mid = len(clean) // 2
    first, second = clean.iloc[:mid].mean(), clean.iloc[mid:].mean()
    delta = second - first  # positive => more tired over time
    if delta <= -1:
        return "improving"
    if delta >= 1:
        return "declining"
    return "stable"


def extract_features(history: list[HistoryDay]) -> Features:
    if not history:
        return Features(0, 0.0, None, None, None, None, None, None, "stable", 0.0, [])

    rows = []
    for d in history:
        part, val = _max_pain(d.pain)
        rows.append(
            {
                "date": d.date,
                "max_pain": val,
                "pain_part": part,
                "sleep": d.sleep,
                "fatigue": d.fatigue,
                "nutrition": d.nutrition,
                "hrv": d.hrv,
            }
        )
    df = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
    latest = df.iloc[-1]

    focus_part, max_pain_today = latest["pain_part"], float(latest["max_pain"])
    pain_7d = df["max_pain"].tail(7)
    pain_7d_avg = round(float(pain_7d.mean()), 2) if len(pain_7d) else None

    sleep_today = None if pd.isna(latest["sleep"]) else float(latest["sleep"])
    hrv_today = None if pd.isna(latest["hrv"]) else float(latest["hrv"])
    sleep_z = _zscore_latest(df["sleep"])
    hrv_z = _zscore_latest(df["hrv"])
    trend = _fatigue_trend(df["fatigue"])

    flags: list[str] = []
    if max_pain_today >= 7:
        flags.append("high_pain")
    if sleep_z is not None and sleep_z <= Z_FLAG_THRESHOLD:
        flags.append("sleep_drop")
    if hrv_z is not None and hrv_z <= Z_FLAG_THRESHOLD:
        flags.append("hrv_drop")
    if trend == "declining":
        flags.append("fatigue_rising")

    return Features(
        n_days=len(df),
        max_pain_today=max_pain_today,
        focus_body_part=_pretty_body_part(focus_part),
        pain_7d_avg=pain_7d_avg,
        sleep_today=sleep_today,
        sleep_z=None if sleep_z is None else round(sleep_z, 2),
        hrv_today=hrv_today,
        hrv_z=None if hrv_z is None else round(hrv_z, 2),
        fatigue_trend=trend,
        risk_score=_risk_score(latest, df, flags),
        flags=flags,
    )


def summarize_training(training: list) -> Optional[str]:
    """One-line training-load progression note for the LLM prompt.

    `training` is a list of TrainingDay-like objects (date, drills, intensity).
    """
    if not training:
        return None
    rows = sorted(training, key=lambda t: t.date)
    volumes = []
    intensities = []
    for t in rows:
        vol = sum((int(d.get("sets") or 0) * int(d.get("reps") or 0)) for d in (t.drills or []))
        volumes.append(vol)
        if t.intensity is not None:
            intensities.append(float(t.intensity))

    n = len(rows)
    avg_int = f", avg intensity {np.mean(intensities):.0f}/10" if intensities else ""

    trend = "steady"
    if len(volumes) >= 4:
        mid = len(volumes) // 2
        first, second = np.mean(volumes[:mid]), np.mean(volumes[mid:])
        if second > first * 1.1:
            trend = "rising"
        elif second < first * 0.9:
            trend = "falling"

    return f"{n} training sessions in window{avg_int}; training volume {trend}."


def _risk_score(latest: pd.Series, df: pd.DataFrame, flags: list[str]) -> float:
    """0 (safe) .. 1 (critical). Blends today's pain, sleep, fatigue + trend flags."""
    pain = float(latest["max_pain"])
    sleep = 5.0 if pd.isna(latest["sleep"]) else float(latest["sleep"])
    fatigue = 5.0 if pd.isna(latest["fatigue"]) else float(latest["fatigue"])

    pain_risk = min(pain, 10) / 10
    sleep_risk = (10 - sleep) / 9
    fatigue_risk = (fatigue - 1) / 9

    score = 0.45 * pain_risk + 0.3 * sleep_risk + 0.25 * fatigue_risk
    # Each trend/z-score flag nudges risk upward, capped at 1.
    score += 0.08 * len(flags)
    return round(float(np.clip(score, 0.0, 1.0)), 2)
