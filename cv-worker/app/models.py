"""Request/response schemas for the CV worker."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

FocusArea = Literal["explosiveness", "endurance", "stability", "symmetry", "ball-control"]


class ProcessVideoRequest(BaseModel):
    video_id: str
    user_id: str
    video_url: str  # signed URL the worker downloads
    session_type: Optional[str] = None  # 'match' | 'training' | 'recovery'
    is_in_season: bool = True
    pain_map: dict[str, float] = Field(default_factory=dict)  # from the linked check-in


class Drill(BaseModel):
    id: str
    name: str
    sets: int
    reps: int
    targets: str  # what weakness it addresses


class HeatPoint(BaseModel):
    x: float  # 0..1 normalised frame coords
    y: float
    intensity: float  # 0..1


class Biomechanics(BaseModel):
    knee_valgus_left: float   # degrees of inward collapse
    knee_valgus_right: float
    knee_flexion_left: float  # min knee angle (deeper = lower)
    knee_flexion_right: float
    ground_contact_ms: float


class AnalysisResult(BaseModel):
    status: Literal["success"] = "success"
    symmetry_score: int = Field(ge=0, le=100)  # 100 = perfectly symmetric
    biomechanics: Biomechanics
    heatmap_data: list[HeatPoint]
    root_cause_alert: Optional[str] = None
    focus_area: FocusArea
    drills: list[Drill]
    pose_source: Literal["mediapipe", "synthetic"]
