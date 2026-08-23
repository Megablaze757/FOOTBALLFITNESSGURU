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
  // COMMENTS STRIPPED FIRST. The rule is about what reaches a client, and a
  // comment reaches nobody — this fired on a note explaining that
  // `env.RESEND_API_KEY` finds nothing when the variable is named with a
  // trailing space, which is documentation of the exact bug the surrounding
  // code exists to catch. A test that cannot tell code from prose makes the
  // prose disappear.
  const body = worker.slice(worker.indexOf("async function emailStatus"), worker.indexOf("async function emailTest"))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const secret of ["GAS_EMAIL_SECRET", "RESEND_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    // Matched on `conf(env, "X")` as well as `env.X`: the email path moved to a
    // tolerant lookup so a name pasted with a trailing space still resolves,
    // and the rule being enforced here — a secret's VALUE never reaches the
    // client — is about what comes back, not about how it was read.
    const uses = [...body.matchAll(new RegExp(`(?:env\\.${secret}|conf\\(env, "${secret}"\\))`, "g"))];
    assert.ok(uses.length > 0, `emailStatus says nothing about ${secret}`);
    for (const use of uses) {
      // Either coerced on the way out (`!!x`) or used as a condition
      // (`x ? … : …`). Anything else is the value itself reaching a client.
      const before = body.slice(Math.max(0, use.index! - 2), use.index!);
      const after = body.slice(use.index! + use[0].length, use.index! + use[0].length + 2);
      assert.ok(before === "!!" || after.trimStart().startsWith("?"),
        `emailStatus returns ${secret} without coercing it to a boolean`);
    }
  }
  assert.match(body, /gmailSecretSet: !!conf\(env, "GAS_EMAIL_SECRET"\)/);
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
  assert.match(fn, /conf\(env, "REPLY_TO"\)/);
  assert.match(fn, /conf\(env, "REMINDER_FROM"\)/, "there is no fallback, so an unset REPLY_TO means no reply-to at all");
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

test("a name that nearly matches is called out, not left in the list", () => {
  // The commonest cause and the hardest to see. RESEND_KEY is not
  // RESEND_API_KEY, it reads correctly in the dashboard, and nobody spots it by
  // scanning fifteen plausible names at midnight. A machine comparing them
  // takes no time, so the machine should be the one to look.
  const ui = readFileSync(new URL("../components/admin/EmailOps.tsx", import.meta.url), "utf8");
  assert.match(ui, /const EMAIL_VARS = \["RESEND_API_KEY", "GAS_EMAIL_URL", "GAS_EMAIL_SECRET"\]/);
  assert.match(ui, /function nearMisses\(names: string\[\] = \[\]\): string\[\]/);
  assert.match(ui, /nearMisses\(status\.configuredVars\)\.length > 0/);
  // Only when nothing is configured — a working setup with a stray RESEND_FOO
  // variable does not need telling off.
  assert.match(ui, /!status\.configured && nearMisses/);
});

test("a name that is not what it looks like is called out", () => {
  /**
   * THE ONE THAT COST AN AFTERNOON. A variable named "RESEND_API_KEY " with a
   * trailing space: Object.keys reports it, so it appears in the list of what
   * the Worker can see and renders identically to the real thing — while
   * env.RESEND_API_KEY finds nothing, because that is a different name.
   *
   * Every screen agreed the variable was there and the code could not see it,
   * and neither statement was wrong. Nothing in the Cloudflare dashboard shows
   * the difference either.
   */
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /oddVars: Object\.keys\(vars\)\.filter\(\(k\) => !\/\^\[A-Za-z\]\[A-Za-z0-9_\]\*\$\/\.test\(k\)\)/);
  const ui = readFileSync(new URL("../components/admin/EmailOps.tsx", import.meta.url), "utf8");
  assert.match(ui, /\(status\.oddVars \?\? \[\]\)\.length > 0/);
  // Quoted, so whitespace has edges. An unquoted name with a trailing space
  // renders exactly like one without.
  assert.match(ui, /&quot;\{n\}&quot;/);
  // Shown whatever else is configured: a stray odd name is worth knowing about
  // even on a Worker that is currently sending fine.
  assert.ok(!/!status\.configured && \(status\.oddVars/.test(ui), "the odd-name warning is gated on failure");
});

test("the odd-name check accepts every name the Worker actually uses", () => {
  // A checker that flags the legitimate names is a checker nobody reads twice.
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const declared = worker.slice(worker.indexOf("interface Env"), worker.indexOf("const CORS"))
    .match(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??:/gm) ?? [];
  assert.ok(declared.length > 10, `only found ${declared.length} env names — has the interface moved?`);
  for (const line of declared) {
    const name = line.trim().replace(/\??:$/, "");
    assert.match(name, /^[A-Za-z][A-Za-z0-9_]*$/, `${name} would be flagged as an odd name`);
  }
});

test("a variable is found even when its name was pasted untidily", () => {
  /**
   * The bug this closes: a secret named "RESEND_API_KEY " with a trailing
   * space. env["RESEND_API_KEY "] is a different property from
   * env.RESEND_API_KEY, so the variable is unmistakably present — the dashboard
   * lists it, Object.keys reports it, it renders identically — and the code
   * sees nothing. Every screen tells the truth and they contradict each other,
   * which leaves nothing to notice.
   *
   * These names are typed into a web form by a person. The lookup should be as
   * forgiving as the person was reasonable.
   */
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /function conf\(env: Env, name: string\): string/);
  const fn = worker.slice(worker.indexOf("function conf(env: Env"), worker.indexOf("* The address a reply should go to"));
  // Exact first, so a correctly named variable never loses to a scan.
  assert.match(fn, /const exact = vars\[name\];/);
  assert.match(fn, /toUpperCase\(\)\.replace\(\/\[\^A-Z0-9\]\/g, ""\)/);
});

test("forgiving the spelling does not forgive a different name", () => {
  // RESEND_KEY is not RESEND_API_KEY spelled untidily, it is a different name.
  // Accepting it would mean nobody ever learns which one the Worker wants.
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  assert.equal(norm("RESEND_API_KEY "), norm("RESEND_API_KEY"));
  assert.equal(norm("resend api key"), norm("RESEND_API_KEY"));
  assert.notEqual(norm("RESEND_KEY"), norm("RESEND_API_KEY"));
  assert.notEqual(norm("RESEND_API"), norm("RESEND_API_KEY"));
});

test("the status and the sender ask the same question", () => {
  // Them disagreeing is what made this unfindable: the status reported no
  // provider while its own variable list showed one, because the two read the
  // environment in different ways.
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const status = worker.slice(worker.indexOf("async function emailStatus"), worker.indexOf("async function emailTest"));
  const senderAt = worker.indexOf("async function email(env: Env");
  const sender = worker.slice(senderAt, worker.indexOf("\nasync function", senderAt + 10));
  for (const body of [status, sender]) {
    assert.match(body, /conf\(env, "RESEND_API_KEY"\)/);
    assert.match(body, /conf\(env, "GAS_EMAIL_URL"\)/);
  }
  // And nothing on the email path reads a raw property any more.
  const code = (sender + status).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/env\.RESEND_API_KEY/.test(code), "the email path still reads env.RESEND_API_KEY directly");
  assert.ok(!/env\.GAS_EMAIL_URL/.test(code), "the email path still reads env.GAS_EMAIL_URL directly");
});

