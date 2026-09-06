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

  window.__reelCaption = function (text) { set("__reel_caption", text); };
  window.__reelHook = function (text) { set("__reel_hook", text); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
