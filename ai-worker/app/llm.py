"""LLM narrative generation via the Anthropic SDK.

The numeric fields (risk_score, fatigue_trend, focus_body_part) come from
analysis.py — deterministic and grounded. The LLM is asked only for the
qualitative pieces: a short coaching tip and a recommended action from a closed
set. This keeps the model from contradicting the math and guarantees parseable
output via structured outputs.

If ANTHROPIC_API_KEY is unset, a deterministic fallback narrative is used so the
service runs end-to-end in dev without a key.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Optional

from .analysis import Features
from .models import Insight, RecommendedAction

logger = logging.getLogger("ai-worker.llm")

MODEL = "claude-opus-4-8"

_ACTIONS: tuple[RecommendedAction, ...] = (
    "rest",
    "static_stretching_lower_body",
    "mobility",
    "light_recovery",
    "moderate_drill",
    "heavy_sprint",
)

# Structured-outputs schema. Numeric min/max constraints aren't supported, so we
# only constrain the enum here and clamp/derive the rest in code.
_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "ai_summary_text": {"type": "string"},
        "recommended_action": {"type": "string", "enum": list(_ACTIONS)},
    },
    "required": ["ai_summary_text", "recommended_action"],
    "additionalProperties": False,
}

_SYSTEM = (
    "You are a sports biomechanist and recovery coach for footballers. "
    "You are given pre-computed metrics for one athlete over a recent window. "
    "Identify the weakest link and give one specific, actionable recovery tip in "
    "at most 25 words. Be concrete (name the body part and the action). Do not "
    "invent numbers beyond those provided. Return only the requested JSON fields."
)


@lru_cache(maxsize=1)
def _client():
    # Imported lazily so the service can start (and run the fallback) without the SDK
    # configured. Raises if no key is present — caught by generate_insight.
    from anthropic import Anthropic

    return Anthropic()


def generate_insight(features: Features, is_in_season: bool, training_note: Optional[str] = None) -> Insight:
    summary, action = _narrative(features, is_in_season, training_note)
    return Insight(
        risk_score=features.risk_score,
        fatigue_trend=features.fatigue_trend,
        ai_summary_text=summary,
        recommended_action=action,
        focus_body_part=features.focus_body_part,
    )


def _narrative(features: Features, is_in_season: bool, training_note: Optional[str] = None) -> tuple[str, RecommendedAction]:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.info("ANTHROPIC_API_KEY unset — using deterministic fallback narrative")
        return _fallback(features, is_in_season)

    prompt = _build_prompt(features, is_in_season, training_note)
    try:
        resp = _client().messages.create(
            model=MODEL,
            max_tokens=1024,
            thinking={"type": "adaptive"},
            system=_SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": _OUTPUT_SCHEMA}},
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception:  # network/auth/etc — degrade gracefully rather than 500
        logger.exception("Anthropic call failed; falling back")
        return _fallback(features, is_in_season)

    if resp.stop_reason == "refusal":
        logger.warning("Model refused; using fallback narrative")
        return _fallback(features, is_in_season)

    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    try:
        data = json.loads(text)
        action = data["recommended_action"]
        if action not in _ACTIONS:
            raise ValueError(f"unexpected action {action!r}")
        return str(data["ai_summary_text"]).strip(), action
    except (json.JSONDecodeError, KeyError, ValueError):
        logger.exception("Could not parse model output; using fallback")
        return _fallback(features, is_in_season)


def _build_prompt(features: Features, is_in_season: bool, training_note: Optional[str] = None) -> str:
    f = features.as_dict()
    season = "in-season (taper — favour recovery and short high-intensity work)" \
        if is_in_season else "off-season (build — heavier strength and endurance allowed)"
    training_line = f"- Training load: {training_note}\n" if training_note else ""
    return (
        f"Athlete metrics (window of {f['n_days']} days), {season}:\n"
        f"- Worst current pain: {f['max_pain_today']}/10"
        + (f" in {f['focus_body_part']}" if f["focus_body_part"] else " (none)")
        + "\n"
        f"- 7-day average worst-pain: {f['pain_7d_avg']}\n"
        f"- Sleep today: {f['sleep_today']} (z-score {f['sleep_z']})\n"
        f"- HRV today: {f['hrv_today']} (z-score {f['hrv_z']})\n"
        f"- Fatigue trend: {f['fatigue_trend']}\n"
        f"- Computed injury-risk score: {f['risk_score']} (0 safe .. 1 critical)\n"
        f"- Flags: {', '.join(f['flags']) or 'none'}\n"
        f"{training_line}\n"
        "Consider training-load progression when judging readiness. "
        "Give the recovery tip and choose the single best recommended_action."
    )


def _fallback(features: Features, is_in_season: bool) -> tuple[str, RecommendedAction]:
    """Deterministic narrative when the LLM is unavailable."""
    part = features.focus_body_part
    if features.max_pain_today >= 7 and part:
        action: RecommendedAction = "static_stretching_lower_body"
        return (
            f"{part.capitalize()} pain is high ({features.max_pain_today:.0f}/10). "
            "Skip sprints — focus on gentle mobility and static stretching there.",
            action,
        )
    if "sleep_drop" in features.flags or "hrv_drop" in features.flags:
        return (
            "Recovery markers dropped sharply versus your baseline. Keep today light "
            "and prioritise sleep and hydration.",
            "light_recovery",
        )
    if features.fatigue_trend == "declining" or features.risk_score >= 0.55:
        return (
            "Fatigue is trending up. Keep intensity moderate and warm up thoroughly "
            "before any hard efforts.",
            "moderate_drill",
        )
    if features.risk_score <= 0.3:
        action = "moderate_drill" if is_in_season else "heavy_sprint"
        return ("You're well recovered. Good day for a higher-intensity session.", action)
    return ("You're moderately ready. Train as planned but ease off if anything flares up.", "moderate_drill")
