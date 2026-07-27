import { Client } from "pg";
const REGIONS=["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-west-3","eu-central-1","eu-central-2","eu-north-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","ap-south-1","sa-east-1","ca-central-1"];
const REF="txqhstackgidjqkkrzyj", PW=process.env.PGPW;
async function connect(){for(const cs of [`postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres`,...REGIONS.map(r=>`postgresql://postgres.${REF}:${PW}@aws-0-${r}.pooler.supabase.com:5432/postgres`)]){const c=new Client({connectionString:cs,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000});try{await c.connect();await c.query("select 1");return c;}catch{try{await c.end();}catch{}}}throw new Error("no reachable host");}
const c = await connect();

// Every FK that points at auth.users or public.profiles, and what it does on delete.
const { rows } = await c.query(`
  select con.conrelid::regclass::text as child_table,
         a.attname                    as child_col,
         con.confrelid::regclass::text as parent_table,
         case con.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
    from pg_constraint con
    join unnest(con.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
   where con.contype = 'f'
     and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
   order by on_delete, child_table`);
console.table(rows);

const bad = rows.filter((r) => r.on_delete !== "CASCADE");
console.log(bad.length ? `\n!! ${bad.length} FK(s) would BLOCK or orphan on delete` : "\nAll FKs cascade.");

// Storage buckets — videos cost money even after the account is gone.
const { rows: buckets } = await c.query(`select id, public from storage.buckets`);
console.log("\nbuckets:", buckets);
const { rows: objs } = await c.query(`
  select bucket_id, count(*)::int as n, pg_size_pretty(sum((metadata->>'size')::bigint)) as size
    from storage.objects group by 1`);
console.log("objects:", objs);

await c.end();
