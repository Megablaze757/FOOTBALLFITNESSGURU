// =============================================================================
// A REEL THAT IS A SCREEN RECORDING WITH A VOICE OVER IT.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE REELS WERE SLIDESHOWS, AND SLIDESHOWS DO NOT GET WATCHED.
//
// lib/reel.ts draws SVG cards onto a canvas and records the canvas. Every frame
// is generated, every figure is real, and the result is text sliding over a
// gradient — which is the format people scroll past fastest, because there is
// nothing to look at that could not have been a screenshot.
//
// The thing worth filming is the app. A readiness score dropping after a bad
// night, a shopping list pricing itself, a program rebuilding around a missed
// session: those are moving pictures of something happening, and no card can
// stand in for them.
//
// So this produces a SHOT LIST rather than frames: which screen, what to do on
// it, how long to stay, and the line to say over it. The recording is the real
// app, captured from the real screen; this is the thing that makes the capture
// worth starting.
//
// ─────────────────────────────────────────────────────────────────────────
// A BEAT MUST LAST LONGER THAN ITS LINE TAKES TO SAY.
//
// The one rule that decides whether it is watchable. A four-second shot with
// nine seconds of narration over it is either a voice racing a picture or a cut
// that lands mid-word, and both read as amateur immediately. Every beat's
// duration is therefore derived FROM its line — see holdFor in lib/reel.ts,
// which already knows how long words take — rather than chosen and hoped for.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { beatFloorMs } from "./caption-lines";
import { movesMs, type Move } from "./reel-moves";
import { holdFor, speechMs, spokenWords, MIN_SCENE_MS, MAX_REEL_MS, MS_PER_WORD } from "./reel";
import { SUSPENSE_MS } from "./narration";
import { hookText, HOOK_MAX_WORDS } from "./reel-kinds";
import { END_CARD_MS } from "./reel-plan";
import { SIGNUP_SPOKEN } from "./signup-link";
import { SKILL_DRILLS } from "./skills";
import { indexFacts, money, REFERENCE_PROTEIN } from "./protein-index";
import { standardPages } from "./standards-page";
import { rankLift } from "./strength-standards";
import { cardById, cardProblems, CARD_STAGES, type ContentCard } from "./content-cards";
import { sportLabel } from "./seo";
import type { SportId } from "./exercises";

export interface Beat {
  /** Milliseconds from the start of the recording. */
  at: number;
  ms: number;
  /**
   * The route to be on. Same-origin, so the recorder can drive it — but the
   * person is filming their own screen, so this is a cue as much as a command.
   */
  route: string;
  /** What to do once you are there, in the imperative. */
  action: string;
  /** The line to say over it. Empty means let the screen speak. */
  say: string;
  /**
   * Silence before this beat speaks, in milliseconds.
   *
   * "No pausing for suspense." The gaps in lib/speech-timing.ts sit BETWEEN
   * phrases of one beat, and the pause a reel actually needs is at a beat
   * boundary — the moment the shot changes to the thing being revealed. Set
   * this on the reveal and nowhere else: a reel that pauses everywhere drags.
   */
  hold?: number;
  /**
   * Words visible on screen that this beat is about.
   *
   * "The app demo isn't clear what's what." The reel shows a whole app screen
   * while the voice talks about one part of it, and nothing says which. Set
   * this and the recorder dims the rest and rings that element.
   *
   * TEXT, NOT A SELECTOR: a selector is a promise about markup this file does
   * not own and breaks silently the next time a class is renamed. The words on
   * screen are the words the script is already talking about.
   */
  focus?: string;
  /**
   * Silence AFTER this beat's line, in milliseconds.
   *
   * `hold` is the pause before a reveal; this is the room the END CARD needs.
   * lib/reel-plan.ts draws "Sign up for free today" over the tail of the last
   * beat and refuses to draw it over a caption — so a last beat that speaks
   * right up to its own end gets a card for zero milliseconds and loses the
   * only frame in the reel that asks for anything. Found by reading endCardAt
   * next to a script that had just been given a spoken sign-off.
   */
  tail?: number;
  /**
   * What to DO on this screen while the line plays.
   *
   * The `action` above is prose for a person holding a phone; this is the
   * same instruction the recorder can carry out. A beat with moves fills the
   * form on camera instead of arriving at a filled one — see lib/reel-moves.ts
   * for why that is the whole point of filming an app at all.
   */
  moves?: Move[];
}

export interface ReelScript {
  id: string;
  /** The first two seconds, which decide whether the rest is watched. */
  hook: string;
  beats: Beat[];
  totalMs: number;
  /** Words to be spoken, for a read-time estimate before recording. */
  words: number;
}

/**
 * The hook has to be on screen and said before anybody has decided to leave.
 *
 * Two seconds is the number that gets quoted and it is roughly right; what
 * matters here is that it is enforced rather than intended, because a hook that
 * arrives at 00:04 is a reel with no hook.
 */
export const HOOK_BY_MS = 2_000;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW LONG AN AUTHENTICATED PAGE IS BLACK AFTER THE RECORDER NAVIGATES TO IT.
 *
 * The recorder warms every route before recording, which caches the bundle and
 * does nothing for the data: an authenticated screen re-fetches on mount and
 * renders from nothing, and the recorder navigates with `waitUntil: "load"`,
 * which on a Next.js SPA fires while the document is still empty.
 *
 * The beat's clock is the audio track, and the audio track cannot wait — so
 * the only thing that can move is the LINE. A beat that lands on a heavy route
 * holds this long before it speaks, and says nothing over a loading spinner.
 *
 * MEASURED BY STEPPING FRAMES, twice, because the first guess was half of it.
 * /benchmarks navigated at 11.71s and did not paint until 13.8s. Light routes
 * are much faster — /home was up well inside SUSPENSE_MS, so this is not a
 * blanket tax on every navigation, only on the ones that fetch.
 *
 * Nothing enforces this: a beat that needs it and does not have it records a
 * black screen and passes every check in the pipeline, which is exactly how it
 * shipped. Downloading the file and looking at it is the check.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const DATA_ROUTE_PAINT_MS = 2_300;

