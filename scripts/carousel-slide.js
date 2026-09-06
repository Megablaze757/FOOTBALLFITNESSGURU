/**
 * The slide, as a document.
 *
 * A PLAIN .js FILE, never transpiled — the same reason scripts/reel-overlay.js
 * is one. tsx wraps named functions in a `__name(...)` helper that does not
 * exist inside the page, and an inline version threw "__name is not defined"
 * before its first line ran.
 *
 * Screenshotted rather than drawn with canvas: text layout — wrapping, kerning,
 * a table that lines up — is the one thing a browser is better at than any
 * drawing API, and a carousel is almost entirely text.
 */
window.__slideHtml = function (slide, n, total) {
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
    });
  };
  var br = function (s) { return esc(s).replace(/\n/g, "<br>"); };

  // Dots, so a reader knows how far through they are and that there is more.
  var dots = "";
  for (var i = 1; i <= total; i++) {
    dots += '<i class="' + (i === n ? "on" : "") + '"></i>';
  }

  var body = "";
  if (slide.kind === "hook") {
    body =
      '<div class="mid">'
      + '<h1>' + br(slide.headline) + '</h1>'
      + '<p class="sub">' + esc(slide.sub) + '</p>'
      + '</div>'
      + '<div class="swipe">' + esc(slide.swipe) + '</div>';
  } else if (slide.kind === "cta") {
    body =
      '<div class="mid">'
      + '<h1 class="small">' + br(slide.headline) + '</h1>'
      + '<p class="sub">' + esc(slide.sub) + '</p>'
      + '</div>'
      + '<div class="action">' + esc(slide.action) + '</div>';
  } else {
    var rows = "";
    for (var r = 0; r < slide.rows.length; r++) {
      var row = slide.rows[r];
      rows +=
        '<li><span class="rank">' + esc(row.rank) + '</span>'
        + '<span class="name">' + esc(row.name) + '</span>'
        + '<span class="portion">' + esc(row.portion) + '</span>'
        + '<span class="cost">' + esc(row.cost) + '</span></li>';
    }
    body =
      '<h2>' + esc(slide.title) + '</h2>'
      + (slide.note ? '<p class="note">' + esc(slide.note) + '</p>' : "")
      + '<ul>' + rows + '</ul>';
  }

  return '<div class="slide"><div class="inner">' + body + '</div><div class="dots">' + dots + '</div></div>';
};
