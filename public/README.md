# public/

Static files served from the site root. Copied verbatim into `out/` by
`next build` (this is an `output: "export"` site).

## logo.png — required

The PocketAthlete mark. Used by `components/Logo.tsx` in the landing nav, the
sign-in and reset-password screens and the report header, and as the favicon,
apple-touch-icon and link-preview image (`app/layout.tsx`).

Save the gold **PA** mark here as **`logo.png`**:

- Square, ideally **512×512** (it's scaled down to 32–64px in the UI and used at
  180px for the iOS home-screen icon).
- Transparent background, so it sits on the dark theme without a white box.

`Logo.tsx` falls back to a typographic "PA" tile if this file is missing, so the
site never shows a broken image — but every surface above stays generic until
the real file is in place.
