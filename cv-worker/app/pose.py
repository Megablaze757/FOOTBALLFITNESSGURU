"""Pose landmark extraction.

Uses MediaPipe Pose + OpenCV when installed and a video file is available.
Falls back to a deterministic synthetic gait (seeded by video_id) so the service
runs and is testable without the heavy CV stack or a real video.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from .biomech import Frame

logger = logging.getLogger("cv-worker.pose")

# MediaPipe Pose landmark index -> our name (lower body + shoulders).
_LANDMARK_MAP = {
    11: "left_shoulder",
    12: "right_shoulder",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
}


def extract(video_path: Optional[str], video_id: str) -> tuple[list[Frame], float, str]:
    """Returns (frames, fps, source). source is 'mediapipe' or 'synthetic'."""
    if video_path:
        try:
            return (*_extract_mediapipe(video_path), "mediapipe")
        except Exception:
            logger.exception("MediaPipe extraction failed; using synthetic fallback")
    return (*_synthetic(video_id), "synthetic")


def _extract_mediapipe(video_path: str) -> tuple[list[Frame], float]:
    import cv2  # type: ignore
    import mediapipe as mp  # type: ignore

    pose = mp.solutions.pose.Pose(model_complexity=1, min_detection_confidence=0.5)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    frames: list[Frame] = []
    idx = 0
    try:
        while True:
            ok, image = cap.read()
            if not ok:
                break
            # Sample ~10 fps to keep it fast.
            if idx % max(1, int(round(fps / 10))) == 0:
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                res = pose.process(rgb)
                if res.pose_landmarks:
                    lm = res.pose_landmarks.landmark
                    frame: Frame = {
                        name: (lm[i].x, lm[i].y) for i, name in _LANDMARK_MAP.items()
                    }
                    frames.append(frame)
            idx += 1
    finally:
        cap.release()
        pose.close()
    return frames, fps


def _synthetic(video_id: str, n_frames: int = 60, fps: float = 30.0) -> tuple[list[Frame], float]:
    """Plausible asymmetric squat/sprint cycle, deterministic per video_id."""
    rng = np.random.default_rng(abs(hash(video_id)) % (2**32))

    # One side collapses inward more than the other (the "weak link").
    valgus_left = rng.uniform(2, 16)
    valgus_right = rng.uniform(2, 16)
    flex_depth = rng.uniform(0.10, 0.20)  # how far knees travel through the cycle

    frames: list[Frame] = []
    for k in range(n_frames):
        phase = np.sin(2 * np.pi * k / n_frames)  # -1..1 squat cycle
        knee_y = 0.70 + flex_depth * (phase * 0.5 + 0.5)  # lower = deeper bend

        # Inward (medial) knee shift scaled by the side's valgus tendency.
        lshift = (valgus_left / 100) * (phase * 0.5 + 0.5)
        rshift = (valgus_right / 100) * (phase * 0.5 + 0.5)

        frames.append(
            {
                "left_shoulder": (0.44, 0.30),
                "right_shoulder": (0.56, 0.30),
                "left_hip": (0.46, 0.50),
                "right_hip": (0.54, 0.50),
                "left_knee": (0.46 + lshift, knee_y),   # collapses toward midline
                "right_knee": (0.54 - rshift, knee_y),
                "left_ankle": (0.46, 0.90),
                "right_ankle": (0.54, 0.90),
            }
        )
    return frames, fps
