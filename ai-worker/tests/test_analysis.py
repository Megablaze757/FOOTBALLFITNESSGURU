"""Tests for the deterministic feature extraction + fallback narrative.

Run from ai-worker/:  python -m pytest   (or: python -m unittest)
These avoid any network calls — the LLM path is exercised only via the fallback.
"""

import unittest

from app.analysis import extract_features
from app.llm import generate_insight
from app.models import HistoryDay


def _day(date, pain=None, sleep=7, fatigue=4, nutrition=7, hrv=70):
    return HistoryDay(
        date=date, pain=pain or {}, sleep=sleep, fatigue=fatigue, nutrition=nutrition, hrv=hrv
    )


class TestFeatures(unittest.TestCase):
    def test_high_pain_sets_focus_and_flag(self):
        hist = [
            _day("2026-06-01"),
            _day("2026-06-02"),
            _day("2026-06-03", pain={"knee_left": 8}),
        ]
        f = extract_features(hist)
        self.assertEqual(f.focus_body_part, "left knee")
        self.assertIn("high_pain", f.flags)
        self.assertGreater(f.risk_score, 0.4)

    def test_sleep_drop_flagged_via_zscore(self):
        hist = [_day(f"2026-06-0{i}", sleep=8) for i in range(1, 6)]
        hist.append(_day("2026-06-06", sleep=3))  # sharp drop
        f = extract_features(hist)
        self.assertIn("sleep_drop", f.flags)

    def test_rising_fatigue_declining_trend(self):
        hist = [
            _day("2026-06-01", fatigue=2),
            _day("2026-06-02", fatigue=3),
            _day("2026-06-03", fatigue=7),
            _day("2026-06-04", fatigue=8),
        ]
        self.assertEqual(extract_features(hist).fatigue_trend, "declining")

    def test_empty_history_is_safe_default(self):
        f = extract_features([])
        self.assertEqual(f.risk_score, 0.0)
        self.assertEqual(f.fatigue_trend, "stable")


class TestFallbackInsight(unittest.TestCase):
    def test_insight_uses_computed_numbers(self):
        hist = [
            _day("2026-06-01"),
            _day("2026-06-02"),
            _day("2026-06-03", pain={"hamstring_right": 9}, sleep=4),
        ]
        f = extract_features(hist)
        insight = generate_insight(f, is_in_season=True)  # no API key -> fallback
        self.assertEqual(insight.risk_score, f.risk_score)
        self.assertEqual(insight.focus_body_part, "right hamstring")
        self.assertEqual(insight.recommended_action, "static_stretching_lower_body")
        self.assertIn("hamstring", insight.ai_summary_text.lower())


if __name__ == "__main__":
    unittest.main()
