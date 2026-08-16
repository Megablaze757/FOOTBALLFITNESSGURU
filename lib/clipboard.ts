// =============================================================================
// Copying text to the clipboard, on a phone, reliably.
//
// WHY THIS IS NOT ONE LINE. `navigator.clipboard.writeText` is the correct API
// and it rejects more often than you would expect on exactly the devices this
// app runs on: iOS Safari refuses it when the document is not focused, inside
// some in-app browsers, and intermittently from a standalone home-screen PWA.
//
// The failure that sent this here: the Apple Health guide copied the athlete's
// sync URL with a bare `await navigator.clipboard.writeText(value)` and no
// catch. When it rejected, the promise died silently — the button never said
// "Copied", nothing reached the clipboard, and because the link was rendered
// MASKED for safety there was no way to read or select it by hand either. The
// athlete opened Shortcuts, tried to paste, and had nothing. From their side
// the app simply would not give them the URL.
//
// So: try the real API, fall back to the old selection trick, and tell the
// caller which happened so the UI can offer the manual route rather than
// pretending it worked.
// =============================================================================

export type CopyResult = "copied" | "failed";

/**
 * Put `text` on the clipboard. Never throws.
 *
 * The fallback is `document.execCommand("copy")` over an off-screen textarea.
 * It is deprecated, it is also the only thing that works in several of the
 * places above, and a deprecated call that succeeds beats a modern one that
 * rejects.
 */
export async function copyText(text: string): Promise<CopyResult> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Fall through. This is the common path on iOS, not an exceptional one.
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): CopyResult {
  if (typeof document === "undefined") return "failed";
  try {
    const el = document.createElement("textarea");
    el.value = text;
    // Off-screen rather than hidden: `display:none` and `visibility:hidden`
    // elements cannot be selected, so the copy silently does nothing.
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-1000px";
    el.style.opacity = "0";
    document.body.appendChild(el);

    // iOS ignores .select() on a readonly field unless the range is set
    // explicitly, which is the detail that makes most versions of this snippet
    // fail on exactly the platform they were written for.
    el.contentEditable = "true";
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.setSelectionRange(0, text.length);

    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok ? "copied" : "failed";
  } catch {
    return "failed";
  }
}
