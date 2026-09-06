import { test } from "node:test";
import assert from "node:assert/strict";
import { canSaveToPhotos, saveVideo, type SaveDeps } from "./save-video";

const blob = { size: 10, type: "video/mp4" } as unknown as Blob;
const asFile = (b: Blob, n: string) => ({ name: n, type: "video/mp4", blob: b }) as unknown as File;

function deps(over: Partial<SaveDeps> = {}, log: string[] = []): SaveDeps {
  return {
    fetch: async () => ({ ok: true, status: 200, blob: async () => blob }),
    nav: {},
    file: asFile,
    download: () => log.push("downloaded"),
    ...over,
  };
}

/**
 * Every desktop browser with a share button reports `share`, and most refuse
 * files. Checking only for `share` sends the video to a sheet that drops it.
 */
test("a share sheet that cannot take files does not count", () => {
  const probe = asFile(blob, "a.mp4");
  assert.equal(canSaveToPhotos({}, probe), false, "no share at all");
  assert.equal(canSaveToPhotos({ share: async () => {} }, probe), false, "share without canShare");
  assert.equal(
    canSaveToPhotos({ share: async () => {}, canShare: () => false }, probe), false,
    "canShare said no and it was ignored",
  );
  assert.equal(canSaveToPhotos({ share: async () => {}, canShare: () => true }, probe), true);
  // A canShare that throws is a no, not a crash.
  assert.equal(
    canSaveToPhotos({ share: async () => {}, canShare: () => { throw new Error("nope"); } }, probe),
    false,
  );
});

test("on a phone it opens the share sheet, which is where Save Video lives", async () => {
  const shared: unknown[] = [];
  const out = await saveVideo("https://x/reel.mp4", "reel.mp4", deps({
    nav: { canShare: () => true, share: async (d) => { shared.push(d); } },
  }));
  assert.deepEqual(out, { ok: true, how: "shared" });
  assert.equal((shared[0] as { files: File[] }).files.length, 1);
});

/**
 * Dismissing the sheet rejects with AbortError. That is somebody saying "not
 * now" — reporting it as a failure puts an error under a button they backed
 * out of deliberately.
 */
test("backing out of the share sheet is not an error", async () => {
  for (const name of ["AbortError", "NotAllowedError"]) {
    const err = new Error("dismissed"); err.name = name;
    const log: string[] = [];
    const out = await saveVideo("https://x/r.mp4", "r.mp4", deps({
      nav: { canShare: () => true, share: async () => { throw err; } },
    }, log));
    assert.deepEqual(out, { ok: false, how: "cancelled" }, name);
    assert.deepEqual(log, [], `${name} fell through to a download nobody asked for`);
  }
});

test("a share that breaks for any other reason still saves the file", async () => {
  const log: string[] = [];
  const out = await saveVideo("https://x/r.mp4", "r.mp4", deps({
    nav: { canShare: () => true, share: async () => { throw new Error("kaput"); } },
  }, log));
  assert.deepEqual(out, { ok: true, how: "downloaded" });
  assert.deepEqual(log, ["downloaded"]);
});

test("with no share sheet it downloads", async () => {
  const log: string[] = [];
  const out = await saveVideo("https://x/r.mp4", "r.mp4", deps({}, log));
  assert.deepEqual(out, { ok: true, how: "downloaded" });
  assert.deepEqual(log, ["downloaded"]);
});

/**
 * The panel signs for an hour and a reel sits open in a tab for longer than
 * that all the time, so this is the likeliest failure by a distance — and
 * "HTTP 400" tells nobody to reload the page.
 */
test("an expired link says to reload rather than showing a status code", async () => {
  for (const status of [400, 403]) {
    const out = await saveVideo("https://x/r.mp4", "r.mp4", deps({
      fetch: async () => ({ ok: false, status, blob: async () => blob }),
    }));
    assert.equal(out.ok, false);
    assert.match((out as { why: string }).why, /expired/i, String(status));
    assert.match((out as { why: string }).why, /reload/i, String(status));
  }
});

test("another fetch failure reports its status, not a guess", async () => {
  const out = await saveVideo("https://x/r.mp4", "r.mp4", deps({
    fetch: async () => ({ ok: false, status: 500, blob: async () => blob }),
  }));
  assert.equal(out.ok, false);
  assert.match((out as { why: string }).why, /500/);
  assert.doesNotMatch((out as { why: string }).why, /expired/i);
});

test("a network error is reported rather than thrown at the caller", async () => {
  const out = await saveVideo("https://x/r.mp4", "r.mp4", deps({
    fetch: async () => { throw new Error("offline"); },
  }));
  assert.deepEqual(out, { ok: false, how: "failed", why: "offline" });
});
