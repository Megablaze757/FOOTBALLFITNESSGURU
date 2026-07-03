"""Biomechanics math — pure NumPy, no video/ML deps so it's unit-testable.

Operates on per-frame pose landmarks. A landmark frame is a dict of
name -> (x, y) in normalised [0,1] image coordinates (MediaPipe Pose convention,
y increases downward). We only need the lower-body chain.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

Point = tuple[float, float]
Frame = dict[str, Point]

# MediaPipe Pose landmark names we use.
SIDES = ("left", "right")


def angle_3pt(a: Point, b: Point, c: Point) -> float:
    """Interior angle at vertex b (degrees), formed by points a-b-c."""
    ba = np.array([a[0] - b[0], a[1] - b[1]])
    bc = np.array([c[0] - b[0], c[1] - b[1]])
    na, nc = np.linalg.norm(ba), np.linalg.norm(bc)
    if na == 0 or nc == 0:
        return 180.0
    cosang = np.clip(np.dot(ba, bc) / (na * nc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosang)))


def knee_valgus_angle(hip: Point, knee: Point, ankle: Point) -> float:
    """Frontal-plane knee collapse: deviation of the knee from the hip→ankle line.

    0 = knee tracks straight over the line; larger = more medial (inward) collapse.
    Computed as the angle between the hip→ankle vector and the hip→knee vector.
    """
    return _valgus(hip, knee, ankle)


def _valgus(hip: Point, knee: Point, ankle: Point) -> float:
    ha = np.array([ankle[0] - hip[0], ankle[1] - hip[1]])
    hk = np.array([knee[0] - hip[0], knee[1] - hip[1]])
    nha, nhk = np.linalg.norm(ha), np.linalg.norm(hk)
    if nha == 0 or nhk == 0:
        return 0.0
    cosang = np.clip(np.dot(ha, hk) / (nha * nhk), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosang)))


def knee_flexion_angle(hip: Point, knee: Point, ankle: Point) -> float:
    """Sagittal knee angle (degrees). 180 = straight leg; smaller = deeper bend."""
    return angle_3pt(hip, knee, ankle)


@dataclass
class SideMetrics:
    valgus_mean: float
    flexion_min: float


def side_metrics(frames: list[Frame], side: str) -> Optional[SideMetrics]:
    hip, knee, ankle = f"{side}_hip", f"{side}_knee", f"{side}_ankle"
    valgus, flexion = [], []
    for fr in frames:
        if hip in fr and knee in fr and ankle in fr:
            valgus.append(_valgus(fr[hip], fr[knee], fr[ankle]))
            flexion.append(knee_flexion_angle(fr[hip], fr[knee], fr[ankle]))
    if not valgus:
        return None
    return SideMetrics(
        valgus_mean=round(float(np.mean(valgus)), 1),
        flexion_min=round(float(np.min(flexion)), 1),
    )


def symmetry_score(left: SideMetrics, right: SideMetrics) -> int:
    """100 = identical left/right. Penalises valgus and flexion asymmetry."""
    valgus_diff = abs(left.valgus_mean - right.valgus_mean)
    flexion_diff = abs(left.flexion_min - right.flexion_min)
    # ~1 point per degree of valgus asymmetry, ~0.5 per degree of flexion.
    penalty = valgus_diff * 1.0 + flexion_diff * 0.5
    return int(max(0, min(100, round(100 - penalty))))


def estimate_ground_contact_ms(frames: list[Frame], fps: float) -> float:
    """Rough ground-contact: fraction of frames where the lower ankle is near its
    lowest point (stance), converted to milliseconds."""
    if not frames or fps <= 0:
        return 0.0
    ys = []
    for fr in frames:
        a = [fr[k][1] for k in ("left_ankle", "right_ankle") if k in fr]
        if a:
            ys.append(max(a))  # larger y = lower in frame = closer to ground
    if not ys:
        return 0.0
    arr = np.array(ys)
    threshold = arr.max() - 0.05 * (arr.max() - arr.min() + 1e-9)
    stance_frames = int(np.sum(arr >= threshold))
    return round(stance_frames / fps * 1000, 1)
