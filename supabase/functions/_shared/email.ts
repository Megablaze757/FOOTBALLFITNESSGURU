type AdminClient = {
  from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<unknown> };
};

export async function sendAndLog(options: {
  supabase: AdminClient;
  userId: string;
  type: string;
  apiKey: string | undefined;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const { supabase, userId, type, apiKey, from, to, subject, html } = options;
  if (!apiKey) {
    await supabase.from("email_delivery_logs").insert({
      user_id: userId, email_type: type, status: "failed", error_message: "RESEND_API_KEY is not configured",
    });
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    await supabase.from("email_delivery_logs").insert({
      user_id: userId,
      email_type: type,
      provider_id: body.id ?? null,
      status: response.ok ? "sent" : "failed",
      error_message: response.ok ? null : body.message ?? body.name ?? `Resend returned ${response.status}`,
    });
    return response.ok;
  } catch (error) {
    await supabase.from("email_delivery_logs").insert({
      user_id: userId, email_type: type, status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
