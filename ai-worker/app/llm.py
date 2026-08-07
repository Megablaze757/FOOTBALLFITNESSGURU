"""LLM narrative generation: Groq first, OpenRouter as the fallback.

The numeric fields (risk_score, fatigue_trend, focus_body_part) come from
analysis.py — deterministic and grounded. The LLM is asked only for the
qualitative pieces: a short coaching tip and a recommended action from a closed
set. This keeps the model from contradicting the math.

WHY NOT ANTHROPIC. This service used to hold its own Anthropic client while the
Cloudflare Worker and the Supabase Edge Functions each ran something else — three
AI stacks in one product, three sets of credentials, three things to rotate, and
three different ways for the same kind of failure to present. It now runs the
same chain as everything else: Groq for speed, OpenRouter behind it for breadth,
and a provider whose key is unset is skipped rather than attempted. See
supabase/functions/_shared/llm.ts, which this deliberately mirrors.

Structured output went with it. Anthropic's json_schema format has no equivalent
that every model on the chain honours, so the schema is stated in the prompt and
the reply is validated by parsing — a rung that answers with prose is a failed
rung, and the next one is tried.

With no key at all, a deterministic fallback narrative is used, so the service
runs end-to-end in dev and degrades to something sensible in production rather
than failing. That was already true and is the reason this conversion is safe.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from .analysis import Features
from .models import Insight, RecommendedAction

logger = logging.getLogger("ai-worker.llm")

# Endpoint, key variable and default models per provider, in preference order.
# Both speak the OpenAI chat-completions shape, which is why this is one code
# path and not two.
_PROVIDERS: tuple[dict, ...] = (
    {
        "name": "groq",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "key_var": "GROQ_API_KEY",
        "models_var": "GROQ_TEXT_MODELS",
        "models": ("openai/gpt-oss-120b", "llama-3.3-70b-versatile"),
    },
    {
        "name": "openrouter",
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "key_var": "OPENROUTER_API_KEY",
        "models_var": "OPENROUTER_TEXT_MODELS",
        "models": ("deepseek/deepseek-chat", "google/gemini-2.5-flash"),
    },
)

_TIMEOUT_S = 20.0

_ACTIONS: tuple[RecommendedAction, ...] = (
    "rest",
    "static_stretching_lower_body",
    "mobility",
    "light_recovery",
    "moderate_drill",
    "heavy_sprint",
)

# Stated in the prompt now rather than passed as an API parameter — see the
# module docstring. Only the enum is constrained; the rest is clamped in code.
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
    "invent numbers beyond those provided. "
    "Return ONLY valid minified JSON matching exactly this schema, with no prose, "
    "no markdown fence and no commentary:\n" + json.dumps(_OUTPUT_SCHEMA)
)


def _chain() -> list[tuple[str, str, str, str]]:
    """(provider, url, key, model) for each rung whose key is configured."""
    out: list[tuple[str, str, str, str]] = []
    for p in _PROVIDERS:
        key = os.environ.get(p["key_var"])
        if not key:
            continue
        configured = [m.strip() for m in os.environ.get(p["models_var"], "").split(",") if m.strip()]
        for model in (configured or list(p["models"])):
            out.append((p["name"], p["url"], key, model))
    return out


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
    chain = _chain()
    if not chain:
        logger.info("no GROQ_API_KEY or OPENROUTER_API_KEY — using deterministic fallback narrative")
        return _fallback(features, is_in_season)

    prompt = _build_prompt(features, is_in_season, training_note)
    for provider, url, key, model in chain:
        label = f"{provider}/{model}"
        try:
            text = _post(url, key, model, prompt)
        except Exception:  # network/auth/rate-limit — try the next rung
            logger.warning("%s failed; trying next rung", label, exc_info=True)
            continue

        parsed = _parse(text)
        if parsed is None:
            # A model that answers with prose or an apology has not done the job.
            # Falling through beats returning it: the caller cannot tell a bad
            # answer from a good one, and the deterministic fallback below is
            # genuinely better than a confident non-answer.
            logger.warning("%s returned an unusable reply; trying next rung", label)
            continue
        return parsed

    logger.warning("every model in the chain failed; using fallback narrative")
    return _fallback(features, is_in_season)


def _post(url: str, key: str, model: str, prompt: str) -> str:
    """One chat-completions call. Raises on any non-2xx or transport error."""
    # urllib rather than a new dependency: this is one POST of JSON, and adding
    # an SDK for it would mean a third HTTP client in a service that already has
    # what it needs in the standard library.
    import urllib.error
    import urllib.request

    body = json.dumps({
        "model": model,
        "max_tokens": 1024,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt},
        ],
    }).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            # OpenRouter attributes usage by these; Groq ignores what it doesn't know.
            "HTTP-Referer": "https://pocketathlete.com",
            "X-Title": "PocketAthlete",
        },
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
        payload = json.loads(resp.read())
    return payload["choices"][0]["message"]["content"]


def _parse(text: str) -> Optional[tuple[str, RecommendedAction]]:
    """The summary and action, or None if the reply isn't usable."""
    if not text or not text.strip():
        return None
    # Models wrap JSON in prose and markdown fences however firmly you ask them
    # not to, so take the outermost object rather than trusting the whole string.
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
        action = data["recommended_action"]
        if action not in _ACTIONS:
            raise ValueError(f"unexpected action {action!r}")
        summary = str(data["ai_summary_text"]).strip()
        if not summary:
            raise ValueError("empty summary")
        return summary, action
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        return None


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
