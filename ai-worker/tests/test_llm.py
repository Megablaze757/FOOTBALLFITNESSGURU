"""The provider chain and the reply parser.

Deliberately importable WITHOUT numpy, pandas or scipy. `llm.py` only touches
`analysis.Features` as a type annotation, so stubbing the scientific stack lets
these run anywhere — including a CI job or a laptop that has not installed a
150MB dependency tree to check a string-parsing function.

What is worth testing here is the two things that are invisible until they fail:
a provider with no key must be SKIPPED rather than attempted, and a model that
answers with an apology must be REJECTED rather than passed off as coaching
advice.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path


def _load_llm():
    """Import app.llm with the scientific stack stubbed out."""
    for name in ("numpy", "pandas", "scipy", "scipy.stats"):
        sys.modules.setdefault(name, types.ModuleType(name))
    analysis = types.ModuleType("app.analysis")
    analysis.Features = object
    models = types.ModuleType("app.models")
    models.Insight = object
    models.RecommendedAction = str
    app = types.ModuleType("app")
    app.__path__ = []
    sys.modules.update({"app": app, "app.analysis": analysis, "app.models": models})

    path = Path(__file__).resolve().parent.parent / "app" / "llm.py"
    spec = importlib.util.spec_from_file_location("app.llm", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


llm = _load_llm()

_KEYS = ("GROQ_API_KEY", "OPENROUTER_API_KEY", "GROQ_TEXT_MODELS", "OPENROUTER_TEXT_MODELS")


class TestChain(unittest.TestCase):
    def setUp(self):
        self._saved = {k: os.environ.pop(k, None) for k in _KEYS}

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_no_keys_means_empty_chain(self):
        # And an empty chain means the deterministic fallback, not a crash and
        # not a 500 — this service degrades rather than failing.
        self.assertEqual(llm._chain(), [])

    def test_groq_comes_first(self):
        os.environ["GROQ_API_KEY"] = "g"
        os.environ["OPENROUTER_API_KEY"] = "o"
        chain = llm._chain()
        self.assertEqual(chain[0][0], "groq")
        self.assertTrue(any(r[0] == "openrouter" for r in chain), "OpenRouter must be reachable as a fallback")

    def test_a_provider_without_a_key_is_skipped(self):
        os.environ["OPENROUTER_API_KEY"] = "o"
        chain = llm._chain()
        self.assertTrue(chain, "OpenRouter alone must be a working configuration")
        self.assertTrue(all(r[0] == "openrouter" for r in chain))

    def test_env_overrides_the_model_list(self):
        os.environ["OPENROUTER_API_KEY"] = "o"
        os.environ["OPENROUTER_TEXT_MODELS"] = "a/b, c/d"
        self.assertEqual([r[3] for r in llm._chain()], ["a/b", "c/d"])


class TestParse(unittest.TestCase):
    def test_plain_json(self):
        out = llm._parse('{"ai_summary_text":"Rest the knee.","recommended_action":"rest"}')
        self.assertEqual(out, ("Rest the knee.", "rest"))

    def test_json_wrapped_in_prose_and_a_fence(self):
        # Models do this however firmly the prompt asks them not to.
        raw = 'Sure! ```json\n{"ai_summary_text":"Ease off.","recommended_action":"mobility"}\n```'
        self.assertEqual(llm._parse(raw), ("Ease off.", "mobility"))

    def test_an_apology_is_not_an_answer(self):
        self.assertIsNone(llm._parse("I'm sorry, I can't help with that."))

    def test_action_outside_the_closed_set_is_rejected(self):
        # The action drives what the app tells an athlete to do with a painful
        # knee. An unrecognised value must never reach the caller.
        self.assertIsNone(llm._parse('{"ai_summary_text":"x","recommended_action":"teleport"}'))

    def test_empty_summary_is_rejected(self):
        self.assertIsNone(llm._parse('{"ai_summary_text":"  ","recommended_action":"rest"}'))

    def test_empty_input(self):
        self.assertIsNone(llm._parse(""))
        self.assertIsNone(llm._parse("   "))


if __name__ == "__main__":
    unittest.main()
