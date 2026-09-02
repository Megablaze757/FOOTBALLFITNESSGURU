#!/usr/bin/env node
// =============================================================================
// Write the theme variables in app/globals.css from lib/theme.ts.
//
// WHY GENERATED. The palette has to exist in TypeScript, because that is where
// the contrast test can reach it, and in CSS, because that is where the browser
// can. Two copies of ninety numbers is a guarantee that one of them is wrong,
// and the symptom would be a colour that passes its test and ships anyway.
//
// Idempotent: it replaces everything between the markers, so running it twice
// changes nothing. lib/theme-css.test.ts fails if the file has drifted, which
// is what tells you to run it.
//
//   npm run build:theme
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { withThemeBlock } from "../lib/theme";

const path = "app/globals.css";
writeFileSync(path, withThemeBlock(readFileSync(path, "utf8")));
console.log(`${path} theme block rebuilt`);
