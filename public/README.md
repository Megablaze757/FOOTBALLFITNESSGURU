# public/

Static files served from the site root. Copied verbatim into `out/` by
`next build` (this is an `output: "export"` site).

## Icons

All four are the same gold **PA** mark, generated from the original artwork with
the dark backdrop knocked out to transparency. Sized on purpose — the full 512
is a brushed-gold texture that doesn't compress losslessly (295KB), so it is
never the one fetched on a normal page load.

| File | Size | Used for |
|---|---|---|
| `icon-64.png` | 5.7KB | browser tab favicon — hits every page |
| `icon-192.png` | 33KB | the in-app `<Logo>`, manifest 192 |
| `logo.png` | 295KB | manifest 512, apple-touch-icon, link previews |
| `icon-maskable.png` | 81KB | Android adaptive icon |

`icon-maskable.png` is the only one with a background. Maskable icons get
cropped to a circle or squircle by the OS, so it is full-bleed `#0a0a0b` with
the mark inset to 66% — inside the safe zone, whatever shape gets applied.

### Regenerating

If the artwork changes, the transparency knockout and re-encoding are both
scripted in the session history rather than committed — the short version is:
centre-crop to square, drop pixels below ~46 luminance to alpha 0, fade
46–78 for the anti-aliased edge, then re-encode with adaptive PNG filtering and
deflate level 9. `System.Drawing`'s own PNG encoder barely compresses and
produced a 411KB file from the same pixels.

## Other files

- `manifest.webmanifest` — PWA manifest. Installability needs a valid 192 and 512.
- `sw.js` — service worker: offline shell, push notifications.
- `offline.html` — shown when a navigation fails with no cached copy.
