// =============================================================================
// "Watch Form Guide" — where to actually SEE the movement.
//
// This is the app's ONLY answer to "how does this go?". It used to be the
// second answer, behind a drawn figure and, for about half the gym catalogue,
// a licensed illustration or photograph. Those are gone: a still cannot show a
// bar path, a tempo, where the hips go first, or what a rounded back looks like
// from the side, which is the whole content of "good form". See
// components/ExerciseWatch.tsx.
//
// EMBEDDED, BUT NOT LOADED. A curated guide plays in place. It costs nothing
// until it is asked for — no iframe, no thumbnail, no request to YouTube of any
// kind until somebody taps play, and then `youtube-nocookie.com` rather than
// the domain that sets a tracking cookie on arrival. See FormGuideEmbed. A
// search cannot be embedded, because there is no iframe for a list of results,
// so those still link out and the UI says which one it is.
//
// CURATED WIDELY NOW, SEARCH FOR THE REST. This list was eighteen entries and
// the comment here said it was deliberately short — that hand-picking three
// hundred videos is a job nobody finishes and a set of links that rots. The
// first half of that was true and is no longer, because scripts/find-form-
// guides.mjs does the finding; the second half is still true, which is why
// scripts/check-form-guides.mjs exists and why it prints each TITLE rather than
// just a status. A curated link that has rotted is worse than a search that
// always works: it promises a chosen answer and delivers an apology page.
//
// Everything that has no entry falls back to a search on the exact movement
// name, which cannot 404.
//
// Pure + tested.
// =============================================================================

export interface FormGuide {
  url: string;
  /** "video" when somebody chose it; "search" when this is a good query. */
  kind: "video" | "search";
  /** What the control should say. */
  label: string;
  /**
   * The YouTube id, for the ones that can be played in place.
   *
   * Only ever set when `kind` is "video". A search has no id — there is no such
   * thing as an embedded list of results — which is why "switch it all to
   * iframes" can only ever mean the curated ones. Everything else keeps a link
   * out, and that is the difference the UI has to show rather than paper over.
   */
  videoId?: string;
}

/** The id out of a watch url, or null if it is not one. */
function idOf(url: string): string | null {
  return url.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;
}

/**
 * Curated guides, keyed by lowercased movement name.
 *
 * ONLY CHANNELS THAT TEACH. Every entry is from a coach, a physio or a
 * federation — the list is in scripts/find-form-guides.mjs — because the whole
 * value of a chosen link over a search is that somebody vouched for who is
 * talking. An unknown channel is refused however good the title looks.
 *
 * EVERY URL WAS FETCHED BEFORE IT WAS WRITTEN DOWN, and the TITLE and CHANNEL
 * read back. A video id that resolves can point at anything, so "it returns
 * 200" is not the check. The pairing is refused outright when a word that
 * CHANGES the movement is on one side only — an upright row is a shoulder
 * exercise and a bent-over row is a back one — and when the implement differs,
 * which is stricter than it sounds: a title omits the implement when it is the
 * obvious one, so "How to Bench Press" is a claim to be barbell, not a blank.
 * Soft matching duly gave our Dumbbell Bench Press a barbell demonstration.
 *
 * The generated list was then read line by line. Three entries were changed by
 * hand afterwards, all the same failure: the video was a good video about the
 * WRONG QUESTION. "Get BIG Biceps By Doing Chin-Ups" and "The Benefits of the
 * Reverse Grip Bench Press" argue that you should do the lift; neither shows
 * anybody how, so both fall back to a search. "Which Triceps Pushdown is Best"
 * is a comparison, and a straight guide to the same movement had already
 * matched under another name, so both keys point at it.
 *
 * Run `node scripts/check-form-guides.mjs` before adding to the list, and every
 * few months after.
 */
