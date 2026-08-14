"use client";

import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { Users } from "@/components/admin/Users";
import { Waitlist } from "@/components/admin/WaitlistTable";
import { CreateBetaAccount } from "@/components/admin/CreateBetaAccount";
import { AdminShell, AdminArea, Drawer } from "@/components/admin/AdminShell";

/**
 * The full lists, when you need them.
 *
 * Both tables are long and neither is something you read daily — they are for
 * looking somebody up. Folded shut by default so the page opens in one screen
 * instead of several thousand pixels of rows.
 */
export default function AdminPeople() {
  const { data } = useAsync(async () => {
    const { data: waitlist } = await createClient()
      .from("waitlist").select("email, source, created_at")
      .order("created_at", { ascending: false });
    return { waitlist: (waitlist ?? []) as { email: string; source: string | null; created_at: string }[] };
  }, []);

  const waitlist = data?.waitlist ?? [];

  return (
    <AdminShell title="People" note="Accounts and the waitlist.">
      <AdminArea title="Accounts">
        <Drawer summary="Every user">
          <Users />
        </Drawer>
        <Drawer summary="Create a beta account">
          <CreateBetaAccount />
        </Drawer>
      </AdminArea>

      <AdminArea title="Waitlist">
        <Drawer summary={`Email waitlist · ${waitlist.length}`}>
          <Waitlist rows={waitlist} />
        </Drawer>
      </AdminArea>
    </AdminShell>
  );
}
