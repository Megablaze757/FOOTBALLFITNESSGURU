// Generates the VAPID key pair that web push is signed with.
//
// One pair, generated once, then never changed: the public key is baked into
// every browser subscription, so replacing it silently invalidates every
// subscription your users have already granted and they'd all have to opt in
// again.
//
//   node scripts/gen-vapid.mjs
//
// Uses Node's built-in WebCrypto — no dependency needed.
import { webcrypto as crypto } from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

// The public key travels as the uncompressed EC point: 0x04 || X || Y.
const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log(`
VAPID key pair generated. Set these and never regenerate them — a new public
key invalidates every push subscription your users have already granted.

  Public  (safe to publish):
    ${b64url(raw)}

  Private (SECRET — never commit):
    ${jwk.d}

Where each goes:

  1. Cloudflare Worker secrets:
       npx wrangler secret put VAPID_PUBLIC_KEY
       npx wrangler secret put VAPID_PRIVATE_KEY
     (or Workers dashboard → Settings → Variables → Add secret)

  2. Site build, in .env.local AND the GitHub Actions env for the Pages build:
       NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the public key above>

  3. Optionally set VAPID_SUBJECT on the Worker (defaults to
     mailto:info@pocketathlete.com). Push services require a contact address.

The public key must be IDENTICAL in both places. If they differ, browsers
subscribe against one key and the Worker signs with another, and every push is
rejected with 403.
`);
