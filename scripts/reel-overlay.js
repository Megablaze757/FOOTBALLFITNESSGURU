/**
 * =============================================================================
 * THE CAPTION LAYER, DRAWN INTO THE PAGE BEING RECORDED.
 *
 * PLAIN JAVASCRIPT IN ITS OWN FILE, AND THAT IS NOT A STYLE CHOICE. This is
 * handed to Playwright's addInitScript to run inside the browser. Written
 * inline in the TypeScript recorder it was transpiled by tsx first, and esbuild
 * wraps named functions in a `__name(...)` helper it defines in the MODULE
 * scope — which does not exist in the page. The result was
 * "__name is not defined", thrown before a single line of the overlay ran, and
 * then "window.__reelHook is not a function" one step later, which points at
 * the wrong thing entirely.
 *
 * A separate .js file is never transpiled, so what is written here is what runs.
 *
 * Installed on EVERY document: the app navigates between beats and a static
 * export serves each route as its own document, so anything appended to the
 * previous one is gone.
 * =============================================================================
 */
(() => {
  var install = function () {
    if (!document.body || document.getElementById("__reel_layer")) return;

    var layer = document.createElement("div");
    layer.id = "__reel_layer";
    // The ceiling of the z-index range, and pointer-events:none — it has to sit
    // over everything the app draws and interfere with nothing Playwright does.
    layer.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;"
      + "display:flex;flex-direction:column;justify-content:flex-end;align-items:center;"
      + "padding:0 28px 22%;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;";

    var caption = document.createElement("div");
    caption.id = "__reel_caption";
    /**
     * 22% up from the bottom, not against it.
     *
     * TikTok and Instagram draw their own caption, handle and buttons over the
     * lower fifth of the frame. A caption under that is a caption nobody reads
     * — and it cannot be fixed after the video is made.
     */
    caption.style.cssText =
      /**
       * ═══════════════════════════════════════════════════════════════════
       * POSITIONED, OR THE SPOTLIGHT DIMS THE WORDS IT IS POINTING WITH.
       *
       * This was a plain flex child with no `position`, and the spotlight's
       * dim panels are `position:fixed`. CSS paints POSITIONED elements above
       * every non-positioned one in the same stacking context, and DOM order
       * only ranks elements within the same phase — so the panels covered the
       * caption no matter where in the layer the spot was inserted. The
       * insertBefore that was supposed to prevent this, and the comment on it
       * saying the caption "is never dimmed by it", were both doing nothing.
       *
       * Measured on the recorded reel: caption text averaged 79 of 255 on the
       * two spotlight beats and 149 on the beats without one. Those two are
       * the reveals — "Cheapest: 31p", "Dearest: £3.19" — so the shots the
       * whole reel is built around were the ones with a half-lit caption.
       *
       * The hook never had this: its wrapper is already `position:fixed`,
       * which is why it looked right and the captions did not.
       * ═══════════════════════════════════════════════════════════════════
       */
      "position:relative;z-index:1;"
      /**
       * ═══════════════════════════════════════════════════════════════════
       * OUTLINE, NOT A BOX. "CAPTIONS SHOULD BE BRIGHT."
       *
       * The caption was white on an OPAQUE near-black pill, and the pill was
       * the right answer to the wrong question. It got there by fixing a
       * translucent fill that vanished on the app's own dark ground — but the
       * property that actually makes a caption work on any background is a
       * heavy outline on the GLYPHS, which is why every short-form caption
       * preset uses one and none of them use a box.
       *
       * A box is a black rectangle over a fifth of the frame. The reel is an
       * app demo; the rectangle is sitting on the app.
       *
       * WHY text-shadow AND NOT -webkit-text-stroke: a text-stroke is centred
       * on the glyph outline, so half of a 4px stroke eats into the letter and
       * thin strokes close up. paint-order:stroke fill fixes that and is a
       * thing to be right about in a browser nobody will re-check. Twelve
       * shadows on a circle is the technique that has always worked, and it
       * paints behind the fill by definition.
       *
       * 46px CSS at deviceScaleFactor 2 is 92px on the 1080x1920 file — inside
       * the 80-120px band the caption presets specify, where it was at 80.
       *   — ascynd.io/en/blog/why-hormozi-captions-get-more-views
       *   — opus.pro/blog/best-caption-presets-styles-boost-retention
       *
       * NOT ALL-CAPS, and that is a departure worth stating rather than
       * hiding: the same guidance says caps, and it says caps alongside ONE
       * TO THREE WORDS a caption. These captions are phrases, because a
       * phrase is what lib/caption-lines.ts times and what a mute viewer of an
       * APP demo needs — and a 42-character phrase set in 92px caps is three
       * tall lines climbing into the screen the reel is meant to be showing.
       * Taking half of a preset is how you get the worst of it.
       * ═══════════════════════════════════════════════════════════════════
       */
      + "max-width:100%;text-align:center;font-size:46px;line-height:1.2;font-weight:900;"
      + "letter-spacing:-0.01em;"
      + "color:#fff;"
      + "text-shadow:4px 0px 0 #000,3.5px 2px 0 #000,2px 3.5px 0 #000,0px 4px 0 #000,-2px 3.5px 0 #000,-3.5px 2px 0 #000,-4px 0px 0 #000,-3.5px -2px 0 #000,-2px -3.5px 0 #000,-0px -4px 0 #000,2px -3.5px 0 #000,3.5px -2px 0 #000,0 2px 14px rgba(0,0,0,0.9),0 10px 30px rgba(0,0,0,0.55);"
      + "opacity:0;transition:opacity 120ms linear;";
    layer.appendChild(caption);

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * THE HOOK SITS OVER THE APP. IT DOES NOT REPLACE IT.
     *
     * This was `inset:0` with `background:rgba(6,6,8,0.93)` — a 93% opaque
     * black card across the whole frame for the first 1.6 seconds. The reel
     * therefore opened as a TITLE SLIDE: no product, no movement, nothing to
     * look at but a sentence, in the one second where a scroller decides.
     * Instagram reported a 91.7% skip rate on it, higher than typical, and
     * listed skip rate first as the thing that most affects reach.
     *
     * A pill instead of a blackout: the words stay legible on this app's light
     * pages, and the ranked table the hook is ABOUT is visible behind them from
     * the first frame — already showing £0.31 at the top and £3.19 at the
     * bottom, which is the entire claim the hook makes.
     * ═══════════════════════════════════════════════════════════════════════
     */
    var hookWrap = document.createElement("div");
    hookWrap.id = "__reel_hook_wrap";
    /**
     * BELOW THE NUMBERS IT IS TALKING ABOUT.
     *
     * At 13% the pill sat squarely over the £0.31 / £3.19 / 10.2x cards — so
     * the hook claiming "same protein, 10x the price" covered the three
     * figures that prove it. 42% puts it over the paragraph beneath them,
     * leaving the proof visible above and clearing the caption band below.
     */
    hookWrap.style.cssText =
      // z-index alongside the caption's, so both sit above the dim panels for
      // the same stated reason rather than one of them by accident.
      "position:fixed;z-index:1;left:0;right:0;top:42%;display:flex;justify-content:center;"
      + "padding:0 30px;pointer-events:none;";

    var hook = document.createElement("div");
    hook.id = "__reel_hook";
    hook.style.cssText =
      "max-width:100%;font-size:64px;line-height:1.08;font-weight:900;text-align:center;"
      /**
       * SAME OUTLINE, SAME REASON AS THE CAPTION ABOVE — and one more that
       * belongs to the hook alone.
       *
       * The note above this element records the whole history: a 93% opaque
       * blackout across the frame, a 91.7% skip rate, then a pill so the
       * ranked table would show behind it. The pill was the second step of
       * that argument and this is the third. The hook is the first 1.6
       * seconds; every pixel of it that is a black slab is a pixel not
       * showing the thing being claimed.
       *
       * A wider ring than the caption because the type is larger: both are
       * about 8% of the font size, which is where the presets put it.
       */
      + "color:#fff;"
      + "text-shadow:5px 0px 0 #000,4.3px 2.5px 0 #000,2.5px 4.3px 0 #000,0px 5px 0 #000,-2.5px 4.3px 0 #000,-4.3px 2.5px 0 #000,-5px 0px 0 #000,-4.3px -2.5px 0 #000,-2.5px -4.3px 0 #000,-0px -5px 0 #000,2.5px -4.3px 0 #000,4.3px -2.5px 0 #000,0 3px 18px rgba(0,0,0,0.9),0 12px 40px rgba(0,0,0,0.6);"
      + "opacity:0;transition:opacity 120ms linear;";
    hookWrap.appendChild(hook);
    layer.appendChild(hookWrap);

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * THE SPOTLIGHT. "The app demo isn't clear what's what."
     *
     * A reel shows a whole app screen — a ring, four macro rows, a coaching
     * paragraph, a nav bar — while the voice talks about one of them, and
     * nothing on screen says which. The viewer spends the shot hunting for the
     * thing being described, and mostly does not find it before the cut.
     *
     * So the script can point. Four dim panels around the element and a bright
     * outline on it: everything else recedes, the eye lands in one movement,
     * and it still reads at the size a reel is actually watched.
     *
     * FOUR PANELS RATHER THAN A CLIP-PATH: a box-shadow spread or an SVG mask
     * both work, and both are one property away from dimming the wrong side of
     * the hole. Four rectangles cannot be ambiguous about which side is dark.
     */
    var spot = document.createElement("div");
    spot.id = "__reel_spot";
    spot.style.cssText = "position:fixed;inset:0;pointer-events:none;opacity:0;"
      + "transition:opacity 220ms linear;";
    ["t", "b", "l", "r"].forEach(function (side) {
      var panel = document.createElement("div");
      panel.setAttribute("data-side", side);
      panel.style.cssText = "position:fixed;background:rgba(4,4,6,0.72);";
      spot.appendChild(panel);
    });
    var ring = document.createElement("div");
    ring.id = "__reel_ring";
    ring.style.cssText = "position:fixed;border:3px solid rgba(227,181,63,0.95);"
      + "border-radius:16px;box-shadow:0 0 0 2px rgba(0,0,0,0.35),0 8px 40px rgba(0,0,0,0.5);";
    spot.appendChild(ring);
    /**
     * First in the layer AND below it in z-index. The DOM order alone did
     * nothing — see the caption's own note — so the z-index on the caption
     * and the hook is what actually keeps them above the dimming. This stays
     * because a reader expecting paint order to follow the document should
     * not find the spotlight last.
     */
    layer.insertBefore(spot, layer.firstChild);

    // documentElement, not body: a page that replaces its own body mid-render
    // would take the overlay with it.
    document.documentElement.appendChild(layer);
  };

  var set = function (id, text) {
    install();
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.opacity = text ? "1" : "0";
  };

  /**
   * Find what the beat is about, BY ITS VISIBLE TEXT.
   *
   * Not a CSS selector: a selector is a promise about markup this script does
   * not own, and it breaks silently the next time a class is renamed. The
   * words on screen are the same words the script is already talking about.
   */
  var findByText = function (needle, anywhere) {
    var want = String(needle || "").trim().toLowerCase();
    if (!want) return null;
    var all = document.querySelectorAll("body *");
    var best = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      /**
       * THE ACCESSIBLE NAME COUNTS AS TEXT.
       *
       * This read textContent only, and the readiness gauge is an <svg> whose
       * name lives in aria-label — "Readiness ready, 54 of 100". So the one
       * beat whose whole job is to point at that number could never find it,
       * and said so in the run log while the reel went out with no spotlight
       * on the reveal.
       *
       * An aria-label is a deliberate, human-written name for something on
       * screen, which is exactly what this is looking for. A drawing that
       * names itself is not a special case; it is the case.
       */
      var text = ((el.textContent || "") + " " + (el.getAttribute("aria-label") || ""))
        .trim().toLowerCase();
      if (text.indexOf(want) === -1) continue;
      var box = el.getBoundingClientRect();
      if (box.width < 40 || box.height < 16) continue;
      // Off screen entirely is not what the shot is pointing at — unless we
      // are looking for something to scroll TO, which is the whole point.
      if (!anywhere && (box.bottom < 0 || box.top > window.innerHeight)) continue;
      // The SMALLEST element that still contains the words: every ancestor
      // contains them too, and <body> is not a spotlight.
      if (!best || box.width * box.height < best.box.width * best.box.height) {
        best = { el: el, box: box };
      }
    }
    return best;
  };

  /**
   * Put the panels and the ring around one element, as it is RIGHT NOW.
   *
   * Split out of __reelFocus so the frame loop below can call it again — the
   * measurement is the part that goes stale, and the search is the part that
   * must not be repeated (findByText picks the smallest element containing the
   * words, and a re-search mid-beat could pick a different one).
   */
  var place = function (el) {
    var spot = document.getElementById("__reel_spot");
    if (!spot || !el) return false;
    var b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) { spot.style.opacity = "0"; return false; }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * DIVIDED BY THE ZOOM, and this was wrong until it was measured.
     *
     * The recorder zooms documentElement so a 1080x1920 viewport still lays
     * out as a 540px phone. getBoundingClientRect and window.innerHeight both
     * report VISUAL pixels — the full 1920 — but this overlay lives inside the
     * zoomed element, so a CSS pixel it sets is multiplied by the zoom on the
     * way to the screen.
     *
     * Setting top to a visual 750 therefore drew the ring at 1500, and
     * anything below the top of the screen landed off-frame entirely. Measured
     * on the live page: styleTop 1483px produced a rect at 2966px, in a
     * viewport 1920 tall.
     *
     * A spotlight in the wrong place is worse than none, and nothing would
     * have caught it except watching the reel.
     * ═══════════════════════════════════════════════════════════════════════
     */
    var zoom = parseFloat(window.getComputedStyle(document.documentElement).zoom) || 1;
    var pad = 12;
    var top = Math.max(0, b.top - pad) / zoom;
    var left = Math.max(0, b.left - pad) / zoom;
    var right = Math.min(window.innerWidth, b.right + pad) / zoom;
    var bottom = Math.min(window.innerHeight, b.bottom + pad) / zoom;

    var panels = spot.querySelectorAll("[data-side]");
    var put = function (node, css) { node.style.cssText += ";" + css; };
    for (var i = 0; i < panels.length; i++) {
      var side = panels[i].getAttribute("data-side");
      if (side === "t") put(panels[i], "left:0;top:0;width:100%;height:" + top + "px;");
      // 100%, bottom:0 and right:0 are relative to the zoomed box and need no
      // conversion; only the measured numbers above do.
      if (side === "b") put(panels[i], "left:0;top:" + bottom + "px;width:100%;bottom:0;height:auto;");
      if (side === "l") put(panels[i], "left:0;top:" + top + "px;width:" + left + "px;height:" + (bottom - top) + "px;");
      if (side === "r") put(panels[i], "left:" + right + "px;top:" + top + "px;right:0;width:auto;height:" + (bottom - top) + "px;");
    }
    var ring = document.getElementById("__reel_ring");
    ring.style.cssText += ";left:" + left + "px;top:" + top + "px;width:"
      + (right - left) + "px;height:" + (bottom - top) + "px;";
    spot.style.opacity = "1";
    return true;
  };

  /**
   * Point at something, or at nothing.
   *
   * An empty string clears it. Text that is not on screen ALSO clears it
   * rather than dimming the whole frame — a spotlight on nothing is worse than
   * no spotlight, and it would be invisible until somebody watched the reel.
   */
  window.__reelFocus = function (needle) {
    install();
    var spot = document.getElementById("__reel_spot");
    if (!spot) return false;
    if (!needle) { tracking = null; spot.style.opacity = "0"; return false; }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * SCROLL TO IT FIRST. A spotlight only helps if the thing is on screen.
     *
     * findByText deliberately ignores anything outside the viewport, and the
     * shot drifts down the page as a beat plays — so by the time the reveal
     * arrived, the row it was meant to ring had scrolled past and the
     * spotlight correctly did nothing. The reel showed the page FOOTER under
     * the words "Cheapest: £0.31."
     *
     * Naming a focus is the script saying "this is the shot". So it moves the
     * shot: instant rather than smooth, because the beat's timing is already
     * fixed against the audio and a 400ms glide would eat the reveal.
     * ═══════════════════════════════════════════════════════════════════════
     */
    var anywhere = findByText(needle, true);
    if (anywhere) {
      var box = anywhere.el.getBoundingClientRect();
      /**
       * ═══════════════════════════════════════════════════════════════════
       * ABOVE THE CAPTION, NOT IN THE MIDDLE OF THE FRAME.
       *
       * Centring put the readiness gauge dead centre, and the caption owns
       * the bottom third — so the score, the one thing the reveal exists to
       * show, sat behind the words describing it. Recorded twice and looked
       * at both times: the ring was around the dial and the number was under
       * the caption.
       *
       * FOCUS_AT is where a focused thing should sit. Everything below about
       * 68% of the frame is caption, so the target is placed in the upper
       * middle and its lower half still lands clear.
       * ═══════════════════════════════════════════════════════════════════
       */
      var FOCUS_AT = 0.36;
      var centred = window.scrollY + box.top - (window.innerHeight * FOCUS_AT) + (box.height / 2);
      window.scrollTo({ top: Math.max(0, centred), behavior: "instant" });
    }

    var found = findByText(needle);
    if (!found) { tracking = null; spot.style.opacity = "0"; return false; }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * AN ACCESSIBLE NAME NAMES A COMPONENT, NOT AN ELEMENT.
     *
     * The readiness gauge is an <svg> carrying aria-label "Readiness ready,
     * 44 of 100". The SCORE is not inside it — it is a sibling <div> under
     * the drawing. So the ring enclosed the arc and a strip of empty space
     * above it, while the number the whole beat is about sat outside the
     * ring, dimmed, behind the caption. Recorded and looked at: it reads as a
     * highlight around nothing.
     *
     * A drawing that names itself is naming the thing it is part of. Ringing
     * the parent gets the picture and its number, which is what the viewer is
     * being pointed at. Only for a graphic: a text match is already the
     * smallest element containing the words, and widening that would ring a
     * container instead of a row.
     * ═══════════════════════════════════════════════════════════════════════
     */
    if (found.el.tagName && found.el.tagName.toLowerCase() === "svg" && found.el.parentElement) {
      var whole = found.el.parentElement.getBoundingClientRect();
      if (whole.width > 0 && whole.height > 0) found = { el: found.el.parentElement, box: whole };
    }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * DIVIDED BY THE ZOOM, and this was wrong until it was measured.
     *
     * The recorder zooms documentElement so a 1080x1920 viewport still lays
     * out as a 540px phone. getBoundingClientRect and window.innerHeight both
     * report VISUAL pixels — the full 1920 — but this overlay lives inside the
     * zoomed element, so a CSS pixel it sets is multiplied by the zoom on the
     * way to the screen.
     *
     * Setting top to a visual 750 therefore drew the ring at 1500, and
     * anything below the top of the screen landed off-frame entirely. Measured
     * on the live page: styleTop 1483px produced a rect at 2966px, in a
     * viewport 1920 tall.
     *
     * A spotlight in the wrong place is worse than none, and nothing would
     * have caught it except watching the reel.
     * ═══════════════════════════════════════════════════════════════════════
     */
    place(found.el);
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * THE RING FOLLOWS ITS TARGET. IT IS NOT A RECTANGLE DRAWN ONCE.
     *
     * Recorded, extracted at two seconds apart, and looked at: at 12s the ring
     * enclosed the gauge and "44 RED" exactly. At 15s, same beat, same shot,
     * the number was BELOW the ring and dimmed — the one figure the reveal
     * exists to show, greyed out by the thing pointing at it.
     *
     * Nothing scrolled. The week strip above the gauge finished loading and
     * got taller, and everything under it moved down 94 pixels. The ring is
     * position:fixed and was computed once, so the page slid out from under
     * it while the shot itself held perfectly still.
     *
     * The drift already had this exact failure — a ring around the wrong row —
     * and was fixed by not drifting on an aimed beat. That fixed the scroll
     * and could never have fixed this one: async data, a lazy image, a
     * transition, anything that changes layout after the aim. All of them look
     * identical to the viewer and none of them are scrolling.
     *
     * A frame loop is the version that cannot be wrong about any of them.
     * "A composed shot holds still" is about the CAMERA, and the camera does:
     * this moves the annotation, not the shot.
     * ═══════════════════════════════════════════════════════════════════════
     */
    tracking = found.el;
    if (!ticking) { ticking = true; requestAnimationFrame(follow); }
    return true;
  };

  /** The element the spotlight is on, followed until it is cleared. */
  var tracking = null;
  var ticking = false;

  var follow = function () {
    if (!tracking) { ticking = false; return; }
    place(tracking);
    requestAnimationFrame(follow);
  };

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ONE COLOURED WORD, DECIDED IN NODE AND RENDERED HERE.
   *
   * Colour is a pre-attentive feature: a uniquely coloured item is located in
   * roughly constant time however much else is on screen, without the viewer
   * scanning for it. A caption is up for under two seconds and most of the
   * audience has the sound off, so the eye gets one movement — this makes it
   * land on "£0.31" rather than on "from".
   *
   * The RULE lives in lib/caption-emphasis.ts where it can be tested; this
   * only draws what it is handed. A string still works, so anything that has
   * not been updated keeps rendering plain white.
   *
   * ─────────────────────────────────────────────────────────────────────
   * WORD BY WORD, AND BRIGHTER THAN THE BRAND.
   *
   * This drew a static line with one word in accent-400 — the app's own
   * colour, chosen deliberately over "the generic yellow every reel uses".
   * That decision is reversed on purpose. The measured caption style for this
   * format is a word-by-word highlight in a HIGH-SATURATION colour, reported
   * at a 12-25% lift in average watch time, and the reason the generic yellow
   * is generic is that it survives whatever the app is showing behind it. A
   * muted gold is the better brand colour and the worse caption.
   *
   * accent-400 measured 10.3:1 on this pill; #FFE81A measures higher still,
   * so nothing is given up on legibility to gain it.
   *
   * Two emphases, two jobs — see lib/caption-karaoke.ts. The figure is
   * coloured the whole time because colour is found without scanning; the
   * sweep is about pacing, so the viewer never has to work out where the
   * voice is. The active word also grows slightly, because colour alone
   * cannot mark the one word that is already coloured.
   * ═══════════════════════════════════════════════════════════════════════
   */
  var HIGHLIGHT = "rgb(255,232,26)";
  var captionTimers = [];

  var clearTimers = function () {
    for (var i = 0; i < captionTimers.length; i++) clearTimeout(captionTimers[i]);
    captionTimers = [];
  };

  window.__reelCaption = function (value) {
    install();
    var el = document.getElementById("__reel_caption");
    if (!el) return;
    // Any previous line's sweep is cancelled before the next is drawn, or a
    // word from the caption before last lights up under the current one.
    clearTimers();
    if (typeof value === "string") { set("__reel_caption", value); return; }

    var words = value || [];
    el.textContent = "";
    var spans = [];
    for (var i = 0; i < words.length; i++) {
      if (i) el.appendChild(document.createTextNode(" "));
      var span = document.createElement("span");
      span.textContent = words[i].text;
      span.style.cssText = "display:inline-block;transition:color 90ms linear,transform 90ms linear;"
        + "color:" + (words[i].key ? HIGHLIGHT : "#fff") + ";";
      el.appendChild(span);
      spans.push(span);
    }
    el.style.opacity = words.length ? "1" : "0";

    // One timer per word rather than a per-frame poll: the browser is also
    // running a screen recording, and this is the cheaper of the two.
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * THE SWEEP PUT THE WHOLE LINE YELLOW AND LEFT IT THERE.
     *
     * Only the transform was ever undone. Every word the sweep touched kept
     * HIGHLIGHT, so a seven-word caption finished as seven yellow words — and
     * the comment above, which says the FIGURE is coloured the whole time
     * "because colour is found without scanning", described a uniqueness the
     * code destroyed one word at a time. By the end of the line the £0.31 the
     * whole reel is about was the same colour as "the".
     *
     * The colour goes back to the word's own base now. A key word's base IS
     * the highlight, so it is yellow throughout and everything else is yellow
     * only while it is being said — which is what makes the yellow mean
     * "here" rather than "read so far".
     * ═══════════════════════════════════════════════════════════════════════
     */
    for (var j = 0; j < words.length; j++) {
      (function (span, previous, previousBase) {
        captionTimers.push(setTimeout(function () {
          if (previous) {
            previous.style.transform = "none";
            previous.style.color = previousBase;
          }
          span.style.color = HIGHLIGHT;
          span.style.transform = "scale(1.1)";
        }, words[j].at));
      })(spans[j], j ? spans[j - 1] : null, j && words[j - 1].key ? HIGHLIGHT : "#fff");
    }
  };
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DOING SOMETHING, SO THE REEL SHOWS IT HAPPENING.
   *
   * "The videos should actually show them doing the stuff." Every beat used
   * to navigate and scroll, and the app's own numbers only ever appeared
   * already-computed. Filling the check-in on camera and letting the
   * readiness score move is the difference between saying a thing reacts to
   * you and showing it.
   *
   * FOUND BY LABEL, not by selector — the same reason Beat.focus is text.
   * The label, placeholder, aria-label and neighbouring text are all tried,
   * because a form in this app labels its fields in all four ways.
   *
   * Returns false rather than throwing when nothing matches: the recorder
   * turns that into a loud warning, and a silent miss films an empty form.
   */
  var fieldFor = function (label) {
    var want = String(label || "").trim().toLowerCase();
    if (!want) return null;
    var fields = document.querySelectorAll("input, textarea, select");
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var hay = [
        f.getAttribute("aria-label"), f.getAttribute("placeholder"), f.getAttribute("name"), f.id,
      ];
      // The <label> pointing at it, and the text of whatever wraps it.
      if (f.id) {
        var lab = document.querySelector('label[for="' + f.id + '"]');
        if (lab) hay.push(lab.textContent);
      }
      if (f.closest("label")) hay.push(f.closest("label").textContent);
      for (var h = 0; h < hay.length; h++) {
        if (hay[h] && String(hay[h]).trim().toLowerCase().indexOf(want) !== -1) return f;
      }
    }
    return null;
  };

  var tappable = function (label) {
    var want = String(label || "").trim().toLowerCase();
    if (!want) return null;
    var all = document.querySelectorAll("button, a, [role='button'], summary, input[type='submit']");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var text = ((el.textContent || "") + " " + (el.getAttribute("aria-label") || ""))
        .trim().toLowerCase();
      if (text.indexOf(want) === -1) continue;
      if (el.disabled) continue;
      var box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      return el;
    }
    return null;
  };

  window.__reelDo = function (move) {
    install();
    try {
      if (move && move.tap) {
        var control = tappable(move.tap);
        if (!control) return false;
        control.scrollIntoView({ block: "center", behavior: "instant" });
        control.click();
        return true;
      }
      if (move && move.into) {
        var field = fieldFor(move.into);
        if (!field) return false;
        field.scrollIntoView({ block: "center", behavior: "instant" });
        field.focus();
        /**
         * THE NATIVE SETTER, NOT `field.value = x`.
         *
         * React tracks the value on the DOM node and skips its own handler
         * when the value it sees already matches — so a plain assignment
         * changes what is on screen and the app never hears about it. The
         * readiness score would not move, which is the one thing the shot
         * exists to show.
         */
        var proto = field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, "value");
        if (setter && setter.set) setter.set.call(field, String(move.type));
        else field.value = String(move.type);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    } catch (e) { return false; }
    return false;
  };

  window.__reelHook = function (text) { set("__reel_hook", text); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