const CURATED: Record<string, string> = {
  /**
   * THE FIRST TEN, PICKED BY HAND before any of this was scripted. Kept
   * separate because they are the lifts where the failure mode is an injury
   * rather than a wasted set, and because a human chose each one for that
   * reason rather than because it cleared a filter.
   */
  "barbell back squat": "https://www.youtube.com/watch?v=bEv6CCg2BC8",
  "barbell front squat": "https://www.youtube.com/watch?v=uYumuL_G_V0",
  "barbell deadlift": "https://www.youtube.com/watch?v=op9kVnSso6Q",
  "romanian deadlift": "https://www.youtube.com/watch?v=JCXUYuzwNrM",
  "bench press": "https://www.youtube.com/watch?v=rT7DgCr-3pg",
  "barbell overhead press": "https://www.youtube.com/watch?v=2yjwXTZQDDI",
  "barbell row": "https://www.youtube.com/watch?v=9efgcAjQe7E",
  "pull ups": "https://www.youtube.com/watch?v=eGo4IYlbE5g",
  "barbell hip thrust": "https://www.youtube.com/watch?v=xDmFkJxPzeM",
  "bulgarian split squat": "https://www.youtube.com/watch?v=2C-uNgKwPLE",

  /**
   * THE REHAB WORK, and the reason the physio channels are on the trusted list.
   *
   * A nordic curl and a Copenhagen plank are prescribed to PREVENT a hamstring
   * tear and a groin strain. A demonstration that gets them wrong does the
   * opposite of the exercise's job, which is why these are worth being fussy
   * about — and why both point at a rehab channel rather than at whichever
   * video ranked first.
   *
   * They are also the two that had ROTTED when the list was first checked live,
   * unnoticed, while the button still said "Watch Form Guide".
   */
  "nordic curl": "https://www.youtube.com/watch?v=_e9vFU9-tkc",          // E3 Rehab
  "nordic hamstring curl": "https://www.youtube.com/watch?v=_e9vFU9-tkc", // E3 Rehab
  "copenhagen plank": "https://www.youtube.com/watch?v=YRRnnZsRs9U",      // E3 Rehab

  "lat pulldown": "https://www.youtube.com/watch?v=SALxEARiMkw",          // ATHLEAN-X
  "seated cable row": "https://www.youtube.com/watch?v=7o2oolbmzeI",      // ScottHermanFitness
  "kettlebell swing": "https://www.youtube.com/watch?v=h-A7HiTNZ5c",      // Colossus Fitness
  "dips": "https://www.youtube.com/watch?v=yN6Q1UI_xkE",                  // Jeff Nippard
  "dumbbell shoulder press": "https://www.youtube.com/watch?v=qEwKCR5JCog", // ScottHermanFitness

  // --- Found by scripts/find-form-guides.mjs, verified, then read line by line.
  "ab wheel rollout": "https://www.youtube.com/watch?v=vncVOEtMhpk", // Criticalbench
  "arnold press": "https://www.youtube.com/watch?v=ris9tKqMwgU", // ATHLEAN-X™
  "back extension": "https://www.youtube.com/watch?v=H8Swl1N-uis", // Squat University
  "barbell calf raise": "https://www.youtube.com/watch?v=czMLq4MsPiE", // MuscleWiki
  "barbell curl": "https://www.youtube.com/watch?v=QZEqB6wUPxQ", // ScottHermanFitness
  "barbell front raise": "https://www.youtube.com/watch?v=Ofo2DQdT7DA", // ScottHermanFitness
  "barbell glute bridge": "https://www.youtube.com/watch?v=0od5lwWMGV8", // ScottHermanFitness
  "barbell hack squat": "https://www.youtube.com/watch?v=EdtaJRBqwes", // Buff Dudes
  "barbell lunge": "https://www.youtube.com/watch?v=NcDtORTfVNQ", // Colossus Fitness
  "barbell pullover": "https://www.youtube.com/watch?v=ezRNDsGBTm4", // Mind Pump TV
  "barbell reverse lunge": "https://www.youtube.com/watch?v=R-g5yPNYv2k", // Bodybuilding.com
  "barbell shrug": "https://www.youtube.com/watch?v=jTVbilkxSAk", // ScottHermanFitness
  "behind the neck press": "https://www.youtube.com/watch?v=uD9kYAi7lHs", // Mind Pump TV
  "bench dips": "https://www.youtube.com/watch?v=jdFzYGmvDyg", // ATHLEAN-X™
  "box squat": "https://www.youtube.com/watch?v=rRihE4weYg4", // Squat University
  "cable bicep curl": "https://www.youtube.com/watch?v=2MUEL4nL6hA", // Colossus Fitness
  "cable chest fly": "https://www.youtube.com/watch?v=hrh0K1Oo7Yc", // Colossus Fitness
  "cable crunch": "https://www.youtube.com/watch?v=3qjoXDTuyOE", // Bodybuilding.com
  "cable fly": "https://www.youtube.com/watch?v=JUDTGZh4rhg", // ATHLEAN-X™
  "cable hammer curl": "https://www.youtube.com/watch?v=VY4walmoM-I", // Buff Dudes Workouts
  "cable kickback": "https://www.youtube.com/watch?v=5jJNfIlKTmg", // Colossus Fitness
  "cable lateral raise": "https://www.youtube.com/watch?v=qitQHqNZbeM", // Colossus Fitness
  "cable overhead tricep extension": "https://www.youtube.com/watch?v=GzmlxvSFE7A", // Colossus Fitness
  "cable pull through": "https://www.youtube.com/watch?v=DbSF7ipBh5Y", // Colossus Fitness
  "cable tricep pushdown": "https://www.youtube.com/watch?v=_w-HpW70nSQ", // ScottHermanFitness
  "chest press": "https://www.youtube.com/watch?v=xUm0BiZCWlQ", // ScottHermanFitness
  "clean": "https://www.youtube.com/watch?v=wR5k7OFliro", // Garage Strength
  "clean and jerk": "https://www.youtube.com/watch?v=bNCXgyosXlc", // Catalyst Athletics
  "clean and press": "https://www.youtube.com/watch?v=V-4qJEbTpI8", // Starting Strength
  "clean high pull": "https://www.youtube.com/watch?v=2Qv8pEnprpU", // Catalyst Athletics
  "clean pull": "https://www.youtube.com/watch?v=xx8WkFrST2Y", // Catalyst Athletics
  "close grip bench press": "https://www.youtube.com/watch?v=UYJsFzqdgK4", // ScottHermanFitness
  "crunches": "https://www.youtube.com/watch?v=zkQWXbAP9l0", // ATHLEAN-X™
  "decline bench press": "https://www.youtube.com/watch?v=FFyGwcLnDYc", // Colossus Fitness
  "decline dumbbell bench press": "https://www.youtube.com/watch?v=Pf1nDoqx_1A", // Bodybuilding.com
  "decline push up": "https://www.youtube.com/watch?v=SKPab2YC8BE", // ScottHermanFitness
  "decline sit up": "https://www.youtube.com/watch?v=QhGU5cmNZds", // ScottHermanFitness
  "donkey calf raise": "https://www.youtube.com/watch?v=Jk_fDd57e98", // Buff Dudes Workouts
  "dumbbell bench press": "https://www.youtube.com/watch?v=SzcSrpVr0GA", // ATHLEAN-X™
  "dumbbell concentration curl": "https://www.youtube.com/watch?v=Jvj2wV0vOYU", // ScottHermanFitness
  "dumbbell curl": "https://www.youtube.com/watch?v=yTWO2th-RIY", // ATHLEAN-X™
  "dumbbell deadlift": "https://www.youtube.com/watch?v=HMcXQyEqJ7A", // Colossus Fitness
  "dumbbell floor press": "https://www.youtube.com/watch?v=Bx4QPVH-J1g", // Colossus Fitness
  "dumbbell fly": "https://www.youtube.com/watch?v=QENKPHhQVi4", // Mind Pump TV
  "dumbbell front raise": "https://www.youtube.com/watch?v=-t7fuZ0KhDA", // ScottHermanFitness
  "dumbbell front squat": "https://www.youtube.com/watch?v=MJao9o7ROs0", // Bodybuilding.com
  "dumbbell lateral raise": "https://www.youtube.com/watch?v=Y29xKcze8Ik", // Physique Development
  "dumbbell lunge": "https://www.youtube.com/watch?v=D7KaRcUTQeE", // ScottHermanFitness
  "dumbbell pullover": "https://www.youtube.com/watch?v=Q8l6ykgnmPM", // Colossus Fitness
  "dumbbell reverse fly": "https://www.youtube.com/watch?v=d1QEddtoOq0", // Colossus Fitness
  "dumbbell row": "https://www.youtube.com/watch?v=gfUg6qWohTk", // ATHLEAN-X™
  "dumbbell shrug": "https://www.youtube.com/watch?v=8L6zjxBwVzM", // Colossus Fitness
  "dumbbell squat": "https://www.youtube.com/watch?v=v_c67Omje48", // Bodybuilding.com
  "dumbbell tricep kickback": "https://www.youtube.com/watch?v=XuH2W_R5YoA", // Colossus Fitness
  "dumbbell upright row": "https://www.youtube.com/watch?v=K0dYqPCaO14", // Buff Dudes Workouts
  "ez bar curl": "https://www.youtube.com/watch?v=5NsFLGUf0Fo", // Colossus Fitness
  "face pull": "https://www.youtube.com/watch?v=ljgqer1ZpXg", // ATHLEAN-X™
  "floor press": "https://www.youtube.com/watch?v=vAFw7EPL4eM", // Buff Dudes Workouts
  "flutter kicks": "https://www.youtube.com/watch?v=ANVdMDaYRts", // ScottHermanFitness
  "glute bridge": "https://www.youtube.com/watch?v=E3Kt5qUYWfY", // Conor Harris
  "glute ham raise": "https://www.youtube.com/watch?v=owGSST60JWE", // FitnessFAQs
  "glute kickback": "https://www.youtube.com/watch?v=dJa_Nf4zdik", // Jeff Nippard
  "good morning": "https://www.youtube.com/watch?v=y_o_GeEClWs", // Renaissance Periodization
  "hack squat": "https://www.youtube.com/watch?v=0tn5K9NlCfo", // Bodybuilding.com
  "hammer curl": "https://www.youtube.com/watch?v=BRVDS6HVR9Q", // Buff Dudes Workouts
  "hanging knee raise": "https://www.youtube.com/watch?v=X-ACS9vpRyU", // ScottHermanFitness
  "hanging leg raise": "https://www.youtube.com/watch?v=Pr1ieGZ5atk", // ATHLEAN-X™
  "hip adduction": "https://www.youtube.com/watch?v=GmRSV_n2E_0", // ScottHermanFitness
  "hip extension": "https://www.youtube.com/watch?v=GFqfIInCuUQ", // Physique Development
  "incline dumbbell curl": "https://www.youtube.com/watch?v=DCe8f6vMe9A", // ATHLEAN-X™
  "incline dumbbell fly": "https://www.youtube.com/watch?v=idAvu2HvqSQ", // ScottHermanFitness
  "inverted row": "https://www.youtube.com/watch?v=11F_O_sZ1Z4", // Buff Dudes Workouts
  "landmine press": "https://www.youtube.com/watch?v=-mYbyc48wAk", // Colossus Fitness
  "landmine squat": "https://www.youtube.com/watch?v=hJ6XnlQ3yBU", // Bret Contreras Glute Guy
  "leg curl": "https://www.youtube.com/watch?v=jobEeklwrrs", // Renaissance Periodization
  "leg extension": "https://www.youtube.com/watch?v=ljO4jkwv8wQ", // Jeff Nippard
  "leg press": "https://www.youtube.com/watch?v=K5n2vg3oZa4", // Colossus Fitness
  "lunge": "https://www.youtube.com/watch?v=3XDriUn0udo", // Mind Pump TV
  "lying leg curl": "https://www.youtube.com/watch?v=vl5nUdE9mWM", // Physique Development
  "lying tricep extension": "https://www.youtube.com/watch?v=4re6CJ0XNF8", // Bodybuilding.com
  "machine lateral raise": "https://www.youtube.com/watch?v=NNAs8jx_zJI", // Colossus Fitness
  "machine shoulder press": "https://www.youtube.com/watch?v=3R14MnZbcpw", // Colossus Fitness
  "one arm push ups": "https://www.youtube.com/watch?v=JiHkxqbhNuw", // Bodybuilding.com
  "overhead squat": "https://www.youtube.com/watch?v=TUtBNkk_lio", // Mind Pump TV
  "pause squat": "https://www.youtube.com/watch?v=JkwJ3LlFE7M", // Juggernaut Training Systems
  "pendlay row": "https://www.youtube.com/watch?v=axoeDmW0oAY", // Jeff Nippard
  "pike push up": "https://www.youtube.com/watch?v=DG-NcMnfZ_0", // FitnessFAQs
  "pistol squat": "https://www.youtube.com/watch?v=vq5-vdgJc0I", // Squat University
  "plank": "https://www.youtube.com/watch?v=A2b2EmIg0dA", // E3 Rehab
  "power snatch": "https://www.youtube.com/watch?v=uyY_ySdN6OU", // Starting Strength
  "push jerk": "https://www.youtube.com/watch?v=Om7vLD6x8W0", // Catalyst Athletics
  "push press": "https://www.youtube.com/watch?v=yklSQG1_Ovc", // Catalyst Athletics
  "push ups": "https://www.youtube.com/watch?v=i9sTjhN4Z3M", // Mind Pump TV
  "rack pull": "https://www.youtube.com/watch?v=aAjN8zS7Idg", // Buff Dudes Workouts
  "reverse barbell curl": "https://www.youtube.com/watch?v=didEQUuieRQ", // ScottHermanFitness
  "russian twist": "https://www.youtube.com/watch?v=fCHFQTBqm-U", // Colossus Fitness
  "safety bar squat": "https://www.youtube.com/watch?v=B3LpibMixF0", // Juggernaut Training Systems
  "seated calf raise": "https://www.youtube.com/watch?v=6O5hh1rBtx8", // Colossus Fitness
  "seated leg curl": "https://www.youtube.com/watch?v=ELOCsoDSmrg", // ScottHermanFitness
  "side crunch": "https://www.youtube.com/watch?v=CMJA332bfs0", // ScottHermanFitness
  "side lunge": "https://www.youtube.com/watch?v=liFeq7swKfc", // Mind Pump TV
  "single leg press": "https://www.youtube.com/watch?v=x4vaHXRfKrg", // Colossus Fitness
  "single leg romanian deadlift": "https://www.youtube.com/watch?v=Zfr6wizR8rs", // Squat University
  "sissy squat": "https://www.youtube.com/watch?v=Kwcpzy1C6UE", // FitnessFAQs
  "skull crushers": "https://www.youtube.com/watch?v=d_KZxkY_0cM", // ScottHermanFitness
  "smith machine bench press": "https://www.youtube.com/watch?v=z_r6hDOYtO0", // ScottHermanFitness
  "smith machine squat": "https://www.youtube.com/watch?v=fEuYM-miK5U", // Renaissance Periodization
  "snatch": "https://www.youtube.com/watch?v=0GIumbHwfh8", // Garage Strength
  "snatch deadlift": "https://www.youtube.com/watch?v=GP6VNoIZyF4", // Alan Thrall (Untamed Strength)
  "spider curl": "https://www.youtube.com/watch?v=CITtSuda0Fg", // ScottHermanFitness
  "split jerk": "https://www.youtube.com/watch?v=P7p9TLBA1lA", // Sonny Webster
  "spoto press": "https://www.youtube.com/watch?v=wgd4zSPmwZM", // Juggernaut Training Systems
  "standing calf raise": "https://www.youtube.com/watch?v=SVtg-1loH4c", // Colossus Fitness
  "standing leg curl": "https://www.youtube.com/watch?v=Z053-kKjesQ", // ScottHermanFitness
  "stiff leg deadlift": "https://www.youtube.com/watch?v=AH7gaaT_tU8", // Alan Thrall (Untamed Strength)
  "straight arm pulldown": "https://www.youtube.com/watch?v=WDOV2PDpkiU", // Colossus Fitness
  "sumo deadlift": "https://www.youtube.com/watch?v=Ov1AyFVEZws", // Juggernaut Training Systems
  "superman": "https://www.youtube.com/watch?v=UXUGfiNL1lI", // Colossus Fitness
  "t bar row": "https://www.youtube.com/watch?v=j3Igk5nyZE4", // ScottHermanFitness
  "tate press": "https://www.youtube.com/watch?v=IgSjoXbpy1M", // ScottHermanFitness
  "tricep pushdown": "https://www.youtube.com/watch?v=_w-HpW70nSQ", // ScottHermanFitness
  "upright row": "https://www.youtube.com/watch?v=p6kSTMid-S8", // Colossus Fitness
  "walking lunge": "https://www.youtube.com/watch?v=Pbmj6xPo-Hw", // Buff Dudes Workouts
  "z press": "https://www.youtube.com/watch?v=0fHdnBH9Gdo", // Buff Dudes Workouts
  "zercher squat": "https://www.youtube.com/watch?v=Da75bVCfTNo", // Buff Dudes
  "zottman curl": "https://www.youtube.com/watch?v=D7bMA4WEKMI", // Buff Dudes Workouts

  // --- A second sweep, after the channel list and the implement rule were
  //     found to be refusing good videos rather than bad ones. Five more were
  //     dropped by hand for the same reason as before: "How 100 Bodyweight
  //     Squats Changes the Human Physique" and "Deficit Deadlifts | Benefits,
  //     Who Should Use Them" are about whether to do the lift, not how.
  "belt squat": "https://www.youtube.com/watch?v=h_ok0J0y5j4", // Juggernaut Training Systems
  "bent over row": "https://www.youtube.com/watch?v=FWJR5Ve8bnQ", // Max Euceda
  "bicycle crunch": "https://www.youtube.com/watch?v=1we3bh9uhqY", // Tone and Tighten
  "burpees": "https://www.youtube.com/watch?v=mUYJqe_sJFE", // Minus The Gym
  "cable upright row": "https://www.youtube.com/watch?v=DU1vCuZkNkg", // Jim Stoppani, PhD
  "close grip push up": "https://www.youtube.com/watch?v=G2mlaEfpEIM", // Howcast
  "diamond push ups": "https://www.youtube.com/watch?v=kGhDnFwMY3E", // Minus The Gym
  "dumbbell clean and press": "https://www.youtube.com/watch?v=8G-jnVP_f2s", // Live Lean TV Daily Exercises
  "dumbbell high pull": "https://www.youtube.com/watch?v=eO-UIN-qTOQ", // Live Lean TV Daily Exercises
  "dumbbell romanian deadlift": "https://www.youtube.com/watch?v=FQKfr1YDhEk", // ScottHermanFitness
  "dumbbell side bend": "https://www.youtube.com/watch?v=dL9ZzqtQI5c", // Howcast
  "dumbbell tricep extension": "https://www.youtube.com/watch?v=_gsUck-7M74", // Howcast
  "hang clean": "https://www.youtube.com/watch?v=QCQuZITCnPk", // TOROKHTIY
  "horizontal leg press": "https://www.youtube.com/watch?v=QQEW__B5y9I", // Fitness Lab
  "incline bench press": "https://www.youtube.com/watch?v=VFbjmiAAwJE", // Jim Stoppani, PhD
  "incline dumbbell bench press": "https://www.youtube.com/watch?v=IP4oeKh1Sd4", // Max Euceda
  "jm press": "https://www.youtube.com/watch?v=hOCW9cE-GJg", // elitefts
  "lying leg raise": "https://www.youtube.com/watch?v=xqTh6NqbAtM", // HASfit
  "machine seated crunch": "https://www.youtube.com/watch?v=CNHS2OoUi30", // Live Lean TV Daily Exercises
  "meadows row": "https://www.youtube.com/watch?v=G-jU1aPVhnY", // mountaindog1
  "mountain climbers": "https://www.youtube.com/watch?v=De3Gl-nC7IQ", // Nick Tumminello - Trainer of Trainers
  "preacher curl": "https://www.youtube.com/watch?v=vngli9UR6Hw", // Jim Stoppani, PhD
  "scissor kicks": "https://www.youtube.com/watch?v=bUJnyVsa3Ak", // FitnessBlender
  "seated dip machine": "https://www.youtube.com/watch?v=Zg0tT27iYuY", // Fitness Lab
  "seated dumbbell shoulder press": "https://www.youtube.com/watch?v=rO_iEImwHyo", // Max Euceda
  "sit ups": "https://www.youtube.com/watch?v=s3PPU_2z9qo", // Live Lean TV
  "smith machine shrug": "https://www.youtube.com/watch?v=g00nZdE6_Ro", // Live Lean TV Daily Exercises
  "snatch pull": "https://www.youtube.com/watch?v=hi9M6V83j9U", // TOROKHTIY
  "standing cable crunch": "https://www.youtube.com/watch?v=vFV78ASgsak", // Jim Stoppani, PhD
  "thruster": "https://www.youtube.com/watch?v=Zvt5-mugUco", // Bodybuilding.com
  "wrist curl": "https://www.youtube.com/watch?v=NoO4ol8Zw2I", // Jim Stoppani, PhD
  "yates row": "https://www.youtube.com/watch?v=ryxwNKu23OQ", // Geoffrey Verity Schofield

  // --- A third sweep, once the finder tried more than one phrasing per
  //     movement. Twelve of the thirty-two it returned were dropped by hand,
  //     and one of those is the reason the finder now refuses a whole class
  //     of title: "Jump Squats Are a Poor Exercise Choice" passed every gate
  //     for our Squat Jump. Tapping Watch Form Guide on an exercise your own
  //     programme set you, and being told by an expert that it is a bad
  //     exercise, is worse than getting nothing.
  "archer push ups": "https://www.youtube.com/watch?v=ZLWko5aP1FM", // Minus The Gym
  "cheat curl": "https://www.youtube.com/watch?v=nYH4ziK1TEU", // Garage Strength
  "close grip dumbbell bench press": "https://www.youtube.com/watch?v=ai38JOlGtZM", // Jim Stoppani, PhD
  "decline dumbbell fly": "https://www.youtube.com/watch?v=J6f2WctUduQ", // Ignore Limits
  "dumbbell thruster": "https://www.youtube.com/watch?v=SnHdBY_sK6M", // Howcast
  "handstand push ups": "https://www.youtube.com/watch?v=IQvCU0kLvds", // FitnessFAQs
  "hang power clean": "https://www.youtube.com/watch?v=efHjodEVf9w", // Catalyst Athletics
  "hip abduction": "https://www.youtube.com/watch?v=2b97cvyH9sE", // ScottHermanFitness
  "incline cable curl": "https://www.youtube.com/watch?v=CxXEXInM_L0", // Jim Stoppani, PhD
  "incline hammer curl": "https://www.youtube.com/watch?v=FdzmJiIHIPw", // mountaindog1
  "incline push up": "https://www.youtube.com/watch?v=bXsbK9UPu3c", // Howcast
  "log press": "https://www.youtube.com/watch?v=NHnW3xIW334", // elitefts
  "machine shrug": "https://www.youtube.com/watch?v=q5f7ByER6dE", // Colossus Fitness
  "pin squat": "https://www.youtube.com/watch?v=3GjKE-OkLyY", // Catalyst Athletics
  "renegade row": "https://www.youtube.com/watch?v=eGhLfe0feEs", // Mind Pump TV
  "reverse lunge": "https://www.youtube.com/watch?v=AVJSd7M_ugY", // mountaindog1
  "seated shoulder press": "https://www.youtube.com/watch?v=YNK3eQVevIs", // Buff Dudes Workouts
  "side leg raise": "https://www.youtube.com/watch?v=izV5th7AQHM", // Howcast
  "split squat": "https://www.youtube.com/watch?v=4bNQITw0VdY", // E3 Rehab
  "vertical leg press": "https://www.youtube.com/watch?v=Nxl8X6zjsrc", // Fitness Lab
};

