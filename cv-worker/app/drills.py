"""Drill library + selection logic.

Each drill is tagged with the weakness it addresses. The selector picks drills
for the detected weaknesses, tapering volume when the athlete is in-season.
"""

from __future__ import annotations

from .models import Drill, FocusArea

# weakness tags: valgus, symmetry, flexion, explosiveness, endurance, control
_LIBRARY: list[dict] = [
    {"id": "drill_14", "name": "Single-leg RDL", "base_sets": 3, "reps": 12, "tag": "valgus", "targets": "knee stability"},
    {"id": "drill_22", "name": "Band lateral walks", "base_sets": 4, "reps": 15, "tag": "valgus", "targets": "glute med / knee tracking"},
    {"id": "drill_31", "name": "Copenhagen plank", "base_sets": 3, "reps": 10, "tag": "symmetry", "targets": "adductor balance"},
    {"id": "drill_07", "name": "Bulgarian split squat", "base_sets": 3, "reps": 10, "tag": "symmetry", "targets": "unilateral strength"},
    {"id": "drill_18", "name": "Box jumps", "base_sets": 4, "reps": 6, "tag": "explosiveness", "targets": "power"},
    {"id": "drill_05", "name": "Depth-drop to sprint", "base_sets": 3, "reps": 5, "tag": "explosiveness", "targets": "reactive strength"},
    {"id": "drill_44", "name": "Tempo runs 6x100m", "base_sets": 1, "reps": 6, "tag": "endurance", "targets": "aerobic base"},
    {"id": "drill_12", "name": "Deep goblet squat hold", "base_sets": 3, "reps": 8, "tag": "flexion", "targets": "ankle/knee mobility"},
    {"id": "drill_27", "name": "Tight-space dribbling grid", "base_sets": 4, "reps": 12, "tag": "control", "targets": "ball control"},
]


def _scale_sets(base: int, is_in_season: bool) -> int:
    # In-season taper: ~30% volume reduction, floor of 1 set.
    return max(1, round(base * 0.7)) if is_in_season else base


def select_drills(focus: FocusArea, weaknesses: list[str], is_in_season: bool) -> list[Drill]:
    # Prioritise drills matching detected weaknesses, then the focus area.
    wanted = list(dict.fromkeys([*weaknesses, focus]))  # de-dup, keep order
    picked: list[Drill] = []
    seen: set[str] = set()
    for tag in wanted:
        for d in _LIBRARY:
            if d["tag"] == tag and d["id"] not in seen:
                seen.add(d["id"])
                picked.append(
                    Drill(
                        id=d["id"],
                        name=d["name"],
                        sets=_scale_sets(d["base_sets"], is_in_season),
                        reps=d["reps"],
                        targets=d["targets"],
                    )
                )
        if len(picked) >= 4:
            break
    return picked[:4]
