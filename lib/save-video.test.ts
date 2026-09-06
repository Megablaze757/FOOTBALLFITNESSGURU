import { test } from "node:test";
import assert from "node:assert/strict";
import { canSaveToPhotos, saveAll, saveVideo, type SaveDeps } from "./save-video";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A WHOLE CAROUSEL IN ONE TAP.
 *
 * Saving five slides one at a time means five taps through five share sheets,
 * in the right order, without losing count — worse than the zip from GitHub
 * the dashboard exists to replace. navigator.share takes an array, and iOS
 * offers "Save 5 Images" for one.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const slides = [1, 2, 3, 4, 5].map((n) => ({ url: `https://x/s${n}.png`, name: `s${n}.png` }));

test("five slides go to the camera roll in one share", async () => {
  const shared: File[][] = [];
  const out = await saveAll(slides, deps({
    nav: { canShare: () => true, share: async (d) => { shared.push(d.files ?? []); } },
  }));
  assert.deepEqual(out, { ok: true, how: "shared" });
  assert.equal(shared.length, 1, `${shared.length} share sheets for one post`);
  assert.deepEqual(shared[0].map((f) => f.name), ["s1.png", "s2.png", "s3.png", "s4.png", "s5.png"],
    "the slides reached the share sheet out of order");
});

/**
 * A browser can accept one file and refuse five — there are per-share size and
 * count limits — and finding that out from a rejected share means the person
 * has already tapped.
 */
test("canShare is asked about the whole set, not one file", async () => {
  const asked: number[] = [];
  const log: string[] = [];
  const out = await saveAll(slides, deps({
    nav: {
      canShare: (d) => { asked.push(d.files?.length ?? 0); return false; },
      share: async () => { throw new Error("should not be called"); },
    },
  }, log));
  assert.deepEqual(asked, [5], "canShare was asked about a single file, or not at all");
  assert.deepEqual(out, { ok: true, how: "downloaded" });
  assert.equal(log.length, 5, "the fallback did not save every slide");
});

test("backing out of a carousel share is not an error", async () => {
  const err = new Error("dismissed"); err.name = "AbortError";
  const log: string[] = [];
  const out = await saveAll(slides, deps({
    nav: { canShare: () => true, share: async () => { throw err; } },
  }, log));
  assert.deepEqual(out, { ok: false, how: "cancelled" });
  assert.deepEqual(log, [], "a cancelled share fell through to five downloads nobody asked for");
});

test("one slide takes the single-file path", async () => {
  const shared: unknown[] = [];
  const out = await saveAll([slides[0]], deps({
    nav: { canShare: () => true, share: async (d) => { shared.push(d); } },
  }));
  assert.deepEqual(out, { ok: true, how: "shared" });
  assert.equal((shared[0] as { files: File[] }).files.length, 1);
});

test("an expired link stops the whole set rather than saving half of it", async () => {
  let n = 0;
  const log: string[] = [];
  const out = await saveAll(slides, deps({
    fetch: async () => {
      n += 1;
      return { ok: n < 3, status: n < 3 ? 200 : 400, blob: async () => blob };
    },
  }, log));
  assert.equal(out.ok, false);
  assert.match((out as { why: string }).why, /expired/i);
  assert.deepEqual(log, [], "half a carousel was saved to the camera roll");
});

test("nothing to save says so", async () => {
  const out = await saveAll([], deps());
  assert.equal(out.ok, false);
});