/** A shot nobody can read. Shorter than this and the eye has not landed yet. */
export const MIN_BEAT_MS = MIN_SCENE_MS;

/**
 * Turn lines into timed beats.
 *
 * Each beat lasts the longer of: how long its line takes to say, and how long
 * the eye needs on a screen it has not seen before. Absent a line, the second
 * one is all there is.
 */
function time(beats: Omit<Beat, "at" | "ms">[]): Beat[] {
  let at = 0;
  return beats.map((b) => {
    /**
     * The SAME floor the recorder applies (lib/narration.ts retime): a beat
     * lasts at least as long as its captions take to read. Without it here,
     * the teleprompter and the retention check disagree with the finished
     * reel about how long every shot is — and the studio is where a script
     * gets judged before anybody spends three minutes filming it.
     */
    // speechMs, not holdFor: this beat is SPOKEN. holdFor is the reading time
    // for a text card, and using it here under-estimated every reel by a fifth.
    const ms = (b.hold ?? 0)
      + (b.tail ?? 0)
      + movesMs(b.moves)
      + Math.max(MIN_BEAT_MS, b.say ? Math.max(speechMs(b.say), beatFloorMs(b.say)) : 0);
    const beat = { ...b, at, ms };
    at += ms;
    return beat;
  });
}

function build(id: string, hook: string, raw: Omit<Beat, "at" | "ms">[]): ReelScript {
  const beats = time(raw);
  return {
    id,
    hook: hookText(hook),
    beats,
    totalMs: beats.reduce((n, b) => n + b.ms, 0),
    words: beats.reduce((n, b) => n + (b.say ? spokenWords(b.say) : 0), 0),
  };
}

/**
 * READINESS IS THE ONE TO FILM.
 *
 * It is the only screen in the app where a number changes because of something
 * that happened to you, and watching it move is the entire pitch. Every other
 * demo is a list that could have been a screenshot.
 */
