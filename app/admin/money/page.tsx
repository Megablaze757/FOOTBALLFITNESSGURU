"use client";

import { Affiliates } from "@/components/admin/Affiliates";
import { AffiliateEarnings } from "@/components/AffiliateEarnings";
import { AdminShell, AdminArea } from "@/components/admin/AdminShell";

/**
 * Who brings people in, and what they are owed.
 *
 * Separate from Overview deliberately: the headline revenue number is something
 * you glance at daily, whereas commission owed is something you act on monthly.
 * Mixing the two put a payables workflow on the page you check over coffee.
 */
export default function AdminMoney() {
  return (
    <AdminShell title="Money" note="Affiliates, and what they are owed.">
      <AdminArea title="Affiliates" note="Codes, signups, and how many converted">
        <Affiliates />
      </AdminArea>
      <AdminArea title="Commission" note="Owed and paid — only ever on Stripe-backed subscriptions">
        <AffiliateEarnings />
      </AdminArea>
    </AdminShell>
  );
}
