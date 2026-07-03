"""Request/response schemas for the AI worker."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# Recommended actions the coach can return. Kept as a closed set so the frontend
# can map each to a UI treatment / drill bucket.
RecommendedAction = Literal[
    "rest",
    "static_stretching_lower_body",
    "mobility",
    "light_recovery",
    "moderate_drill",
    "heavy_sprint",
]

FatigueTrend = Literal["improving", "stable", "declining"]


class HistoryDay(BaseModel):
    """One day of journal data, oldest-to-newest in the request list."""

    date: str
    pain: dict[str, float] = Field(default_factory=dict)  # {"knee_left": 7}
    sleep: Optional[float] = None  # 1-10
    fatigue: Optional[float] = None  # 1-10
    nutrition: Optional[float] = None  # 1-10
    hrv: Optional[float] = None  # bpm-derived baseline, if available
    is_match_day: bool = False
    match_minutes: int = 0


class TrainingDay(BaseModel):
    date: str
    drills: list[dict] = Field(default_factory=list)  # [{name, sets, reps, load_kg}]
    total_minutes: Optional[int] = None
    intensity: Optional[float] = None  # 1-10


class AnalyzeRequest(BaseModel):
    user_id: str
    history: list[HistoryDay] = Field(default_factory=list)
    is_in_season: bool = True  # affects taper recommendations (Phase 4 logic)
    # Recent training load + nutrition, so the model can read progression over time.
    training: list[TrainingDay] = Field(default_factory=list)
    nutrition_log: list[dict] = Field(default_factory=list)


class Insight(BaseModel):
    risk_score: float = Field(ge=0.0, le=1.0)  # 0 safe .. 1 critical
    fatigue_trend: FatigueTrend
    ai_summary_text: str
    recommended_action: RecommendedAction
    focus_body_part: Optional[str] = None
