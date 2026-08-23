import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { formGuide, NO_GUIDE, curatedCount } from "./form-guide";
import { EXERCISES } from "./exercises";
import { IMPORTED_EXERCISES } from "./exercise-catalog";

/**
 * "Remove all images just do the videos."
 *
 * The drawings went first and the licensed artwork went with them. Both were
 * the same bet — that two still frames can teach a movement — and it does not
 * pay: a still cannot show a bar path, a tempo, where the hips go first, or
 * what a rounded back looks like from the side, which is the whole content of
 * "good form". Twelve megabytes of illustration shipped to say less than a
 * thirty-second clip.
 *
 * So there is one visual now and it moves. These tests hold the two promises
 * that replaced the pictures: that a movement with a chosen video plays it in
 * place, and that a movement without one says so instead of dressing a search
 * up as an answer.
 */

test("a staple lift has a chosen video, not a search", () => {
  // These are the lifts where the failure mode is an injury rather than a
  // wasted set, and where the difference between a good demonstration and a bad
  // one is somebody's back.
  for (const lift of ["Barbell back squat", "Barbell deadlift", "Bench press", "Romanian deadlift"]) {
    const guide = formGuide(lift);
    assert.equal(guide?.kind, "video", `${lift} falls back to a search`);
    assert.match(guide!.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
  }
  assert.ok(curatedCount() >= 140, `only ${curatedCount()} curated guides`);
});

test("everything else still has somewhere to go", () => {
  // Hand-picking three hundred videos is a job nobody finishes and a set of
  // links that rots. A search on the exact name cannot 404.
  let missing = 0;
  for (const exercise of EXERCISES) {
    const guide = formGuide(exercise.name);
    if (!guide) { missing += 1; continue; }
    assert.match(guide.url, /^https:\/\//, exercise.name);
    assert.equal(guide.label, "Watch Form Guide", exercise.name);
  }
  assert.equal(missing, 0, `${missing} library exercises have no form guide at all`);
});

test("a search is aimed at a demonstration, not a montage", () => {
  const guide = formGuide("Cossack squat")!;
  assert.equal(guide.kind, "search");
  // The bare name returns workout montages set to music, which demonstrate
  // nothing.
  assert.match(decodeURIComponent(guide.url), /Cossack squat proper form technique/);
});

test("a name too thin to search says so rather than pretending", () => {
  // A YouTube search for "circuit" returns everything, which is the same as
  // returning nothing while looking like it worked.
  for (const name of ["", "   ", "circuit", "session", "warm-up", "ab"]) {
    assert.equal(formGuide(name), null, `"${name}" produced a guide`);
  }
  assert.match(NO_GUIDE, /No video guide available/);
});

test("one component answers \"how does this go?\", and every surface uses it", () => {
  // It used to be answered twice — once by the picture at the top of the sheet
  // and once by a button beside the title — which is how the sheet ended up
  // showing a drawing, a "Watch Form Guide" link and a player all at once.
  const watch = readFileSync(new URL("../components/ExerciseWatch.tsx", import.meta.url), "utf8");
  assert.match(watch, /formGuide\(/, "the shared component does not consult the guide list");
  assert.match(watch, /if \(guide\?\.videoId\) return <FormGuideEmbed/, "a chosen video does not play in place");
  assert.match(watch, /\{NO_GUIDE\}/, "it shows nothing when there is no guide");
  assert.match(watch, /target="_blank"/, "the search does not open away from the app");
  assert.match(watch, /rel="noreferrer"/, "the search leaks the referrer");

  // Every surface that used to draw a figure now goes through it.
  for (const file of ["../components/ExerciseVisual.tsx", "../components/WorkoutPlayer.tsx", "../components/InjuryPlanner.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /<ExerciseWatch/, `${file} lost its way to watch the movement`);
  }
});

test("the pictures are gone, not just hidden", () => {
  /**
   * A component nobody renders is a component somebody re-renders. The whole
   * point of the change was to stop shipping stills, so the test is that the
   * still machinery does not exist rather than that it is currently unused.
   */
  const root = new URL("../", import.meta.url);
  for (const gone of ["components/ExerciseDemo.tsx", "lib/exercise-art.ts", "scripts/build-exercise-art.mjs", "public/exercise-art"]) {
    assert.ok(!existsSync(new URL(gone, root)), `${gone} is still here`);
  }
  for (const file of ["components/ExerciseVisual.tsx", "components/DrillDetail.tsx", "components/ExerciseDetail.tsx", "components/SessionDrills.tsx", "components/DrillChecklist.tsx", "app/(app)/library/page.tsx"]) {
    const src = readFileSync(new URL(file, root), "utf8");
    assert.ok(!/ExerciseDemo|ExerciseSteps|artFor|exercise-art/.test(src), `${file} still draws a figure`);
  }
});

test("a curated link that has rotted is removed, not left promising", () => {
  /**
   * Two of the twelve were dead when this was checked live — "nordic hamstring
   * curl" and "copenhagen plank", both 404. They were also the two on the list
   * where the failure mode is a torn hamstring or a strained groin rather than
   * a wasted set: the most worth curating, and the ones nobody noticed had
   * rotted.
   *
   * Nothing looks wrong from inside the app. The button renders, the link is
   * well-formed, and the apology page belongs to YouTube. So they fall back to
   * a search, which always works, and `scripts/check-form-guides.mjs` makes the
   * next one findable — it prints each title too, because an id that still
   * resolves can point at something else entirely.
   */
  // Both are curated again — with DIFFERENT videos, checked live through the
  // oembed endpoint with the title and channel read back before they were
  // written down. The dead ids are what must never come back.
  for (const name of ["Nordic hamstring curl", "Copenhagen plank"]) {
    assert.equal(formGuide(name)?.kind, "video", `${name} lost its guide`);
  }
  const src = readFileSync(new URL("./form-guide.ts", import.meta.url), "utf8");
  assert.ok(!src.includes("1ge2yiG3fzc") && !src.includes("RS3aDCDwLnQ"), "a dead id is back in the list");
  assert.match(src, /scripts\/check-form-guides\.mjs/, "nothing points at the checker");
});

test("the checker reads the list rather than a copy of it", () => {
  // A checker with its own hardcoded list checks the wrong thing the moment
  // somebody adds a link.
  const script = readFileSync(new URL("../scripts/check-form-guides.mjs", import.meta.url), "utf8");
  assert.match(script, /readFileSync\(new URL\("\.\.\/lib\/form-guide\.ts"/);
  assert.match(script, /indexOf\("const CURATED"\)/);
  assert.match(script, /oembed/);
  // It has to report the title, not just the status: a 200 is not the same as
  // the right video.
  assert.match(script, /\.title/);
  assert.match(script, /process\.exit\(1\)/, "a dead link does not fail the run");
});

test("a movement with no chosen video says so, rather than faking one", () => {
  /**
   * This is the honesty the pictures used to break. A panel styled like a
   * player that turns out to be a YouTube search is worse than a link that
   * admits what it is: the athlete taps expecting a demonstration, gets a
   * results page, and stops trusting the play button that IS real.
   *
   * So the two states are deliberately different shapes — a solid poster with
   * a filled play button against a dashed border with an outlined one.
   */
  const watch = readFileSync(new URL("../components/ExerciseWatch.tsx", import.meta.url), "utf8");
  assert.match(watch, /Find a demonstration/, "the search state does not say what it is");
  assert.match(watch, /opens a YouTube search/, "the search state pretends to be a video");
  assert.match(watch, /border-dashed/, "the search state is dressed as a player");
});

test("the exercises where bad form hurts somebody are taught by a physio", () => {
  // A nordic curl and a Copenhagen plank are prescribed to PREVENT a hamstring
  // tear and a groin strain. A demonstration that gets them wrong does the
  // opposite of the job, which is why these two are the ones worth being fussy
  // about — and why both point at the same rehab channel rather than at
  // whichever video ranked first.
  const src = readFileSync(new URL("./form-guide.ts", import.meta.url), "utf8");
  assert.match(src, /"nordic hamstring curl": "https:\/\/www\.youtube\.com\/watch\?v=_e9vFU9-tkc"/);
  assert.match(src, /"copenhagen plank": "https:\/\/www\.youtube\.com\/watch\?v=YRRnnZsRs9U"/);
  assert.match(src, /E3 Rehab/);
});

test("the curated list grew, and every entry is a well-formed watch url", () => {
  // A hundred and forty-four against the original twelve. The shape is checked
  // here; whether each is still LIVE is scripts/check-form-guides.mjs, because
  // that needs the network and a suite that fails when YouTube hiccups teaches
  // people to ignore red.
  const src = readFileSync(new URL("./form-guide.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const CURATED"), src.indexOf("};", src.indexOf("const CURATED")));
  const urls = [...block.matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length >= 140, `only ${urls.length} curated guides`);
  for (const url of urls) {
    assert.match(url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/, url);
  }
  // No duplicate id under two names by accident — the nordic curl has two keys
  // ON PURPOSE, because the catalogue spells it both ways.
  const keys = [...block.matchAll(/"([^"]+)":\s*"https/g)].map((m) => m[1]);
  assert.equal(keys.length, urls.length, "a key was missed by the duplicate check");
  assert.equal(new Set(keys).size, keys.length, "a name is curated twice");
});

test("a curated guide carries its id, a search does not", () => {
  // There is no iframe for a list of search results, so "all of them as
  // embeds" can only ever mean the curated ones. The id is what tells the two
  // apart in the UI.
  const chosen = formGuide("Bench press");
  assert.equal(chosen?.kind, "video");
  assert.match(chosen!.videoId ?? "", /^[\w-]{11}$/);
  assert.ok(chosen!.url.includes(chosen!.videoId!), "the id is not the one in the url");

  const searched = formGuide("Cone weave dribble");
  assert.equal(searched?.kind, "search");
  assert.equal(searched?.videoId, undefined, "a search was given a video id");
});

test("nothing of YouTube's loads until somebody asks to watch", () => {
  /**
   * An iframe per card costs a third-party document, its scripts and its
   * cookies on every render — before anybody has asked for a video. On a
   * library page of twenty rows that is twenty YouTube sessions loaded to show
   * twenty rectangles.
   *
   * So the poster is ours, including the still: a thumbnail fetched from
   * img.youtube.com would be a request, which is the thing being avoided.
   */
  const embed = readFileSync(new URL("../components/FormGuideEmbed.tsx", import.meta.url), "utf8");
  assert.match(embed, /const \[playing, setPlaying\] = useState\(false\)/);
  assert.match(embed, /if \(playing\) \{/, "the iframe is not behind the tap");
  const idle = embed.slice(embed.indexOf("return (", embed.indexOf("</div>\n    );")));
  assert.ok(!/img\.youtube\.com|i\.ytimg\.com/.test(idle), "the idle poster fetches a thumbnail from YouTube");
  // The domain that does not set a tracking cookie until playback.
  assert.match(embed, /youtube-nocookie\.com/);
  assert.ok(!embed.includes("https://www.youtube.com/embed/"), "the cookie-setting domain is back");
});

test("the embed is a real control, and the video is named", () => {
  const embed = readFileSync(new URL("../components/FormGuideEmbed.tsx", import.meta.url), "utf8");
  assert.match(embed, /aria-label=\{`Play the form guide for \$\{title\}`\}/);
  assert.match(embed, /title=\{`\$\{title\} — form guide`\}/, "the iframe has no title for a screen reader");
  assert.match(embed, /allowFullScreen/);
  assert.match(embed, /tap-target/, "the play control is under the 44px floor");
});

test("the sheet asks once, not three times", () => {
  /**
   * The detail sheet used to carry the question in three places at once: a
   * picture at the top, a "Watch Form Guide" button beside the title, and then
   * the player. Moving the answer into ExerciseWatch is only an improvement if
   * the duplicates actually went, so this checks they did.
   */
  const sheet = readFileSync(new URL("../components/DrillDetail.tsx", import.meta.url), "utf8");
  assert.match(sheet, /<ExerciseVisual muscles=\{how\.muscles\} name=\{how\.name\} \/>/);
  assert.ok(!/formGuide\(|FormGuideEmbed/.test(sheet), "the sheet still answers it a second time itself");

  const card = readFileSync(new URL("../components/ExerciseDetail.tsx", import.meta.url), "utf8");
  assert.ok(!/\{guide\.label\}/.test(card), "the duplicate button beside the title is back");
});


test("most of the gym catalogue plays a video, not a search", () => {
  /**
   * The pictures are gone, so this number is the whole promise. When it was
   * eighteen a search was the normal case and a chosen video was the exception;
   * the removal is only an improvement if that is the other way round.
   */
  const withVideo = IMPORTED_EXERCISES.filter((ex) => formGuide(ex.name)?.videoId).length;
  const share = withVideo / IMPORTED_EXERCISES.length;
  assert.ok(share > 0.5, `only ${withVideo} of ${IMPORTED_EXERCISES.length} movements play in place`);
});

test("the finder refuses on channel, movement and shape — not just on a match", () => {
  /**
   * The gates are the difference between a curated list and the first search
   * result, and every one of them was added because it caught something real:
   *
   *   - the channel gate, because vouching for who is talking is the entire
   *     value of a chosen link over a search;
   *   - the implement gate HARD in both directions, because a title omits the
   *     implement when it is the obvious one — soft matching gave our Dumbbell
   *     Bench Press a barbell demonstration and our Floor Press a dumbbell one;
   *   - the bodyweight gate, because "Squat Jump" and "Dumbbell Jump Squat"
   *     have identical word sets and one of them is loaded;
   *   - the shape gate, because a Short and a ninety-minute podcast are both
   *     the wrong kind of video however right the title is.
   *
   * A future loosening of any of them should have to delete a line here.
   */
  const finder = readFileSync(new URL("../scripts/find-form-guides.mjs", import.meta.url), "utf8");
  assert.match(finder, /TEACHERS\.some\(\(t\) => c\.channel\.toLowerCase\(\)\.includes\(t\)\)/, "any channel will do");
  assert.match(finder, /NOT_A_DEMO\.test\(c\.title\)/, "an assessment or a podcast still counts");
  assert.match(finder, /secs < 40 \|\| secs > 20 \* 60/, "a Short or a podcast still counts");
  assert.match(finder, /FORM\.some\(\(d\) => mineSet\.has\(d\) !== theirs\.has\(d\)\)/, "a word that changes the movement no longer refuses");
  assert.match(finder, /if \(bodyweight && theirKit\.length\) continue;/, "a bodyweight movement can be taught with a weight again");
  // Both directions of the kit rule now live in one helper, so this pins the
  // helper rather than the call: silence from the title is only acceptable when
  // OUR name was silent too.
  assert.match(finder, /if \(!theirKit\.length\) return !stated;/, "a title that names no implement is accepted for a named one");
  assert.match(finder, /return theirKit\.every\(\(k\) => expected\.includes\(k\)\);/, "the implement rule went soft again");
  // A parsed id is not a playing id.
  assert.match(finder, /oembed/, "nothing verifies the id resolves");
});
