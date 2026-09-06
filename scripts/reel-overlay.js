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
     *
     * Heavy weight on a near-black pill, because three quarters of the
     * audience is READING this rather than hearing it.
     */
    caption.style.cssText =
      "max-width:100%;text-align:center;font-size:40px;line-height:1.25;font-weight:800;"
      /**
       * OPAQUE, AND WITH A RIM.
       *
       * The fill was rgba(8,8,10,0.82), which separated the words from a light
       * page perfectly and vanished entirely on a dark one — the app's own
       * ground is rgb(9,9,10), so once the recorder started filming in dark
       * the pill became invisible and the page's text read straight through
       * the caption. A caption has to work on ANY background, which means it
       * cannot rely on being darker than what is behind it.
       *
       * Opaque fill for the text, and a light rim so the pill still has an
       * edge when the thing behind it is as dark as the fill.
       */
      + "color:#fff;background:rgb(10,10,11);padding:14px 22px;border-radius:18px;"
      + "border:2px solid rgba(255,255,255,0.22);"
      + "box-shadow:0 10px 44px rgba(0,0,0,0.6);opacity:0;transition:opacity 120ms linear;";
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
      "position:fixed;left:0;right:0;top:42%;display:flex;justify-content:center;"
      + "padding:0 30px;pointer-events:none;";

    var hook = document.createElement("div");
    hook.id = "__reel_hook";
    hook.style.cssText =
      "max-width:100%;font-size:64px;line-height:1.08;font-weight:900;text-align:center;"
      // Same rim, same reason as the caption above.
      + "color:#fff;background:rgb(10,10,11);padding:18px 26px;border-radius:22px;"
      + "border:2px solid rgba(255,255,255,0.24);"
      + "box-shadow:0 12px 56px rgba(0,0,0,0.65);opacity:0;transition:opacity 120ms linear;";
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
    // BEFORE the caption in the layer, so the caption is never dimmed by it.
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
      var text = (el.textContent || "").trim().toLowerCase();
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
    if (!needle) { spot.style.opacity = "0"; return false; }

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
      var centred = window.scrollY + box.top - (window.innerHeight / 2) + (box.height / 2);
      window.scrollTo({ top: Math.max(0, centred), behavior: "instant" });
    }

    var found = findByText(needle);
    if (!found) { spot.style.opacity = "0"; return false; }

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
    var b = found.box;
    var top = Math.max(0, b.top - pad) / zoom;
    var left = Math.max(0, b.left - pad) / zoom;
    var right = Math.min(window.innerWidth, b.right + pad) / zoom;
    var bottom = Math.min(window.innerHeight, b.bottom + pad) / zoom;

    var panels = spot.querySelectorAll("[data-side]");
    var put = function (el, css) { el.style.cssText += ";" + css; };
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
   * accent-400 on the pill measures 10.3:1, past WCAG AAA for large text, and
   * it is the app's own colour rather than the generic yellow every reel uses.
   * ═══════════════════════════════════════════════════════════════════════
   */
  window.__reelCaption = function (value) {
    install();
    var el = document.getElementById("__reel_caption");
    if (!el) return;
    if (typeof value === "string") { set("__reel_caption", value); return; }

    var runs = value || [];
    el.textContent = "";
    for (var i = 0; i < runs.length; i++) {
      var span = document.createElement("span");
      span.textContent = runs[i].text;
      if (runs[i].key) span.style.color = "rgb(227,181,63)";
      el.appendChild(span);
    }
    el.style.opacity = runs.length ? "1" : "0";
  };
  window.__reelHook = function (text) { set("__reel_hook", text); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
