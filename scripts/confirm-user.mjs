// Manually confirms a user's email address.
//
// With "Confirm email" switched on, a signup is stuck until the person clicks a
// link. If mail is misconfigured, bouncing, or simply lands in spam, that person
// cannot get in and cannot fix it themselves. This is the rescue hatch: it marks
// the address confirmed so they can sign in, without needing the email at all.
//
// Only use it for someone who has genuinely asked for help — confirming an
// address you have not verified defeats the point of turning confirmation on.
//
// Usage:
//   SUPABASE_PROJECT_REF=.. SUPABASE_DB_PASSWORD=.. node scripts/confirm-user.mjs someone@example.com
//   ... node scripts/confirm-user.mjs --list        # show who is unconfirmed
import { Client } from "pg";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/confirm-user.mjs <email> | --list");
  process.exit(1);
}

const cs =
  process.env.SUPABASE_DB_URL ??
  `postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:${process.env.SUPABASE_DB_PASSWORD}@aws-0-${process.env.SUPABASE_REGION ?? "eu-west-3"}.pooler.supabase.com:5432/postgres`;

const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await c.connect();

if (arg === "--list") {
  const { rows } = await c.query(
    `select email, created_at, confirmation_sent_at
       from auth.users
      where email_confirmed_at is null
      order by created_at desc`
  );
  if (!rows.length) console.log("Everyone is confirmed.");
  else {
    console.log(`${rows.length} unconfirmed:`);
    for (const r of rows) {
      const sent = r.confirmation_sent_at ? `mail sent ${r.confirmation_sent_at.toISOString()}` : "NO MAIL SENT";
      console.log(`  ${r.email}  (signed up ${r.created_at.toISOString()}, ${sent})`);
    }
    // confirmation_sent_at being null across the board points at the project
    // config, not at delivery — nothing was ever handed to SMTP.
  }
  await c.end();
  process.exit(0);
}

const { rows } = await c.query("select id, email, email_confirmed_at from auth.users where lower(email) = lower($1)", [arg]);
if (!rows.length) {
  console.error(`No account for ${arg}`);
  await c.end();
  process.exit(1);
}
if (rows[0].email_confirmed_at) {
  console.log(`${rows[0].email} is already confirmed — nothing to do.`);
  await c.end();
  process.exit(0);
}

await c.query("update auth.users set email_confirmed_at = now() where id = $1", [rows[0].id]);
console.log(`Confirmed ${rows[0].email}. They can sign in now.`);
await c.end();
