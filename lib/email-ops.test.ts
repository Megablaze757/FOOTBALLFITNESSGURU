import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * "EMAIL NOTIFICATIONS DON'T WORK. NO WAY TO VERIFY THEY'RE BEING SENT. NO
 *  AUDIT TRAIL."
 *
 * The audit trail existed. Every send has written to email_delivery_logs since
 * migration 0089 — the provider's id when it worked, its error when it did not
 * — and the only policy on that table was "read own". So an admin querying it
 * saw their own handful of rows and concluded nothing was being sent, which is
 * exactly what nothing being sent looks like.
 *
 * The other half is worse and is why "doesn't work" is probably right: the
 * email provider is a Cloudflare secret, secrets cannot be read back, and the
 * Worker is pasted into the dashboard by hand — which does NOT apply anything
 * in wrangler.toml. A variable set in the repo and never set in the dashboard
 * is unset in production, and from the database that is indistinguishable from
 * a quiet day. Only the Worker can answer it, so only the Worker is asked.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = read("../cloudflare/src/index.ts");
const migration = read("../supabase/migrations/0095_admin_visibility_and_email_audit.sql");
const ui = read("../components/admin/EmailOps.tsx");

test("an admin can read the delivery log at all", () => {
  // THE ACTUAL BUG. Perfect logging that nobody is allowed to read is not an
  // audit trail.
  assert.match(migration, /create policy "email delivery: admin read"[\s\S]{0,200}public\.is_admin\(\)/);
  assert.match(migration, /create policy "body logs: admin read"/);
  assert.match(migration, /create policy "custom_ex: admin read"/);
  assert.match(migration, /create policy "notifications: admin read"/);
});

