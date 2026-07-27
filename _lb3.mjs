import { Client } from "pg";
const REGIONS=["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-west-3","eu-central-1","eu-central-2","eu-north-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","ap-south-1","sa-east-1","ca-central-1"];
const REF="txqhstackgidjqkkrzyj", PW=process.env.PGPW;
async function connect(){for(const cs of [`postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres`,...REGIONS.map(r=>`postgresql://postgres.${REF}:${PW}@aws-0-${r}.pooler.supabase.com:5432/postgres`)]){const c=new Client({connectionString:cs,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000});try{await c.connect();await c.query("select 1");return c;}catch{try{await c.end();}catch{}}}throw new Error("no reachable host");}
const c = await connect();
let ok = true;
for (const scope of ["world","squad"]) {
  await c.query("begin");
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims','{"sub":"db56c36b-7a74-4fd7-bbd1-888f71f15ce4","role":"authenticated"}',true)`);
  try {
    const { rows } = await c.query("select * from public.leaderboard_stats($1)", [scope]);
    console.log(`${scope}: ${rows.length} athlete(s)`);
    for (const r of rows.slice(0,5)) console.log(`   ${String(r.name).padEnd(10)} check-ins ${r.check_ins_7}  sleep ${r.avg_sleep ?? "-"}  sessions ${r.sessions_7}  completed ${r.completed_7}  streak ${r.streak}`);
  } catch (e) { ok = false; console.log(`${scope}: STILL FAILING -> ${e.message}`); }
  await c.query("rollback");
}
// Anonymous callers must still be refused.
await c.query("begin");
await c.query("set local role anon");
try { await c.query("select * from public.leaderboard_stats('world')"); console.log("\n!! anon was allowed to read the board"); ok = false; }
catch (e) { console.log(`\nanon correctly refused: ${e.message.split("\n")[0]}`); }
await c.query("rollback");
console.log(ok ? "\nLEADERBOARD OK" : "\nSTILL BROKEN");
await c.end();
