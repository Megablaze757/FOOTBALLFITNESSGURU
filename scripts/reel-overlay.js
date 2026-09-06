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
      + "color:#fff;background:rgba(8,8,10,0.82);padding:14px 22px;border-radius:18px;"
      + "box-shadow:0 8px 40px rgba(0,0,0,0.45);opacity:0;transition:opacity 120ms linear;";
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
    // Upper third: clear of the caption band at 22%, and clear of the
    // platform's own header chrome at the very top.
    hookWrap.style.cssText =
      "position:fixed;left:0;right:0;top:13%;display:flex;justify-content:center;"
      + "padding:0 30px;pointer-events:none;";

    var hook = document.createElement("div");
    hook.id = "__reel_hook";
    hook.style.cssText =
      "max-width:100%;font-size:64px;line-height:1.08;font-weight:900;text-align:center;"
      + "color:#fff;background:rgba(8,8,10,0.9);padding:18px 26px;border-radius:22px;"
      + "box-shadow:0 10px 50px rgba(0,0,0,0.5);opacity:0;transition:opacity 120ms linear;";
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
