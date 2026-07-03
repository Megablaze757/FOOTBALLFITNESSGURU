// Seeds confirmed auth users directly into the live DB (dev/demo only).
// Usage: SUPABASE_PROJECT_REF=.. SUPABASE_DB_PASSWORD=.. node scripts/seed-user.mjs
import { Client } from "pg";

const REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const REGION = process.env.SUPABASE_REGION ?? "eu-west-3";
const cs =
  process.env.SUPABASE_DB_URL ??
  `postgresql://postgres.${REF}:${PASSWORD}@aws-0-${REGION}.pooler.supabase.com:5432/postgres`;

const USERS = [
  { email: "athlete@example.com", password: "Test1234!", name: "Alex Athlete", role: "athlete" },
  { email: "admin@example.com", password: "Test1234!", name: "Admin User", role: "admin" },
];

const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await client.connect();

for (const u of USERS) {
  // Idempotent: remove any prior user with this email.
  await client.query(`delete from auth.users where email = $1`, [u.email]);

  const { rows } = await client.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       is_sso_user, is_anonymous
     ) values (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       $1, crypt($2, gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', $3, now(), now(),
       '', '', '', '', false, false
     ) returning id`,
    [u.email, u.password, JSON.stringify({ full_name: u.name })]
  );
  const id = rows[0].id;

  // Identity row (GoTrue requires provider_id for email logins).
  await client.query(
    `insert into auth.identities (
       id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
     ) values (
       gen_random_uuid(), $1, $2, 'email', $3, now(), now(), now()
     )`,
    [id, JSON.stringify({ sub: id, email: u.email, email_verified: true }), u.email]
  );

  // handle_new_user trigger created the profile; set name + role.
  await client.query(
    `update public.profiles set full_name = $2, role = $3 where id = $1`,
    [id, u.name, u.role]
  );

  console.log(`seeded ${u.email} (${u.role}) -> ${id}`);
}

await client.end();
console.log("done");
