// Seeds a demo coach, links a squad, and adds body-composition history.
import { Client } from "pg";

const cs = `postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:${process.env.SUPABASE_DB_PASSWORD}@aws-0-${process.env.SUPABASE_REGION ?? "eu-west-3"}.pooler.supabase.com:5432/postgres`;
const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await c.connect();

async function userId(email) {
  const { rows } = await c.query("select id from auth.users where email=$1", [email]);
  return rows[0]?.id ?? null;
}

// 1. Create the coach if needed.
let coachId = await userId("coach@example.com");
if (!coachId) {
  const { rows } = await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
       email_change_token_new, email_change, is_sso_user, is_anonymous)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'coach@example.com', crypt('Test1234!', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{"full_name":"Coach Carter"}', now(), now(), '', '', '', '', false, false)
     returning id`
  );
  coachId = rows[0].id;
  await c.query(
    `insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, 'email', 'coach@example.com', now(), now(), now())`,
    [coachId, JSON.stringify({ sub: coachId, email: "coach@example.com", email_verified: true })]
  );
}
await c.query("update public.profiles set full_name='Coach Carter', role='coach' where id=$1", [coachId]);
console.log("coach:", coachId);

// 2. Link the squad (athlete + admin as athletes).
const athleteIds = (await Promise.all([userId("athlete@example.com"), userId("admin@example.com")])).filter(Boolean);
for (const aid of athleteIds) {
  await c.query("insert into public.coach_athletes (coach_id, athlete_id) values ($1,$2) on conflict do nothing", [coachId, aid]);
}
console.log("linked athletes:", athleteIds.length);

// 3. Body-composition history for the athlete.
const alex = await userId("athlete@example.com");
for (let i = 40; i >= 0; i -= 5) {
  const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
  const p = (40 - i) / 40;
  const weight = +(76.5 - p * 2).toFixed(1);       // trending down
  const bf = +(14.5 - p * 2.5).toFixed(1);          // leaning out
  await c.query(
    `insert into public.body_logs (user_id, log_date, weight_kg, body_fat_pct) values ($1,$2,$3,$4)
     on conflict (user_id, log_date) do update set weight_kg=excluded.weight_kg, body_fat_pct=excluded.body_fat_pct`,
    [alex, d, weight, bf]
  );
}
console.log("body_logs seeded for athlete");

await c.end();
console.log("done — coach@example.com / Test1234!");