test("every admin function checks who is asking, server-side", () => {
  // A hidden panel is not a permission. Both are `security definer`, so without
  // the guard inside they would hand any signed-in user the whole mailing list.
  for (const fn of ["email_log_summary", "email_audit"]) {
    const at = migration.indexOf(`function public.${fn}(`);
    assert.ok(at > 0, `${fn} is missing`);
    const body = migration.slice(at, migration.indexOf("$$;", at));
    assert.match(body, /security definer/, `${fn} should be security definer`);
    assert.match(body, /if not public\.is_admin\(\) then\s*raise exception/, `${fn} is not admin-gated`);
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`), `${fn} keeps its default grants`);
  }
});

test("the audit says what triggered each email", () => {
  // A JOIN, not a new table: the notification says why it exists and the
  // delivery log says what happened to it. A notification that never became an
  // email is still visible as a trigger with no send.
  assert.match(migration, /left join lateral[\s\S]{0,400}notification_' \|\| n2\.kind/);
  assert.match(migration, /trigger_title text/);
  assert.match(ui, /What triggered each email/);
});

test("the recipient is masked in the database, not in the browser", () => {
  // A masked column cannot be un-masked by a curious client. Masking in the UI
  // ships the whole address to it and asks it politely not to look.
  assert.match(migration, /left\(u\.email, 1\) \|\| '\*\*\*@' \|\| split_part\(u\.email, '@', 2\)/);
  assert.ok(!/u\.email as recipient/.test(migration), "the raw address is returned");
});

test("the config check can only be answered by the Worker, and it is", () => {
  assert.match(worker, /pathname\.endsWith\("\/email-status"\)/);
  assert.match(worker, /async function emailStatus/);
  // Booleans only. A boolean cannot leak a key — so every secret this reports
  // on must be coerced, and none may be returned raw.
  const body = worker.slice(worker.indexOf("async function emailStatus"), worker.indexOf("async function emailTest"));
  for (const secret of ["GAS_EMAIL_SECRET", "RESEND_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const uses = [...body.matchAll(new RegExp(`env\\.${secret}`, "g"))];
    assert.ok(uses.length > 0, `emailStatus says nothing about ${secret}`);
    for (const use of uses) {
      // Either coerced on the way out (`!!env.X`) or used as a condition
      // (`env.X ? … : …`). Anything else is the value itself reaching a client.
      const before = body.slice(Math.max(0, use.index! - 2), use.index!);
      const after = body.slice(use.index! + use[0].length, use.index! + use[0].length + 2);
      assert.ok(before === "!!" || after.trimStart().startsWith("?"),
        `emailStatus returns ${secret} without coercing it to a boolean`);
    }
  }
  assert.match(body, /gmailSecretSet: !!env\.GAS_EMAIL_SECRET/);
});

test("the test email goes through the real sender", () => {
  // A test that talks to Resend directly proves Resend works and says nothing
  // about the path the reminders take — which, when GAS_EMAIL_URL is set, is
  // not Resend at all.
  const body = worker.slice(worker.indexOf("async function emailTest"), worker.indexOf("async function emailRetry"));
  assert.match(body, /await email\(env, to,/, "the test has its own sender");
  assert.match(body, /await logEmail\(env, user\.id, "admin_test", result\)/, "the test is not in the audit trail it checks");
  assert.match(body, /isAdmin\(env, user\.id\)/, "anyone can POST to this URL");
});

test("retrying is safe by construction", () => {
  // A failed send never marks itself done, so the queue already holds exactly
  // what has not gone out. The button just stops you waiting for 08:00.
  const body = worker.slice(worker.indexOf("async function emailRetry"), worker.indexOf("async function emailRetry") + 900);
  assert.match(body, /isAdmin\(env, user\.id\)/);
  assert.match(body, /await emailNotifications\(env\)/);
  assert.match(worker, /if \(result\.ok\) completed\.push\(notification\.id\)/,
    "a failed send is being marked as emailed, which would make retry impossible");
});

test("all six email types the spec asks for have a category", () => {
  // Four already existed under different names — a streak reminder is a
  // check-in reminder, a goal milestone is a milestone. Two did not, and
  // email_category is constrained: a producer could not have written one even
  // if it existed, because an unknown value is rejected rather than sent.
  for (const category of ["checkin", "workout", "weekly", "milestone", "recovery", "meal_plan"]) {
    assert.match(migration, new RegExp(`'${category}'`), `no email category for ${category}`);
  }
  assert.match(migration, /when 'recovery' then p\.email_recovery_alerts/);
  assert.match(migration, /when 'meal_plan' then p\.email_meal_plan/);
});

test("every category can be switched off, and the switch is honoured", () => {
  const form = readFileSync(new URL("../components/ProfileForm.tsx", import.meta.url), "utf8");
  for (const [column, label] of [
    ["email_checkin_reminders", "Daily check-in reminder"],
    ["email_workout_reminders", "Workout logging reminder"],
    ["email_weekly_summary", "Weekly training summary"],
    ["email_milestones", "Streaks and goal milestones"],
    ["email_recovery_alerts", "Recovery alerts"],
    ["email_meal_plan", "Weekly meal plan summary"],
  ]) {
    assert.match(form, new RegExp(label), `no switch for ${column}`);
    assert.match(form, new RegExp(`${column}:`), `${column} is shown but never saved`);
    assert.match(migration, new RegExp(`p\\.${column}`), `${column} is saved but never read by the sender`);
  }
});

test("no migration is skipped between 0089 and this one", () => {
  // The screens degrade to "run migration 0095" rather than to an empty table,
  // which only works if the numbering is contiguous enough to name.
  const files = readdirSync(new URL("../supabase/migrations", import.meta.url).pathname)
    .filter((f) => f.endsWith(".sql")).sort();
  const numbers = files.map((f) => Number(f.slice(0, 4)));
  for (let i = 1; i < numbers.length; i++) {
    assert.equal(numbers[i], numbers[i - 1] + 1, `gap between ${files[i - 1]} and ${files[i]}`);
  }
  assert.match(ui, /Run migration 0095/, "the UI does not say what to do when the function is missing");
});

test("the status says which variables the Worker can actually see", () => {
  // "I set RESEND_API_KEY and it still says I haven't" is four problems, not
  // one: added but never deployed, added to a different Worker or a preview
  // environment, a typo in the NAME, or present with an empty value. A boolean
  // per secret cannot tell them apart, and the dashboard shows none of them —
  // so the Worker lists the names it was handed. `env` is a plain object at
  // runtime, which makes this the ground truth rather than a report of what
  // wrangler.toml says.
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const body = worker.slice(worker.indexOf("async function emailStatus"), worker.indexOf("async function emailTest"));
  assert.match(body, /const names = Object\.keys\(vars\)\.filter\(\(k\) => typeof vars\[k\] === "string"\)/);
  assert.match(body, /configuredVars: names\.filter\(\(k\) => \(vars\[k\] as string\)\.trim\(\) !== ""\)/);
  // Present-and-empty is the cause that looks like success from the dashboard,
  // so it is listed separately rather than silently counted as absent.
  assert.match(body, /blankVars: names\.filter\(\(k\) => \(vars\[k\] as string\)\.trim\(\) === ""\)/);
});

test("it reports names and never values", () => {
  // The whole reason this is safe. A name cannot leak a key, and every one of
  // these names is in the repo already; a value would put a live secret in an
  // HTTP response and in the browser's network tab.
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const body = worker.slice(worker.indexOf("async function emailStatus"), worker.indexOf("async function emailTest"));
  assert.ok(!/Object\.entries\(vars\)/.test(body), "emailStatus iterates values");
  assert.ok(!/vars\[k\](?!\s+as string\)\.trim)/.test(body.replace(/typeof vars\[k\]/g, "")),
    "a variable's value is read for something other than emptiness");
});

test("the admin screen shows the names when something is wrong", () => {
  // On a working setup it is a wall of text nobody needs; on a broken one it is
  // the answer. Shown when nothing is configured, or when a variable exists
  // with an empty value.
  const ui = readFileSync(new URL("../components/admin/EmailOps.tsx", import.meta.url), "utf8");
  assert.match(ui, /!status\.configured \|\| \(status\.blankVars \?\? \[\]\)\.length > 0/);
  assert.match(ui, /What this Worker can see/);
  assert.match(ui, /Set but empty:/);
});

test("a reply reaches a mailbox somebody opens", () => {
  // Resend wants a domain of its own — sending from the root alongside a
  // mailbox provider puts two services on one SPF record, which is how mail
  // ends up in spam — so the From address lives on a subdomain that exists
  // only to send. Nobody reads it. Without a reply-to, an athlete who hits
  // reply on a nudge writes to a void and never finds out.
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /function replyAddress\(env: Env\): string/);
  // Both senders, or a reply lands somewhere different depending on which
  // provider happened to be configured.
  assert.match(worker, /reply_to: replyAddress\(env\)/, "Resend sends no reply-to");
  assert.match(worker, /replyTo: replyAddress\(env\)/, "the Apps Script sender sends no reply-to");
  const gas = readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(gas, /if \(body\.replyTo\) options\.replyTo = body\.replyTo;/);
});

test("the reply address falls back to the sender, and is bare", () => {
  // A display name in a reply-to is not an address. Some providers accept
  // "PocketAthlete <x@y.com>" there and some reject the whole send, so the
  // angle brackets come off before it goes anywhere.
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const fn = worker.slice(worker.indexOf("function replyAddress"), worker.indexOf("async function email("));
  assert.match(fn, /env\.REPLY_TO/);
  assert.match(fn, /env\.REMINDER_FROM/, "there is no fallback, so an unset REPLY_TO means no reply-to at all");
  assert.match(fn, /<\(\[\^>\]\+\)>/, "a display name is passed through as if it were an address");
  // Nothing usable means the field is omitted rather than sent empty.
  assert.match(worker, /\.\.\.\(replyAddress\(env\) \? \{ reply_to: replyAddress\(env\) \} : \{\}\)/);
});

test("the status says where a reply would land", () => {
  // "Our emails send" and "somebody sees the answers" are two different claims,
  // and only one of them was on the screen.
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /replyTo: replyAddress\(env\) \|\| null/);
  const ui = readFileSync(new URL("../components/admin/EmailOps.tsx", import.meta.url), "utf8");
  assert.match(ui, /label="Replies go to"/);
});