function readinessScript(): ReelScript {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE FIRST LINE SPOKEN IS THE CLAIM, NOT THE RUN-UP TO IT.
   *
   * This opened on "Every training app gives you the session it planned last
   * week" — true, and a preamble. The measured rule is that the spoken hook
   * has to land inside about 1.5 seconds and the whole hook stack by 3; this
   * reel made its claim at ten. 71% of viewers have decided by then.
   *
   * The shape that survives is a MISTAKE WARNING: name the thing the viewer
   * is already doing wrong, in the second person, before any context.
   * ═══════════════════════════════════════════════════════════════════════
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * WRITTEN PROSE IS NOT SPOKEN ENGLISH, AND EVERY LINE HERE WAS WRITTEN.
   *
   * "Bad night? Your app doesn't care." is a fine hook and the reel behind it
   * read like an essay: full sentences, no contractions, a subject and a verb
   * every time, and the first line REPEATING the hook's own "three hours'
   * sleep" before the second line said it a third time. Read aloud it is a
   * man describing software. That is the whole of "the scripts feel awkward".
   *
   * What replaces it is the same claim in the shape people actually talk in:
   * a named antagonist ("every training app you own"), fragments where the
   * pictures are doing the work, contractions throughout, and one callback —
   * "last Sunday" in the first line, paid off in the reveal.
   * ═══════════════════════════════════════════════════════════════════════
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CORRECT, CLEAR, AND NOBODY IS TALKING.
   *
   * "Scripts still don't feel human or hooking or humorous." Fourth pass, and
   * the previous three were all the same kind of edit — tightening wording,
   * fixing references, removing repetition. Every one of those made the lines
   * BETTER COPY. None of them put a person behind the microphone.
   *
   * Read the old version aloud: "Every other training app hands you the
   * session it planned on Sunday." That is a true, well-formed sentence with
   * no attitude in it at all — a brochure. There is nothing to laugh at
   * because there is nobody there.
   *
   * What this changes is the register, not the facts. A joke in short form is
   * a setup and a turn, and the turn is usually understatement: "Out of a
   * hundred. It's not impressed." The app gets an opinion, which is both
   * funnier and more accurate than narrating its output.
   * ═══════════════════════════════════════════════════════════════════════
   */
  return build("demo-readiness", "Slept three hours? Your app's booked you in for squats.", [
    {
      route: "/journal",
      action: "Open the check-in. Do not fill it in yet — let the empty form show.",
      /**
       * THE HOOK'S OWN WORDS ARE NOT AVAILABLE TO THE FIRST LINE.
       *
       * This said "Three hours' sleep, and your app still hands you..." over a
       * hook card reading "You slept three hours" — the same fact twice inside
       * four seconds, and then a third time in the beat below. The first line
       * has to ADD, so it names the thing the hook is accusing.
       */
      /**
       * ═══════════════════════════════════════════════════════════════════
       * THE SUBJECT IS NAMED HERE, AND THAT IS THE WHOLE FIX.
       *
       * "Script is incoherent." Read the old one aloud as one block and the
       * fault is every demonstrative in it: "THIS ONE asks first" — this one
       * WHAT? — then "THAT's today's body talking", pointing at a number the
       * voice never names, then "SO today's session got rebuilt", a
       * consequence of a cause the listener was never given. The app itself
       * was named once, in the last two seconds.
       *
       * A pronoun needs an antecedent. Naming PocketAthlete in the first
       * spoken line gives every "it" in the four lines after it something to
       * refer to, and turns a list of disconnected claims into one sentence
       * about one thing — which is what the short-form guidance means by one
       * idea per video.
       * ═══════════════════════════════════════════════════════════════════
       */
      /**
       * ═══════════════════════════════════════════════════════════════════
       * EVERY LINE WAS AN ISLAND. "Scripts don't flow nice."
       *
       * The last pass gave them a point of view and they still read as five
       * separate statements, because nothing in one line reached into the
       * next. Read the old set aloud and every line starts from a standing
       * start: "PocketAthlete is the only one that asks..." / "Two taps..." /
       * "Out of a hundred..." / "So today's session changed..."
       *
       * Two things were missing and both are ordinary spoken English. The
       * CONNECTIVES — so, and, which is why — that hand one thought to the
       * next; I had stripped them out for brevity, which is what made it
       * staccato. And VARIED LENGTH: five lines of roughly equal weight is a
       * metronome, and a metronome is the opposite of flow.
       *
       * The lines now chain — "decided your week on Sunday" answered by "asks
       * first", then "So —", then "And", then "Which is why" — and run long,
       * short, short, medium, short.
       * ═══════════════════════════════════════════════════════════════════
       */
      say: "Every other app decided your week on Sunday. PocketAthlete asks first.",
    },
    {
      route: "/journal",
      action: "Log a bad night: sleep 2, fatigue 9, then submit.",
      /**
       * ═══════════════════════════════════════════════════════════════════
       * THE SHOT THAT DOES SOMETHING.
       *
       * This beat used to say "this one asks first" over a form nobody
       * touched, and the next beat arrived at a finished score. The claim of
       * the whole reel is that a number moves because of something that
       * happened to you, and the reel was asserting it rather than showing
       * it — which is the same failure as a slideshow, with better narration.
       *
       * The check-in is filled on camera now, and the score on the next beat
       * is the one this input produced. See lib/reel-moves.ts.
       *
       * TAPS, BECAUSE THE QUICK CHECK-IN HAS NO SLIDERS. The first version
       * typed into "Sleep quality" and "Fatigue" — the labels on the DETAILED
       * view's sliders. The quick view somebody actually lands on is a row of
       * emoji buttons, so there was no input to type into and both moves
       * missed. The recorder said so twice in the run log and filmed a form
       * nobody had touched anyway; it refuses to now.
       * ═══════════════════════════════════════════════════════════════════
       */
      moves: [
        /**
         * The reel writes to the account it films, so the second run onward
         * lands on "✓ Checked in today" with the tap-scale replaced by this
         * button. Optional because on a clean account it is not there.
         */
        { tap: "Change my answers", optional: true },
        { tap: "Barely" },
        { tap: "Wrecked" },
        /**
         * "Save today's log", NOT "Log it".
         *
         * "Log it →" is on screen, is a button, and is happily tappable — and
         * it belongs to the "Trained today?" row, whose onClick opens the
         * training section. So the tap succeeded, the recorder reported three
         * clean moves, and the check-in was never submitted: /home still said
         * "Days since your last log: 20" under a caption saying "that is what
         * it thinks of you today".
         *
         * A text target cannot catch that on its own — the words existed and
         * the control worked. Only the OUTCOME can, which is why the beat
         * below now requires the gauge to be on screen.
         */
        { tap: "Save today's log" },
      ],
      /**
       * FRAGMENTS, BECAUSE THE PICTURE IS DOING THE SENTENCE.
       *
       * "Watch. Three hours' sleep, legs wrecked, and it takes sixty seconds
       * to say so" is one clause too many and says the sleep figure for the
       * third time in twelve seconds. The taps happen on camera underneath
       * this line, so the line only has to name them as they land.
       */
      // "So —" picks up the line before it instead of starting again.
      say: "So — slept badly, legs like concrete. Two taps.",
    },
    {
      route: "/home",
      action: "Show the readiness score. Let it sit — the number is the point.",
      focus: "Readiness",
      /**
       * THE REVEAL, and the reason the beat before it withholds the number.
       * The old version said "the score is worked out on the phone" over the
       * score itself — narrating a thing the viewer can already see.
       */
      hold: SUSPENSE_MS,
      /**
       * THE NUMBER IS NOT SPOKEN, AND THAT IS DELIBERATE NOW.
       *
       * This said "Fifty-four out of a hundred" — a figure typed into a
       * script, while the beat before it now actually logs a bad night and
       * the app computes its own answer. The two would agree only by
       * coincidence, and the first time the scoring changed the reel would
       * confidently read out a number that was not on screen.
       *
       * The spotlight is already pointing at it. A voice reading out a figure
       * the viewer can see is narration of a screenshot; letting the screen
       * deliver it is the reveal the suspense pause was put there for.
       */
      // The number is on screen and the ring is around it, so the line does
      // not read it out — it reacts to it, which is the joke and is also the
      // only version that cannot be wrong when the scoring changes.
      say: "And there's your score. Brutal, but fair.",
    },
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * THE BEAT THAT CLAIMED THE SESSION CHANGED, OVER A SCREEN WITHOUT ONE.
     *
     * This was on /home with no focus, saying "the sets themselves got
     * lighter". Extracted the frame: the readiness gauge again, the coach
     * card, and "WORTH A LOOK — more the app can do". The session was not on
     * the screen at any point in the beat.
     *
     * A beat with no `focus` is a beat with nothing checking that the shot
     * matches the line — which is the fault the focus guard was built for and
     * cannot catch when a script declines to declare one. Every beat that
     * makes a claim about a specific thing on screen should name it.
     *
     * /coach, because that is where lib/session-why.ts renders and it is the
     * app SAYING it, in its own words, rather than the reel asserting it: on
     * a red day the line reads "Today's log said recover, so this is not the
     * session the block prescribed."
     * ═══════════════════════════════════════════════════════════════════════
     */
    {
      route: "/coach",
      action: "Today's session, with the app's own reason for changing it.",
      focus: "not the session the block prescribed",
      say: "Which is why today's session changed. Not a warning — lighter sets.",
    },
    /**
     * THE ONLY BEAT THAT ASKS FOR ANYTHING, AND IT USED TO BE SILENT.
     *
     * "Free, on your phone" was tacked onto the end of the line above and the
     * last four seconds of the reel said nothing at all. See SIGNUP_SPOKEN.
     */
    {
      /**
       * ═══════════════════════════════════════════════════════════════════
       * THE LAST SHOT IS THE FIRST SHOT, SO THE REEL LOOPS.
       *
       * Replay rate — total plays over unique viewers — is the signal none of
       * this was designed for. Above 1.2 distribution is reported as
       * substantially stronger, and a reel that loops cleanly plays again
       * before the viewer has consciously decided to replay it, which is how
       * watch time goes over 100%. See REPLAY_RATE_TARGET.
       *
       * Two things carry a loop: the words, when the closing line sets up the
       * opening one, and the PICTURE, when the last shot matches the framing
       * of the first. The words are spoken for: every reel ends on the same
       * call to action, which is worth more than a loop. The picture is free —
       * it only requires ending on the screen the reel opened on.
       *
       * AND IT DOES NOT FIT EVERY REEL, WHICH IS WORTH WRITING DOWN RATHER
       * THAN WORKING AROUND. Coming back to the opening screen concentrates
       * the reel on it: this one went to 61% of its running time on /journal
       * and demo-cost to 74% on the protein table, both past
       * MAX_ONE_ROUTE_SHARE. That rule is there because a reel that never
       * leaves one screen is a screenshot with captions over it, and it is a
       * better rule than this is an idea — so the two reels that trip it end
       * on /home instead and go without the picture loop. drill and standards
       * open on an index they can return to cheaply, and they loop.
       *
       * Bending the share rule to fit the loop was the other option. It would
       * have meant deciding that the final beat somehow does not count, which
       * is true of the 1.8s of end card and false of the three seconds of app
       * screen before it.
       *
       * (Before this, all four ended on route "/" with an action reading
       * "front page". "/" redirects a signed-in visitor to /home, and the reel
       * is always signed in — so four pieces of prose described a reel nobody
       * had ever recorded, and each paid for a navigation and a redirect in
       * its final two seconds.)
       * ═══════════════════════════════════════════════════════════════════
       */
      route: "/home",
      action: "The home screen, with the score still on it, for the sign-off.",
      say: SIGNUP_SPOKEN,
      tail: END_CARD_MS,
    },
  ]);
}

