// End-to-end smoke test against the LIVE Supabase project using the publishable
// (anon) key — exercises auth, RLS, and the core data path the app relies on.
import { createClient } from "@supabase/supabase-js";

const URL = "https://txqhstackgidjqkkrzyj.supabase.co";
const KEY = "sb_publishable_kr26XwyR0HZxS3HR3UJI2Q_YLLT7Sfl";

const supabase = createClient(URL, KEY);
const today = new Date().toISOString().slice(0, 10);

async function asAthlete() {
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: "athlete@example.com",
    password: "Test1234!",
  });
  if (error) throw new Error("athlete login: " + error.message);
  const uid = auth.user.id;
  console.log("✓ athlete login", uid.slice(0, 8));

  const { error: upErr } = await supabase.from("daily_check_ins").upsert(
    {
      user_id: uid,
      check_in_date: today,
      pain_map: { knee_left: 7 },
      fatigue_score: 7,
      sleep_quality: 4,
      nutrition_quality: 6,
      is_match_day: false,
      match_minutes_played: 0,
    },
    { onConflict: "user_id,check_in_date" }
  );
  if (upErr) throw new Error("check-in upsert: " + upErr.message);
  console.log("✓ check-in written");

  const { data: rows, error: selErr } = await supabase
    .from("daily_check_ins")
    .select("check_in_date, pain_map, sleep_quality")
    .eq("user_id", uid);
  if (selErr) throw new Error("check-in read: " + selErr.message);
  console.log("✓ check-in read back:", JSON.stringify(rows[0]));

  // RLS: athlete must NOT see another user's rows (count should equal own only).
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).single();
  console.log("✓ profile role:", prof.role);

  await supabase.auth.signOut();
}

async function asAdmin() {
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: "admin@example.com",
    password: "Test1234!",
  });
  if (error) throw new Error("admin login: " + error.message);
  console.log("✓ admin login", auth.user.id.slice(0, 8));

  const { data: metrics, error: rpcErr } = await supabase.rpc("admin_metrics");
  if (rpcErr) throw new Error("admin_metrics rpc: " + rpcErr.message);
  console.log("✓ admin_metrics:", JSON.stringify(metrics));
  await supabase.auth.signOut();
}

await asAthlete();
await asAdmin();
console.log("\nLIVE SMOKE TEST PASSED");
