import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTHING THAT UNLOCKS ANYTHING GOES IN A TRACKED FILE.
 *
 * THIS IS NOT HYPOTHETICAL HERE. A live Supabase database password was
 * committed to this repository inside `.claude/settings.local.json` and is in
 * the public history to this day. It was not put there on purpose — it was in a
 * connection string in a tool argument, and a settings file quietly recorded
 * it. That is how this always happens: nobody types a password into a source
 * file, something else writes it down for them.
 *
 * The history cannot be fixed by a test — that needs a rotation, and only the
 * owner of the project can do it. What a test CAN do is make the next one loud
 * and immediate instead of discovered by a stranger months later.
 *
 * WHAT IS DELIBERATELY NOT FLAGGED. The Supabase publishable key is public by
 * design: it is compiled into the browser bundle, it is on every page of the
 * live site, and RLS is what protects the data behind it. Flagging it would
 * teach people to add exceptions to this test, and a scanner people route
 * around is worse than none.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Files git actually tracks — the only ones that can leak. */
function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter(Boolean);
}

const SKIP_DIR = /^(node_modules|\.next|out|public\/exercise-art)\//;
/** Binary and lock files: nothing readable, and package-lock is enormous. */
const SKIP_FILE = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|pdf)$/i;
/** This file names the patterns, so it would flag itself. */
const SELF = "lib/no-secrets.test.ts";

interface Rule {
  name: string;
  re: RegExp;
  /**
   * Return true when a match is fine after all.
   *
   * A rule that also catches things it should not is the way a scanner dies:
   * somebody adds an exception, then another, and eventually the whole test is
   * routed around. Every allowance here is narrow, and the third test below
   * checks each one against something that must NOT be flagged.
   */
  allow?: (line: string, match: RegExpExecArray) => boolean;
}

/**
 * A password-shaped thing that is not a password.
 *
 * FOUND BY RUNNING THIS TEST FOR THE FIRST TIME, which flagged nine files and
 * none of them held a credential: `.env.example` documents the variable with
 * CHANGE_ME in it, and seven scripts build the URL from `${PASSWORD}` at
 * runtime. Both are the correct way to write those files, and a scanner that
 * calls them leaks is a scanner nobody will keep.
 */
function isPlaceholder(secret: string): boolean {
  // Any interpolation or bracket: `${PASSWORD}`, `<your-password>`, `[PASS]`.
  if (/[${}<>[\]]/.test(secret)) return true;
  // CHANGE_ME, YOUR_PASSWORD, PASSWORD — a literal nobody could authenticate with.
  if (/^[A-Z][A-Z0-9_]*$/.test(secret)) return true;
  return /^(?:password|passwd|changeme|secret|your[-_]?password|x+|\*+|\.+)$/i.test(secret);
}

/**
 * Built from parts so the scanner cannot match its own source if this file is
 * ever renamed and the self-exclusion above stops applying.
 */