/** The costed shopping list, which is the thing no other app can show. */
function costScript(): ReelScript {
  const facts = indexFacts();
  const cheap = facts ? `${money(facts.cheapest.cost)} from ${facts.cheapest.name.toLowerCase()}` : "under a pound";
  const dear = facts ? `${money(facts.dearest.cost)}` : "over three pounds";
  /** "10x" reads better in a hook than "10.2x", and the table shows the exact figure. */
  const gap = facts ? `${Math.round(facts.dearest.cost / facts.cheapest.cost)}x` : "10x";
  /** The price on its own — the line names the food itself. */
  const cheapPrice = facts ? money(facts.cheapest.cost) : "under a pound";
  /**
   * THE NAMES COME FROM THE INDEX, NOT FROM MEMORY.
   *
   * I first wrote these lines with the prices and foods spelled out as words —
   * "Thirty-one pence... The cheap one is red lentils" — which reads fine and
   * is a reel that starts lying the day a shelf price moves. A test caught it
   * by looking for the app's own figures in the script and finding none.
   */
  const cheapName = facts ? facts.cheapest.name.toLowerCase() : "red lentils";
  const dearName = facts ? facts.dearest.name.toLowerCase() : "king prawns";
  /**
   * THE HOOK IS A CONTRAST, NOT A LABEL.
   *
   * It was "30g of protein: £0.31." — which states the subject and asks
   * nothing. A hook has three seconds to make stopping feel like the cheaper
   * option, and a fact you can finish reading is a fact you can scroll past.
   * The gap between the two prices is the whole reel; putting it first is the
   * reel telling you what it is going to prove.
   */
  /**
   * THE HOOK STATED A FACT ABOUT FOOD; IT ACCUSES THE VIEWER NOW.
   *
   * "Same protein. 10x the price." is true, symmetrical and about nothing in
   * particular. lib/reel-retention.ts wants a number, a question or the
   * second person and settled for the number — but the second person is the
   * half that makes stopping feel urgent, and this reel has both available.
   */
  return build("demo-cost", `You're paying ${gap} for the same protein.`, [
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * BUILD, THEN REVEAL. "No reel hook or pausing for suspense."
     *
     * The first version gave the number away in the opening line — "30g of
     * protein. Red lentils: £0.31." — and then spent fourteen seconds
     * explaining a fact already told. Nothing was owed to the viewer, so
     * there was no reason to stay.
     *
     * It asks now, shows the evidence, and holds the figure back to the
     * moment the shot reaches it. lib/speech-timing.ts puts a 1.15s silence
     * before a short line that follows a long one, which is exactly this
     * shape, so the pause arrives without anybody timing it by hand.
     * ═══════════════════════════════════════════════════════════════════════
     */
    {
      route: "/cheapest-protein/",
      action: "Top of the ranked table, the three summary cards in frame.",
      /**
       * TWO BEATS MERGED. They made the same point in two shots — the claim
       * and its credibility — and cost four seconds of a reel that was running
       * at the 30s ceiling. One sentence carries both, and completion rate is
       * the strongest signal a reel sends.
       */
      /**
       * THE CONTRAST, SPOKEN, IN THE FIRST LINE.
       *
       * This said "Every food here is the same 30 grams of protein" — the
       * premise, not the claim, and a premise gives a viewer nothing to stay
       * for. The two prices ARE the reel; naming both in the opening line is
       * the contrarian-claim shape, and the beats after it are then evidence
       * for something already promised rather than a slow walk toward it.
       */
      /**
       * TWO SENTENCES MADE "£0.31." A CAPTION ON ITS OWN — a one-word flash,
       * caught by the rule written two commits ago for "The drill:". One
       * sentence, so it is one thought and at worst two captions.
       *
       * And the QUANTITY stays in the spoken line. Cutting it to two bare
       * prices leaned on the hook card, which is up for 1.6 seconds: anybody
       * who arrives a moment late gets two numbers and no idea what they buy.
       * A test caught that too, and it was right to.
       */
      say: `${cheapPrice} or ${dear}, same ${REFERENCE_PROTEIN} grams.`,
    },
    {
      route: "/cheapest-protein/",
      action: "Land on the cheapest row and hold.",
      focus: "Red lentils",
      // THE REVEAL. Everything before it was setup; this is what the hook
      // promised. The silence is the reel telling the viewer to look.
      hold: SUSPENSE_MS,
      say: `The cheap one's ${cheapName}.`,
    },
    {
      route: "/cheapest-protein/",
      action: "Hold on the most expensive row.",
      focus: facts ? facts.dearest.name : "",
      // "10x the money" is the hook card's line, not this one's. What this beat
      // has that nothing else does is the joke.
      // A question hands over to its own answer; a statement just stops.
      say: `The dear one? ${dearName.charAt(0).toUpperCase()}${dearName.slice(1)}. Hope they were nice.`,
    },
    {
      route: "/recipes/",
      action: "Open a recipe and show the costed ingredient list.",
      /**
       * "Priced from real supermarket packs" MOVED HERE from the table beat.
       *
       * Trimming the closing beats without trimming the table pushed
       * /cheapest-protein/ to 60% of the reel, and lib/reel-retention.ts
       * refused to film it — correctly: a reel that spends two thirds of
       * itself on one screen has nothing to watch. Moving the line takes time
       * off that route AND puts it where it is actually true, since the
       * recipes are the thing costed from those packs.
       */
      /**
       * ADDRESSED TO THE VIEWER, AND IT IS ALSO WHAT KEEPS THE ROUTE SHARE DOWN.
       *
       * It read "Every recipe in the app is priced from real supermarket
       * packs" — a sentence about the app's methodology, said to nobody.
       *
       * The second reason is arithmetic, and it is worth writing down because
       * it is counter-intuitive: MAX_ONE_ROUTE_SHARE is a RATIO, so trimming
       * the beats AWAY from /cheapest-protein/ pushed that route from 55% to
       * 58% without a millisecond being added to it. Cutting this beat to a
       * fragment made the reel's worst number worse.
       */
      // "like that" reaches back to the two rows just shown.
      say: "Every recipe in PocketAthlete is costed like that, before you buy.",
    },
    {
      route: "/nutrition",
      action: "Show a meal plan with its weekly cost.",
      focus: "kcal left",
      /**
       * "Before you go" was a fragment that landed as "before you leave".
       *
       * It was reaching for "before you go shopping" and arrived as a goodbye,
       * which is the wrong note to end a reel on — and worse, it was the
       * PAYOFF, the slowest and now the loudest line in the whole thing.
       *
       * The payoff shape is kept: a short punchy sentence after a longer one,
       * which is what lib/speech-timing.ts puts the suspense gap in front of.
       * It just says something now.
       */
      /**
       * NINE WORDS, AND THE HEADROOM IS THE REASON.
       *
       * This reel measured 29.7s against a 30s ceiling with the sign-off in —
       * three tenths of a second of margin on a script whose figures come out
       * of lib/protein-index.ts. A shelf price moves, "£3.19" becomes "£10.45",
       * and the reel is refused by a rule nobody was thinking about that day.
       */
      say: "Build a week and it prices your whole shop.",
    },
    /**
     * NOT looping to /cheapest-protein/. This reel already spends 55% of
     * itself on that table; returning there for the sign-off took it to 74%,
     * well past MAX_ONE_ROUTE_SHARE. See the note on demo-readiness.
     */
    { route: "/home", action: "The home screen, held for the sign-off.", say: SIGNUP_SPOKEN, tail: END_CARD_MS },
  ]);
}

