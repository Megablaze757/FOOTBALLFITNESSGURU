"""Orchestrates: download → pose → biomechanics → pain correlation → drills."""

from __future__ import annotations

import logging
import tempfile
from typing import Optional

import httpx

from . import pose
from .biomech import Frame, estimate_ground_contact_ms, side_metrics, symmetry_score, SideMetrics
from .drills import select_drills
from .models import AnalysisResult, Biomechanics, Drill, FocusArea, HeatPoint, ProcessVideoRequest

logger = logging.getLogger("cv-worker.pipeline")

VALGUS_HIGH = 10.0       # degrees of inward collapse worth flagging
FLEXION_SHALLOW = 150.0  # min knee angle above this = not bending enough
SYMMETRY_LOW = 85


def analyze(req: ProcessVideoRequest) -> AnalysisResult:
    path = _download(req.video_url, req.video_id)
    frames, fps, source = pose.extract(path, req.video_id)
    return build_result(
        frames, fps, source, req.pain_map, req.session_type, req.is_in_season
    )


def _download(url: str, video_id: str) -> Optional[str]:
    try:
        with httpx.stream("GET", url, timeout=30.0, follow_redirects=True) as r:
            r.raise_for_status()
            tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            for chunk in r.iter_bytes():
                tmp.write(chunk)
            tmp.close()
            return tmp.name
    except Exception:
        logger.warning("Video download failed for %s; using synthetic pose", video_id)
        return None


def build_result(
    frames: list[Frame],
    fps: float,
    source: str,
    pain_map: dict[str, float],
    session_type: Optional[str],
    is_in_season: bool,
) -> AnalysisResult:
    left = side_metrics(frames, "left")
    right = side_metrics(frames, "right")
    # Defensive: synthetic always yields both, but guard for sparse real video.
    if left is None or right is None:
        left = left or SideMetrics(0.0, 180.0)
        right = right or SideMetrics(0.0, 180.0)

    sym = symmetry_score(left, right)
    gct = estimate_ground_contact_ms(frames, fps)

    weaknesses = _detect_weaknesses(left, right, sym)
    focus = _focus_area(weaknesses, session_type)
    alert = _root_cause(left, right, pain_map)

    return AnalysisResult(
        symmetry_score=sym,
        biomechanics=Biomechanics(
            knee_valgus_left=left.valgus_mean,
            knee_valgus_right=right.valgus_mean,
            knee_flexion_left=left.flexion_min,
            knee_flexion_right=right.flexion_min,
            ground_contact_ms=gct,
        ),
        heatmap_data=_heatmap(frames, left, right),
        root_cause_alert=alert,
        focus_area=focus,
        drills=select_drills(focus, weaknesses, is_in_season),
        pose_source=source,  # type: ignore[arg-type]
    )


def _detect_weaknesses(left: SideMetrics, right: SideMetrics, sym: int) -> list[str]:
    w: list[str] = []
    if max(left.valgus_mean, right.valgus_mean) >= VALGUS_HIGH:
        w.append("valgus")
    if sym < SYMMETRY_LOW:
        w.append("symmetry")
    if min(left.flexion_min, right.flexion_min) >= FLEXION_SHALLOW:
        w.append("flexion")
    return w


def _focus_area(weaknesses: list[str], session_type: Optional[str]) -> FocusArea:
    if "valgus" in weaknesses:
        return "stability"
    if "symmetry" in weaknesses:
        return "symmetry"
    if session_type == "recovery":
        return "stability"
    if session_type == "match":
        return "endurance"
    return "explosiveness"


def _root_cause(left: SideMetrics, right: SideMetrics, pain_map: dict[str, float]) -> Optional[str]:
    worse_side = "left" if left.valgus_mean >= right.valgus_mean else "right"
    worse_valgus = max(left.valgus_mean, right.valgus_mean)
    knee_pain = pain_map.get(f"knee_{worse_side}", pain_map.get("knee", 0))

    if worse_valgus >= VALGUS_HIGH and knee_pain >= 7:
        return (
            f"Your {worse_side} knee is caving inwards during landing "
            f"({worse_valgus:.0f}° valgus), matching your journal's knee pain "
            f"({knee_pain:.0f}/10). Likely the root cause — prioritise stability work."
        )
    if worse_valgus >= VALGUS_HIGH:
        return (
            f"Noticeable inward collapse in the {worse_side} knee "
            f"({worse_valgus:.0f}° valgus). Address it before it becomes painful."
        )
    return None


def _heatmap(frames: list[Frame], left: SideMetrics, right: SideMetrics) -> list[HeatPoint]:
    """Sample knee positions, weighting intensity by each side's valgus."""
    points: list[HeatPoint] = []
    if not frames:
        return points
    step = max(1, len(frames) // 12)
    li = min(1.0, left.valgus_mean / 20)
    ri = min(1.0, right.valgus_mean / 20)
    for fr in frames[::step]:
        if "left_knee" in fr:
            points.append(HeatPoint(x=fr["left_knee"][0], y=fr["left_knee"][1], intensity=round(li, 2)))
        if "right_knee" in fr:
            points.append(HeatPoint(x=fr["right_knee"][0], y=fr["right_knee"][1], intensity=round(ri, 2)))
    return points
