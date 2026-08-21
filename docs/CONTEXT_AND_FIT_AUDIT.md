# Context and fit audit

The product rule is: do not ask an athlete for a fact the app already has, do
not treat a follow-up as a new conversation, and do not build a long candidate
list then cut it off at a limit. Use the available context and choose the
highest-value combination that satisfies the constraint.

| Surface | Context used | How the result fits | Audit result |
| --- | --- | --- | --- |
| Programme builder | sport, positions, ordered goals, focus, season, pain, exclusions, equipment, schedule, exercise picks, runner mileage/level/pace | all completed plans pass through a value-scored multiple-choice time fit; normal sessions are at most 90 minutes, dedicated endurance sessions 120, active rest 60 | fixed: the old parser counted coaching prose as timed work; preferences and AI repair had no final time guard; AI-shaped plans could discard explicit exercise picks; custom top-ups could pull another sport's exercises |
| Ask Coach | height, latest valid bodyweight, age, sex, activity, diet goal, calorie/macronutrient targets and intake, programme, training logs, readiness, recovery trend, pain, rehab stage, ranks and benchmarks | latest 12 turns are sent alongside the current athlete briefing; recent history is stored privately and bounded in the prompt | fixed: the production Worker discarded the full briefing and every previous turn; the visible bubbles were not conversation memory |
| Injury planner | sport, age, sex, experience, training focus, current goal/season, latest recovery and pain, current programme exercises, injury description and duration | the model grades stages by symptoms and criteria, not by a calendar deadline | fixed: it previously received only sport, area, duration and free text even though the rest was already on file |
| Nutrition targets and meal planner | latest valid bodyweight, height, age, sex, activity, training load, goal, diet pattern/avoidances, meal count, budget, recent/starred meals | meal selection already scores cost, calorie/protein fit, portion quality, repetition and recent variety across candidate combinations | already follows the rule; no context gap found in the planner path |
| Food estimator | the meal text/photo and serving evidence | estimates the food only; athlete-specific targets are applied by Nutrition after estimation | deliberately narrow, not a gap: body measurements should not change the calories in a photographed banana |
| Video analysis | movement-specific measurements, confidence, view, findings and prescribed corrective drills | one-shot analysis rather than a conversation; the rule engine provides the deterministic fallback | appropriate for the task; no unrelated profile data is needed to interpret the measured frame |
| Weekly challenges | sport, goal and recent activity counters | deterministic local pool balances neglected habits and achievable targets | already follows the rule; the old AI-on-mount route is no longer called |
| Admin content | topic, format and an explicit allow-list of product facts | invalid/fabricated claims are rejected | not athlete personalisation; intentionally isolated from athlete data |

The regression seams are covered by `session-time.test.ts`,
`session-budget.test.ts`, `coach-chat.test.ts`, `coach-briefing.test.ts`,
`program-preferences.test.ts` and `rehab-plan.test.ts`.
