// Reproduce exactly what the component builds and copies.
const fnBase = "https://txqhstackgidjqkkrzyj.supabase.co".replace(/\/+$/, "");
const ingestUrl = `${fnBase}/functions/v1/wearable-ingest`;
const token = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const personalLink = `${ingestUrl}?t=${token}`;
const sleepOnly = `${personalLink}&sleep=`;
console.log(JSON.stringify(sleepOnly));
console.log("contains a space:", /\s/.test(sleepOnly));
console.log("length:", sleepOnly.length);