/**
 * The same movement under another name.
 *
 * DELIBERATELY TINY, and it must stay that way. The temptation is to point
 * "Close Grip Lat Pulldown" at the lat pulldown video, "Reverse Grip Bench
 * Press" at the bench press, "Split Squat" at the Bulgarian — and every one of
 * those would be showing somebody a DIFFERENT exercise while claiming it is a
 * guide to theirs. That is the exact failure the matcher refuses ninety times
 * over; doing it by hand here would be worse, not better, because a
 * hand-written map looks deliberate.
 *
 * So the bar is: could the two names sit on the same video's title without
 * anybody blinking? A military press IS the barbell overhead press. A sled leg
 * press IS the leg press. A single leg squat IS the pistol squat. Nothing that
 * needs a "well, roughly" goes here.
 */
const SAME_MOVEMENT: Record<string, string> = {
  "shoulder press": "barbell overhead press",
  "military press": "barbell overhead press",
  "sled leg press": "leg press",
  "single leg squat": "pistol squat",
};

/**
 * Names too thin to search usefully.
 *
 * "Circuit", "session", a single letter — a YouTube search for those returns
 * everything, which is the same as returning nothing while looking like it
 * worked. Better to say plainly that there is no guide.
 */
const UNSEARCHABLE = /^(?:[a-z]{1,3}|circuit|session|workout|training|drills?|warm.?up|cool.?down|stretching|other|misc)$/i;

/** Where to send somebody who wants to watch this movement done properly. */
export function formGuide(name: string): FormGuide | null {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return null;

  const key = clean.toLowerCase();
  const chosen = CURATED[key] ?? CURATED[SAME_MOVEMENT[key] ?? ""];
  if (chosen) {
    return { url: chosen, kind: "video", label: "Watch Form Guide", videoId: idOf(chosen) ?? undefined };
  }

  if (UNSEARCHABLE.test(clean)) return null;

  // "proper form" rather than the bare name: the name alone returns workout
  // montages set to music, which demonstrate nothing.
  const query = encodeURIComponent(`${clean} proper form technique`);
  return {
    url: `https://www.youtube.com/results?search_query=${query}`,
    kind: "search",
    label: "Watch Form Guide",
  };
}

/** What to say when there is nothing worth linking to. */
export const NO_GUIDE = "No video guide available for this exercise";

/** How many movements have a hand-picked video rather than a search. */
export function curatedCount(): number {
  return Object.keys(CURATED).length;
}
