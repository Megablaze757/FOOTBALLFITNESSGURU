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

    var hook = document.createElement("div");
    hook.id = "__reel_hook";
    hook.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;"
      + "padding:0 44px;background:rgba(6,6,8,0.93);color:#fff;font-size:62px;line-height:1.15;"
      + "font-weight:900;text-align:center;opacity:0;transition:opacity 120ms linear;";
    layer.appendChild(hook);

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
