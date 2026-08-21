import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localCoachAnswer } from "./coach-chat";

const ctx = {
  goal: "agility" as const,
  soreAreas: ["knee"],
  readinessStatus: "Red" as const,
  programDrills: ["Ladder quick-feet", "Reactive mirror drill"],
};

test("explains why a drill is in the plan, noting the sore knee", () => {
  const a = localCoachAnswer("why is Ladder quick-feet in my plan?", ctx);
  assert.match(a, /ladder quick-feet/i);
  assert.match(a, /agility/i);
  assert.match(a, /knee/i);
});

test("answers pain questions with substitution guidance", () => {
  const a = localCoachAnswer("my knee is sore, what now?", ctx);
  assert.match(a, /knee/i);
  assert.match(a, /physio|lower-?load|lower-?impact/i);
});

test("answers readiness questions using today's status", () => {
  assert.match(localCoachAnswer("am I ready to train?", ctx), /recovery|red/i);
});

test("falls back helpfully for unknown questions", () => {
  const a = localCoachAnswer("what's the offside rule", ctx);
  assert.ok(a.length > 0);
});

test("the offline food answer uses measurements and targets the app already knows", () => {
  const answer = localCoachAnswer("How much should I eat?", {
    ...ctx, bodyweightKg: 78, heightCm: 181, calorieTarget: 2_900, proteinTarget: 170,
  });
  for (const ownNumber of ["78kg", "181cm", "2900 kcal", "170g protein"]) {
    assert.match(answer, new RegExp(ownNumber), `${ownNumber} was ignored`);
  }
});

test("every chat route receives the briefing and recent conversation", () => {
  const client = readFileSync(new URL("../components/CoachChat.tsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const edge = readFileSync(new URL("../supabase/functions/coach-chat/index.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0090_coach_conversation.sql", import.meta.url), "utf8");

  assert.match(client, /briefing, history/, "the visible conversation is not sent with the next question");
  assert.match(client, /sessionStorage/, "leaving Ask Coach erases the current conversation");
  assert.match(client, /from\("coach_messages"\)/, "conversation history cannot survive another device");
  for (const [name, source] of [["Cloudflare Worker", worker], ["Supabase fallback", edge]] as const) {
    assert.match(source, /RECENT CONVERSATION/, `${name} discards prior turns`);
    assert.match(source, /ATHLETE BRIEFING/, `${name} discards the full athlete context`);
    assert.match(source, /body\.briefing|briefing\.trim/, `${name} never reads the briefing field`);
  }
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /user_id = auth\.uid\(\)/, "one athlete could read another athlete's conversation");
  assert.match(migration, /on delete cascade/i, "deleting an account leaves its coaching conversation behind");
});
