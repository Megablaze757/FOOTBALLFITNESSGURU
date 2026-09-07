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
import { holdFor, speechMs, MIN_SCENE_MS, MAX_REEL_MS, MS_PER_WORD } from "./reel";
import { SUSPENSE_MS } from "./narration";
import { hookText, HOOK_MAX_WORDS } from "./reel-kinds";
import { END_CARD_MS } from "./reel-plan";
import { SIGNUP_SPOKEN } from "./signup-link";
import { SKILL_DRILLS } from "./skills";
import { indexFacts, money, REFERENCE_PROTEIN } from "./protein-index";
import { standardPages } from "./standards-page";
import { rankLift } from "./strength-standards";
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
    words: beats.reduce((n, b) => n + (b.say ? b.say.trim().split(/\s+/).length : 0), 0),
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
  return build("demo-readiness", "You slept three hours. Your app doesn't care.", [
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
      say: "Every training app you own will still hand you the session it planned last Sunday.",
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
      say: "This one asks first — bad night, wrecked legs, ten seconds.",
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
      say: "That's today's body talking, not last Sunday's plan.",
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
      say: "So today's session got rebuilt. Not a warning you swipe away — the work itself changed.",
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
       * "/" REDIRECTS TO /home FOR A SIGNED-IN VISITOR, AND THE REEL IS
       * ALWAYS SIGNED IN — it has to be, to have an app to film.
       *
       * All four scripts ended on route "/" with an action saying "front
       * page", and all four landed on the home screen every single time. Four
       * pieces of prose describing a reel nobody has ever recorded, and a
       * pointless navigation-and-redirect in the last two seconds of each.
       * ═══════════════════════════════════════════════════════════════════
       */
      route: "/home",
      action: "Back to the home screen, with the score still on it, for the sign-off.",
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
      say: `${cheapPrice}, or ${dear}. Same ${REFERENCE_PROTEIN} grams of protein.`,
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
      say: `The dear one's ${dearName}. ${gap} the money.`,
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
      say: "Every recipe you cook is priced before you buy it.",
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
      say: "Build a week and it prices the whole shop.",
    },
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
      say: `Your ${drill.name.toLowerCase()} aren't working, and it's one detail, not fitness.`,
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
      say: drill.setup,
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
      say: "Log it, and next week builds on what you actually did.",
    },
    { route: "/home", action: "The home screen, held for the sign-off.", say: SIGNUP_SPOKEN, tail: END_CARD_MS },
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
  return build(`standards-${page.slug}`, `Your ${LOAD}kg ${page.lift.label.toLowerCase()} means nothing`, [
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
      say: "Every lift in here is ranked against your bodyweight, not against the bloke next to you.",
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
      say: `So a ${LOAD}kg bench at ${LIGHT}kg bodyweight is ${light}. At ${HEAVY}kg, ${heavy}.`,
    },
    {
      route: "/benchmarks",
      action: "Show a logged lift with its tier beside it.",
      say: "Log one lift and it tells you exactly which tier you're in.",
    },
    { route: "/home", action: "The home screen, held for the sign-off.", say: SIGNUP_SPOKEN, tail: END_CARD_MS },
  ]);
}

export type ScriptId = "demo-readiness" | "demo-cost" | "drill" | "standards";

export const SCRIPTS: { id: ScriptId; label: string; note: string }[] = [
  { id: "demo-readiness", label: "Readiness changes the session", note: "The one screen where a number moves because of you" },
  { id: "demo-cost", label: "What protein actually costs", note: "The table, then a recipe, then a priced plan" },
  { id: "drill", label: "One drill, done properly", note: "Setup, volume, and the cue that separates them" },
  { id: "standards", label: "Is your lift any good?", note: "The table, then your own lift ranked against it" },
];

export function reelScript(id: ScriptId, subject?: string): ReelScript | null {
  if (id === "demo-readiness") return readinessScript();
  if (id === "demo-cost") return costScript();
  if (id === "drill") return drillScript(subject ?? "");
  if (id === "standards") return standardsScript();
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