/** A drill, filmed on the page that teaches it. */
function drillScript(drillId: string): ReelScript | null {
  const drill = SKILL_DRILLS.find((d) => d.id === drillId) ?? SKILL_DRILLS[0];
  if (!drill) return null;
  const sport = sportLabel(drill.sport as SportId);
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * REBUILT AGAINST lib/reel-retention.ts, WHICH FAILED THE FIRST VERSION ON
   * TWO COUNTS AND WAS RIGHT ABOUT BOTH.
   *
   * The hook was "Most people do X wrong" — no number, no question, nothing
   * addressed to the viewer, so it labelled the video instead of starting it.
   * It is second-person now, which is the form the retention data supports.
   *
   * And 88% of it happened on one route, because there is no per-drill page:
   * /drills/<sport>/ is the whole thing. Four beats saying "show the setup",
   * "show the steps", "stop on the cue" were three captions over one static
   * screen — a screenshot with words on it, which is the format this rule
   * exists to catch. It moves now: the index for breadth, the drill for the
   * substance, and the log screen to show the drill being used.
   *
   * The numbered steps are gone deliberately. They are the least watchable
   * thing on the page and the reel is not a substitute for reading it.
   * ═══════════════════════════════════════════════════════════════════════
   */
  return build(`drill-${drill.id}`, `You're doing ${drill.name.toLowerCase()} wrong.`, [
    {
      route: "/drills/",
      action: "The drill index. Scroll a little so the breadth reads.",
      /**
       * A DIRECTORY DESCRIPTION IS NOT A HOOK.
       *
       * This opened on "Free drills for football, sorted by what they fix" —
       * a sentence about a page, said to nobody, over a list. The hook two
       * lines above already names a mistake the viewer is making; the first
       * spoken line now says the same thing, so the promise arrives in the
       * window the retention data actually cares about.
       */
      say: `Your ${drill.name.toLowerCase()} aren't working. Not fitness — one detail.`,
    },
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * "FIND THE DRILL" WAS AN INSTRUCTION TO A PERSON, NOT TO THE RECORDER.
     *
     * These two beats had no focus, so the shot was wherever the slow drift
     * had reached. Extracted at 12s: a wall of prose about "Switching play"
     * and "Switching the play" — two drills that are not this one — under a
     * caption quoting THIS one's coaching point. The page is an index of every
     * football drill and the reel was reading one card's words over another
     * card's picture.
     *
     * Naming the focus makes the recorder scroll to it, ring it and dim the
     * rest, which is also the only thing that turns a page of instructional
     * text into a shot. And it makes a miss FATAL: if the drill this reel is
     * about is not on the page it claims, the run stops instead of filming
     * somebody else's drill and narrating over it.
     * ═══════════════════════════════════════════════════════════════════════
     */
    {
      route: `/drills/${drill.sport}/`,
      action: `Find ${drill.name} and show its setup.`,
      focus: drill.name,
      /**
       * A BRIDGE, because the beat before it promises "one detail" and this
       * one used to open on raw setup text with nothing joining them. Read
       * aloud it was a non-sequitur: a claim, then equipment.
       *
       * Still the drill's OWN words — the ring is around this drill's card, so
       * inventing a description here would put the voice and the screen back
       * out of step. Only the lead-in is added.
       */
      /**
       * THE FIRST SENTENCE OF THE SETUP, not all of it. The ring is around this
       * drill's card and the card shows the whole thing — a voice reading out
       * text the viewer can see is narration of a screenshot, and this reel was
       * 29.5s against a 30s ceiling with a 2.2% engine correction on top.
       */
      say: `Here's the drill. ${(() => { const [first] = drill.setup.split(/(?<=\.)\s+/); return first; })()}`,
    },
    {
      route: `/drills/${drill.sport}/`,
      action: "Stop on the coaching cue and hold it.",
      // The cue itself, not the drill again: the beat is about this sentence,
      // and it is rendered from the same SKILL_DRILLS entry the line comes
      // from, so the words on screen cannot drift from the words spoken.
      focus: drill.coaching,
      say: drill.coaching,
    },
    {
      route: "/journal?log=training",
      action: "The training row, open and ready for the session.",
      // "That's it" lands on the cue the beat before, which is the whole point.
      say: "That's it. Log it in PocketAthlete and next week builds on what you did, not what you meant to.",
    },
    // Back to the index it opened on, so the reel loops. See demo-readiness.
    { route: "/drills/", action: "Back to the screen it opened on, for the sign-off.", say: SIGNUP_SPOKEN, tail: END_CARD_MS },
  ]);
}