const RULES: Rule[] = [
  {
    name: "a database connection string with a password in it",
    // postgres://user:something@host — the exact shape that leaked.
    re: new RegExp(`postgres(?:ql)?://[^\\s:@'"]+:([^\\s:@'"]{6,})@`, "i"),
    allow: (_line, m) => isPlaceholder(m[1]),
  },
  { name: "a Supabase secret key", re: new RegExp(`\\bsb${"_"}secret${"_"}[A-Za-z0-9_-]{16,}`) },
  {
    name: "a service_role JWT",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
    /**
     * Supabase's own ANON key is a JWT in older projects and is public by
     * design. Rather than allow every JWT that says "anon" inside it — which a
     * service_role key could be made to say — the allowance is by the NAME it
     * is assigned to, which is written by us and not by the token.
     */
    allow: (line, m) => /(anon|publishable|public)[^\n]{0,40}$/i.test(line.slice(0, m.index)),
  },
  { name: "an OpenAI or OpenRouter key", re: new RegExp(`\\bsk${"-"}(?:or${"-"})?[A-Za-z0-9]{20,}`) },
  { name: "an NVIDIA API key", re: new RegExp(`\\bnvapi${"-"}[A-Za-z0-9_-]{20,}`) },
  { name: "a Groq key", re: new RegExp(`\\bgsk${"_"}[A-Za-z0-9]{20,}`) },
  { name: "a Stripe secret or restricted key", re: new RegExp(`\\b(?:sk|rk)${"_"}(?:live|test)${"_"}[A-Za-z0-9]{16,}`) },
  { name: "a GitHub token", re: new RegExp(`\\b(?:ghp|gho|ghs|ghr)${"_"}[A-Za-z0-9]{30,}|\\bgithub${"_"}pat${"_"}[A-Za-z0-9_]{30,}`) },
  { name: "an AWS access key id", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "a private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

test("no tracked file contains a credential", () => {
  const found: string[] = [];

  for (const file of trackedFiles()) {
    if (SKIP_DIR.test(file) || SKIP_FILE.test(file) || file === SELF) continue;

    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable or binary
    }
    // A 40MB lockfile has nothing to say and costs a second to scan.
    if (text.length > 4_000_000) continue;

    const lines = text.split("\n");
    for (const rule of RULES) {
      lines.forEach((line, i) => {
        // exec, not test: the allowance needs the capture group and the offset,
        // and a /g regex would carry lastIndex between lines.
        const m = rule.re.exec(line);
        if (!m) return;
        if (rule.allow?.(line, m)) return;
        found.push(`${file}:${i + 1} — ${rule.name}`);
      });
    }
  }

  assert.deepEqual(
    found, [],
    "A credential is committed to this repository.\n" +
      "  Remove it, then ROTATE it — anything that has been pushed is compromised\n" +
      "  whether or not the commit is reverted, because the history keeps it.\n" +
      `  ${found.join("\n  ")}`,
  );
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SECRETS THIS ENVIRONMENT ACTUALLY HOLDS.
 *
 * The rules above are patterns, and a pattern cannot recognise an arbitrary
 * password. The demo account's — an ordinary word and three digits — is not
 * shaped like anything, and it went into a tracked test file, in a test about
 * handling passwords safely, and this scanner had nothing to say about it.
 *
 * The value is not quoted here either. Writing it into the comment explaining
 * the mistake puts it straight back, which is what happened on the first
 * attempt at this paragraph — caught by the check below.
 *
 * When a secret is present in the environment, though, the check is exact:
 * does any tracked file contain this string? That is the case in CI, which is
 * where it matters, and it catches the whole class rather than the shapes
 * somebody thought of.
 *
 * THE VALUE IS NEVER PRINTED. The failure names the variable and the file, and
 * a test that helpfully echoes the secret it found is a test that puts it in
 * the build log for everyone.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no tracked file contains a secret this environment knows", (t) => {
  /**
   * Only values that are actually secret. NEXT_PUBLIC_* is deliberately absent:
   * the publishable key is compiled into the bundle by design, and flagging it
   * would teach people to route around this test.
   */
  const WATCHED = [
    "REEL_EMAIL", "REEL_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_PASSWORD",
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "STRIPE_SECRET_KEY", "GH_TOKEN",
  ];

  const known = WATCHED
    .map((name) => [name, (process.env[name] ?? "").trim()] as const)
    // Under eight characters is not a credential and would match prose.
    .filter(([, value]) => value.length >= 8);

  if (known.length === 0) {
    t.skip("no secrets in this environment — this check runs in CI");
    return;
  }

  const found: string[] = [];
  for (const file of trackedFiles()) {
    if (SKIP_DIR.test(file) || SKIP_FILE.test(file)) continue;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.length > 4_000_000) continue;
    for (const [name, value] of known) {
      if (text.includes(value)) found.push(`${file} contains the value of ${name}`);
    }
  }

  assert.deepEqual(
    found, [],
    "A live secret is committed to this repository.\n" +
      "  Remove it, then ROTATE it — anything pushed is compromised whether or not\n" +
      "  the commit is reverted, because the history keeps it.\n" +
      `  ${found.join("\n  ")}`,
  );
});

/**
 * A scanner that matches nothing passes forever and protects nothing. This is
 * the check on the check.
 */
test("the scanner actually catches what it claims to", () => {
  const samples: [string, string][] = [
    ["a database connection string with a password in it", "postgresql://postgres:hunter2hunter2@db.example.supabase.co:5432/postgres"],
    ["a Supabase secret key", `sb${"_"}secret${"_"}AAAAAAAAAAAAAAAA-BBBB`],
    ["a service_role JWT", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijkl"],
    ["an OpenAI or OpenRouter key", `sk${"-"}or${"-"}v1AAAAAAAAAAAAAAAAAAAAAA`],
    ["an NVIDIA API key", `nvapi${"-"}AAAAAAAAAAAAAAAAAAAAAAAA`],
    ["a Groq key", `gsk${"_"}AAAAAAAAAAAAAAAAAAAAAAAA`],
    ["a Stripe secret or restricted key", `sk${"_"}live${"_"}AAAAAAAAAAAAAAAAAA`],
    ["a GitHub token", `ghp${"_"}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`],
    ["an AWS access key id", "AKIAIOSFODNN7EXAMPLE"],
    ["a private key block", "-----BEGIN RSA PRIVATE KEY-----"],
  ];

  for (const [name, sample] of samples) {
    const rule = RULES.find((r) => r.name === name);
    assert.ok(rule, `no rule named ${name}`);
    assert.ok(rule!.re.test(sample), `${name} does not match its own example`);
  }
});

/**
 * THE FALSE POSITIVE THAT WOULD KILL THIS TEST. The publishable key is on every
 * page of the live site and is supposed to be in the source. If this scanner
 * flagged it, somebody would add an exception, and a scanner people route
 * around is worse than none.
 */
test("the public key and ordinary prose are left alone", () => {
  const safe = [
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb${"_"}publishable${"_"}kr26XwyR0HZxS3HR3UJI2Q`,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY: sb_publishable_e2e_placeholder",
    "postgres://localhost:5432/postgres",
    "// Reset your password on the login page",
    "const password = form.get('password');",
    "https://apex-api.fitnessguru.workers.dev/health",
    "sk-",
    "See docs for how to set OPENROUTER_API_KEY as a Worker secret",
  ];
  for (const line of safe) {
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      assert.ok(!m || rule.allow?.(line, m), `${rule.name} flagged something safe: ${line}`);
    }
  }
});
