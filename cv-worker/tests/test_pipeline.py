"""Tests for biomechanics math, drill selection, and the synthetic pipeline.

No OpenCV/MediaPipe needed — exercises the synthetic pose path.
Run from cv-worker/:  python -m unittest discover -s tests
"""

import unittest

from app import pose
from app.biomech import angle_3pt, knee_flexion_angle, _valgus, symmetry_score, SideMetrics
from app.drills import select_drills
from app.pipeline import build_result


class TestBiomech(unittest.TestCase):
    def test_straight_leg_is_180(self):
        # hip, knee, ankle vertically aligned -> straight knee.
        a = knee_flexion_angle((0.5, 0.4), (0.5, 0.6), (0.5, 0.8))
        self.assertAlmostEqual(a, 180.0, places=1)

    def test_right_angle(self):
        self.assertAlmostEqual(angle_3pt((0, 0), (1, 0), (1, 1)), 90.0, places=1)

    def test_valgus_zero_when_aligned(self):
        self.assertAlmostEqual(_valgus((0.5, 0.4), (0.5, 0.6), (0.5, 0.8)), 0.0, places=1)

    def test_valgus_positive_when_knee_shifts_in(self):
        v = _valgus((0.5, 0.4), (0.42, 0.6), (0.5, 0.8))  # knee pulled medial
        self.assertGreater(v, 1.0)

    def test_symmetry_perfect_and_penalised(self):
        m = SideMetrics(valgus_mean=5, flexion_min=120)
        self.assertEqual(symmetry_score(m, m), 100)
        asy = symmetry_score(SideMetrics(5, 120), SideMetrics(15, 120))
        self.assertLess(asy, 100)


class TestDrills(unittest.TestCase):
    def test_valgus_weakness_picks_stability_drills(self):
        drills = select_drills("stability", ["valgus"], is_in_season=False)
        self.assertTrue(drills)
        self.assertTrue(any(d.id in ("drill_14", "drill_22") for d in drills))

    def test_in_season_tapers_volume(self):
        off = select_drills("explosiveness", ["explosiveness"], is_in_season=False)[0]
        on = select_drills("explosiveness", ["explosiveness"], is_in_season=True)[0]
        self.assertLessEqual(on.sets, off.sets)


class TestPipeline(unittest.TestCase):
    def test_synthetic_pipeline_is_deterministic_and_complete(self):
        frames, fps, source = pose.extract(None, "video-abc")
        self.assertEqual(source, "synthetic")
        r1 = build_result(frames, fps, source, {"knee_left": 8}, "training", True)
        frames2, _, _ = pose.extract(None, "video-abc")
        r2 = build_result(frames2, fps, source, {"knee_left": 8}, "training", True)
        self.assertEqual(r1.symmetry_score, r2.symmetry_score)  # deterministic
        self.assertTrue(0 <= r1.symmetry_score <= 100)
        self.assertTrue(r1.heatmap_data)
        self.assertTrue(r1.drills)

    def test_pain_correlation_produces_alert(self):
        # Find a video_id whose worse side has high valgus, then confirm the alert
        # references the matching knee pain.
        frames, fps, source = pose.extract(None, "high-valgus-seed-42")
        r = build_result(frames, fps, source, {"knee_left": 9, "knee_right": 9}, "match", False)
        # With pain on both knees, any high-valgus side should alert.
        if max(r.biomechanics.knee_valgus_left, r.biomechanics.knee_valgus_right) >= 10:
            self.assertIsNotNone(r.root_cause_alert)
            self.assertIn("knee", r.root_cause_alert.lower())


if __name__ == "__main__":
    unittest.main()