/** What a lift is worth, which is the question people actually ask. */
function standardsScript(): ReelScript | null {
  const page = standardPages().find((p) => p.slug === "bench-press") ?? standardPages()[0];
  if (!page) return null;

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE APP'S OWN WORDS, AND THE APP'S OWN ARITHMETIC.
   *
   * This said a hundred kilos is "elite" at sixty kilos bodyweight and
   * "average" at a hundred and twenty. Both were typed. The table on screen
   * is headed NOVICE, INTERMEDIATE, ADVANCED, EXCEPTIONAL, MASTER — so the
   * reel used two words the viewer could not find anywhere in the shot, and
   * would have gone on saying them the first time a threshold moved.
   *
   * rankLift is the function the app itself ranks a logged lift with, so the
   * words are the ones on the screen behind them and stay that way.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const LOAD = 100;
  const LIGHT = 60;
  const HEAVY = 120;
  const tierAtBodyweight = (kg: number) => rankLift(page.lift, LOAD, kg, "male")?.tier.name.toLowerCase();
  const light = tierAtBodyweight(LIGHT);
  const heavy = tierAtBodyweight(HEAVY);
  if (!light || !heavy) return null;

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A CONTRARIAN CLAIM WITH TWO NUMBERS IN IT.
   *
   * The hook asked "Is your bench press any good?" and the first line then
   * answered "that question has no answer" — a question followed by its own
   * refusal, which is two beats spent arriving where it started. The same
   * fact stated as a contradiction does the whole job in one line, and the
   * numbers are what make it impossible to scroll past: the viewer has to
   * work out which one they are.
   * ═══════════════════════════════════════════════════════════════════════
   */
  return build(`standards-${page.slug}`, `Your ${LOAD}kg ${page.lift.label.toLowerCase()} means nothing.`, [
    {
      route: "/standards/",
      action: "Show the list of lifts.",
      /**
       * THE CLAIM MOVED TO THE BEAT THAT CAN PROVE IT.
       *
       * The two-number contradiction used to be said here, over the INDEX of
       * lifts — a screen with no bodyweights and no tiers on it. The table is
       * one beat later. Same fault as the readiness reel's session beat: the
       * line and the picture were on different screens.
       */
      // Picks the hook card's own words straight up rather than restating them
      // as a sentence about the product.
      // "Nothing." on its own is a sentence, so it is a caption, so it is a
      // one-word flash — the rule that caught "The drill:" caught this too.
      // Two words each keeps the shape and clears the floor.
      // Was four phrases making the point twice over; the table beat that
      // follows says it with actual numbers. Trimmed to pay for the two holds
      // above, which buy a picture that matches the line.
      say: "On its own? Means nothing.",
    },
    {
      route: `/standards/${page.slug}/`,
      action: "Open the table and stop on the bodyweight column.",
      /**
       * THE AXIS THE LINE IS ABOUT. The table is a wall of numbers and this
       * beat had no focus at all, so the shot was wherever the drift reached
       * — filmed and looked at: rows 50kg to 120kg with nothing to say which
       * of them mattered. The bodyweight column is the whole point of the
       * table and it is what the sentence names.
       */
      focus: "Bodyweight",
      // All three written as numerals: lib/spoken-numbers.ts turns "60kg" into
      // "sixty kilos" for the voice and the caption keeps the numeral, which is
      // faster to scan. Mixing "100 kilos" with "60kg" got one of each.
      say: `${LOAD}kg at ${LIGHT}kg bodyweight is ${light}. At ${HEAVY}kg, ${heavy}. Same bar.`,
    },
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * "THE VIDEOS STILL AREN'T MAKING ME WANNA WATCH MORE."
     *
     * This beat used to say "log one lift and PocketAthlete tells you exactly
     * where you sit" over a screenshot of /benchmarks with a lift already on
     * it. Nothing was logged and nothing was told — the claim was made in the
     * voice and the picture was a still of the aftermath.
     *
     * Audited, three of the four reels were doing that: navigate, scroll,
     * talk. lib/reel-moves.ts was built for exactly this ("the videos should
     * show them doing the stuff") and one reel used it.
     *
     * So the form gets filled on camera. The claim is no longer a claim: the
     * viewer watches a number go in, and the next beat is where it comes out.
     * ═══════════════════════════════════════════════════════════════════════
     */
    {
      route: "/benchmarks",
      action: "Log the lift: open the form, type the load, save it.",
      /**
       * ═══════════════════════════════════════════════════════════════════
       * THE LINE WAITED FOR THE PAGE, BECAUSE THE PAGE DOES NOT WAIT.
       *
       * First recording of this beat: at the exact moment the voice said "so
       * log it", the frame was black with a loading spinner. The recorder
       * navigates with waitUntil "load", which on a Next.js SPA fires while
       * the document is still empty — lib/reel-moves.ts says so in its note
       * on MOVE_WAIT_MS — and the beat's clock is the audio, which does not
       * care.
       *
       * A move that finds nothing is loud and fails the run. A move that
       * finds its target while the VIEWER is looking at a black screen is
       * silent, and that is what shipped.
       *
       * 1.1s was the first guess and it was still black. Measured properly off
       * the second recording by stepping frames: this route navigates at
       * 11.71s and does not paint until 13.8s. See DATA_ROUTE_PAINT_MS.
       * ═══════════════════════════════════════════════════════════════════
       */
      hold: DATA_ROUTE_PAINT_MS,
      moves: [
        { tap: "+ Log a benchmark test" },
        { type: String(LOAD), into: `${page.lift.label} 1RM` },
        { tap: "Save" },
      ],
      say: "So log it. Takes one tap.",
    },
    /**
     * AND THE PAYOFF IS THE SCREEN, NOT THE SENTENCE.
     *
     * The rank is what the whole reel has been promising. It arrives here,
     * computed by the app from the number typed a beat ago, with a pause on
     * it — see `hold`, which is the one place a reel should wait.
     *
     * The tab tap is NOT optional dressing: the dashboard opens on Recovery
     * (useState("recovery")), so without it this beat films a page that does
     * not contain the thing it is about, and the focus below would fail.
     */
    {
      route: "/dashboard",
      action: "Open Performance and let the rank land.",
      moves: [{ tap: "Performance" }],
      focus: "Strength ranks",
      /**
       * NOT SUSPENSE_MS, AND THE DIFFERENCE IS MEASURED. At 900ms the payoff
       * line began 1.3s before the rank was on screen: the first half of "and
       * there's where PocketAthlete puts that lift" played over the Recovery
       * tab — injury risk, average sleep — which is a different claim than the
       * one being made. The tab switch plus the dashboard's own fetch land the
       * rank about 2.4s into the beat, so the line waits that long.
       *
       * This is the cost of filming something real rather than a screenshot,
       * and it is paid for out of the setup beat rather than the ceiling.
       */
      hold: 2_400,
      say: "And there's where PocketAthlete puts that lift.",
    },
    // Back to the list it opened on, so the reel loops. See demo-readiness.
    { route: "/standards/", action: "Back to the screen it opened on, for the sign-off.", say: SIGNUP_SPOKEN, tail: END_CARD_MS },
  ]);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CARD REEL IS THE SAME PIPELINE POINTED AT A DIFFERENT PAGE.
 *
 * "A full content engine, not just a poor content engine that produces
 * monotonic vids." Everything here filmed the APP, which lib/content-formats.ts
 * records is the worst-performing shape in a cold feed — it reads as an advert
 * on sight and has no human in it.
 *
 * The recorder films a ROUTE, though, and nothing requires that route to be
 * the app. app/studio renders one figure set large enough to be the picture,
 * built from figures this app computes and roughly nobody else has. So a
 * knowledge post costs no new recorder, no new voice, no new caption sync — it
 * is a script with different routes in it.
 *
 * SHORT, AND IT LOOPS. The comparison band is 8-20s against the tour's 30:
 * completion is the signal a feed ranks on, a gap the viewer has to resolve is
 * what holds them to the end of it, and a loop is counted again.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function cardScript(card: ContentCard): ReelScript | null {
  if (cardProblems(card).length) return null;
  const stageRoute = (n: number) => `/studio/${card.id}/${n}/`;
  const faceAt = (i: number) => card.faces[Math.min(i, card.faces.length - 1)];

  const beats: Omit<Beat, "at" | "ms">[] = card.lines.map((line, i) => ({
    route: stageRoute(i + 1),
    action: `Stage ${i + 1}: ${i + 1 === CARD_STAGES ? "the proof" : faceAt(i).figure}.`,
    /** The ring goes on the figure the line is about, not the whole card. */
    focus: i + 1 === CARD_STAGES ? undefined : faceAt(i).figure,
    /** The pause before the number the whole thing is built to deliver. */
    hold: i === 1 ? SUSPENSE_MS : undefined,
    say: line,
  }));

  /**
   * THE SIGN-OFF IS ITS OWN BEAT, and it goes back to the first stage.
   *
   * Its own beat because a reel's last `say` has to BE the call to action —
   * lib/reel-plan.ts draws the written end card over that beat's tail and
   * refuses to draw it over a caption, so a sign-off with a sentence in front
   * of it loses the only frame that asks for anything.
   *
   * Back to the first stage because that is where the reel opened, so it
   * LOOPS: the cheapest format there is to watch twice, and a replay counts.
   */
  beats.push({
    route: stageRoute(1),
    action: "Back to the opening shot, for the sign-off.",
    say: SIGNUP_SPOKEN,
    tail: END_CARD_MS,
  });
  return build(`card-${card.id}`, card.hook, beats);
}

export type ScriptId =
  | "demo-readiness" | "demo-cost" | "drill" | "standards"
  | "card-protein-gap" | "card-bodyweight-gap" | "card-cheapest-protein";

export const SCRIPTS: { id: ScriptId; label: string; note: string }[] = [
  { id: "demo-readiness", label: "Readiness changes the session", note: "The one screen where a number moves because of you" },
  { id: "demo-cost", label: "What protein actually costs", note: "The table, then a recipe, then a priced plan" },
  { id: "drill", label: "One drill, done properly", note: "Setup, volume, and the cue that separates them" },
  { id: "standards", label: "Is your lift any good?", note: "The table, then your own lift ranked against it" },
  /**
   * The card formats. Short, faceless, and built on figures this app computes
   * and nobody else publishes — see lib/content-formats.ts for why these exist
   * alongside the tours rather than instead of them.
   */
  { id: "card-protein-gap", label: "£0.31 against £3.19", note: "The same 30g of protein, ten times the price" },
  { id: "card-bodyweight-gap", label: "Same bar, different rank", note: "100kg at two bodyweights" },
  { id: "card-cheapest-protein", label: "The cheapest 30g in the shop", note: "One figure, and what it buys" },
];

export function reelScript(id: ScriptId, subject?: string): ReelScript | null {
  if (id === "demo-readiness") return readinessScript();
  if (id === "demo-cost") return costScript();
  if (id === "drill") return drillScript(subject ?? "");
  if (id === "standards") return standardsScript();
  if (id.startsWith("card-")) {
    const card = cardById(id.slice("card-".length));
    return card ? cardScript(card) : null;
  }
  return null;
}

export interface ScriptProblem {
  beat: number;
  problem: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT MAKES A REEL UNWATCHABLE, CHECKED BEFORE IT IS RECORDED.
 *
 * Every one of these is a mistake that cannot be fixed afterwards without
 * filming it again — which is why they are worth catching while the script is
 * still text. A voiceover that overruns its shot is not an edit, it is a
 * reshoot.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function scriptProblems(script: ReelScript): ScriptProblem[] {
  const problems: ScriptProblem[] = [];

  if (script.hook.split(/\s+/).length > HOOK_MAX_WORDS) {
    problems.push({ beat: 0, problem: `the hook is ${script.hook.split(/\s+/).length} words — nobody reads past ${HOOK_MAX_WORDS}` });
  }
  if (script.beats.length === 0) {
    problems.push({ beat: 0, problem: "there is nothing to film" });
    return problems;
  }
  if (script.beats[0].at > HOOK_BY_MS) {
    problems.push({ beat: 0, problem: "the first beat starts after the hook window" });
  }
  if (script.totalMs > MAX_REEL_MS) {
    problems.push({ beat: 0, problem: `${Math.round(script.totalMs / 1000)}s — over the ${MAX_REEL_MS / 1000}s ceiling` });
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A REEL THAT ENDS WITHOUT ASKING FOR ANYTHING.
   *
   * All four of these ran to the end and never said what the app was called.
   * That is not a style note — it is the beat the short-form guidance says
   * creators skip and the one that decides whether a view becomes a signup.
   *
   * And the TAIL half is a fault I would not have found by watching: the end
   * card is drawn over whatever is left of the last beat after its captions
   * (endCardAt in lib/reel-plan.ts), and captions fill a beat exactly. Give
   * the last beat a line without giving it room and the card is drawn for
   * zero milliseconds — the reel loses its only written call to action and
   * looks, on the timeline, entirely correct.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const last = script.beats[script.beats.length - 1];
  if (!last.say.includes(SIGNUP_SPOKEN)) {
    problems.push({ beat: script.beats.length - 1, problem: "the reel never says what the app is called or where to get it" });
  } else if ((last.tail ?? 0) < END_CARD_MS) {
    problems.push({
      beat: script.beats.length - 1,
      problem: `the last beat speaks with ${last.tail ?? 0}ms after it — the end card needs ${END_CARD_MS}ms of its own`,
    });
  }

  script.beats.forEach((beat, i) => {
    if (!beat.route.startsWith("/")) {
      problems.push({ beat: i, problem: `"${beat.route}" is not a route` });
    }
    if (!beat.action.trim()) {
      problems.push({ beat: i, problem: "no action — the camera does not know what to point at" });
    }
    if (beat.say && beat.ms < holdFor(beat.say)) {
      problems.push({ beat: i, problem: "the line does not fit in the shot" });
    }
    if (beat.ms < MIN_BEAT_MS) {
      problems.push({ beat: i, problem: `${beat.ms}ms — too short to read` });
    }
  });

  return problems;
}

/** Roughly how long the narration takes, for the person about to read it. */
export function readTimeMs(script: ReelScript): number {
  return script.words * MS_PER_WORD;
}

export interface BeatCursor {
  beat: Beat;
  index: number;
  /** 0 to 1 through this beat. */
  progress: number;
  /** True once the clock is past the last beat — the take has overrun. */
  overrun: boolean;
}

/**
 * Which beat the clock is inside.
 *
 * Lived in the component and was therefore untested, which is a poor place for
 * the one function the teleprompter is. Two edges matter and neither is
 * obvious from reading it: time zero must land on the FIRST beat rather than
 * on nothing, and running past the end must hold the last beat rather than
 * return null — a prompter that goes blank at the end reads as a crash, at the
 * exact moment somebody is still talking.
 */
export function beatAt(script: ReelScript, ms: number): BeatCursor | null {
  if (script.beats.length === 0) return null;
  const at = Math.max(0, ms);
  for (const [index, beat] of script.beats.entries()) {
    if (at < beat.at + beat.ms) {
      /**
       * No clamp, because the loop already bounds this and a clamp that cannot
       * fire is a claim that it can. `at` is at least this beat's start — every
       * earlier beat was skipped for ending before it — and less than its end
       * by the condition above. Both halves rest on beats being CONTIGUOUS,
       * which `time()` guarantees by construction and a test asserts.
       */
      return { beat, index, progress: (at - beat.at) / beat.ms, overrun: false };
    }
  }
  const index = script.beats.length - 1;
  return { beat: script.beats[index], index, progress: 1, overrun: true };
}
