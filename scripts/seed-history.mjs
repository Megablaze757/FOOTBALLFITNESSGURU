// Seeds ~21 days of training + nutrition history for the demo athlete so the
// Progress page shows a realistic trend. Dev/demo only.
import { Client } from "pg";

const REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const REGION = process.env.SUPABASE_REGION ?? "eu-west-3";
const cs =
  process.env.SUPABASE_DB_URL ??
  `postgresql://postgres.${REF}:${PASSWORD}@aws-0-${REGION}.pooler.supabase.com:5432/postgres`;

const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(`select id from auth.users where email = 'athlete@example.com'`);
if (!rows.length) {
  console.error("athlete@example.com not found — run seed-user.mjs first");
  process.exit(1);
}
const uid = rows[0].id;

const day = (offset) => new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);
const drillPool = ["Single-leg RDL", "Box jumps", "Sprints", "Band walks", "Bulgarian split squat", "Passing drill"];

let trainingDays = 0;
let nutritionDays = 0;

for (let i = 20; i >= 0; i--) {
  const d = day(i);
  const progress = (20 - i) / 20; // 0 -> 1 over the window

  // Training ~5 days a week.
  if (i % 7 !== 5 && i % 7 !== 6) {
    const nDrills = 2 + (i % 2);
    const drills = Array.from({ length: nDrills }, (_, k) => ({
      name: drillPool[(i + k) % drillPool.length],
      sets: 3 + (k % 2),
      reps: 8 + (i % 5),
      load_kg: Math.round((40 + progress * 30 + k * 5) / 2.5) * 2.5, // rising loads
    }));
    await client.query(
      `insert into public.training_logs (user_id, log_date, drills, total_minutes, intensity)
       values ($1,$2,$3,$4,$5)
       on conflict (user_id, log_date) do update set drills=excluded.drills, total_minutes=excluded.total_minutes, intensity=excluded.intensity`,
      [uid, d, JSON.stringify(drills), 60 + Math.round(progress * 30), 6 + Math.round(progress * 3)]
    );
    trainingDays++;
  }

  // Nutrition ~6 days a week, protein creeping up.
  if (i % 7 !== 6) {
    const protein = Math.round(140 + progress * 50);
    const carbs = 220 + (i % 3) * 20;
    const fats = 65 + (i % 2) * 10;
    await client.query(
      `insert into public.nutrition_logs (user_id, log_date, daily_calorie_target, macros, daily_water_intake_ml)
       values ($1,$2,$3,$4,$5)
       on conflict (user_id, log_date) do update set daily_calorie_target=excluded.daily_calorie_target, macros=excluded.macros, daily_water_intake_ml=excluded.daily_water_intake_ml`,
      [uid, d, 2900, JSON.stringify({ protein, carbs, fats }), 2500 + Math.round(progress * 800)]
    );
    nutritionDays++;
  }
}

await client.end();
console.log(`seeded ${trainingDays} training days + ${nutritionDays} nutrition days for athlete`);
