"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";

interface Message { id: string; sender_id: string; body: string; created_at: string }

// A private coach ↔ athlete thread. `meId` is the current user; bubbles align
// right for messages you sent, left for the other party.
export function MessageThread({ coachId, athleteId, meId, otherName }: {
  coachId: string;
  athleteId: string;
  meId: string;
  otherName: string;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const { data } = await createClient()
      .from("messages").select("id, sender_id, body, created_at")
      .eq("coach_id", coachId).eq("athlete_id", athleteId)
      .order("created_at", { ascending: true });
    return (data ?? []) as Message[];
  }, [coachId, athleteId]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const { error } = await createClient().from("messages").insert({
      coach_id: coachId, athlete_id: athleteId, sender_id: meId, body: text,
    });
    setSending(false);
    if (!error) { setBody(""); reload(); }
  }

  const messages = data ?? [];

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="field-label !mb-0">💬 Messages with {otherName}</h2>
      </div>

      {loading ? (
        <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
      ) : messages.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No messages yet — say hello.</p>
      ) : (
        <div className="no-scrollbar mb-3 max-h-72 space-y-2 overflow-y-auto">
          {messages.map((m) => {
            const mine = m.sender_id === meId;
            return (
              <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "ml-auto bg-pitch-400/15 text-slate-100" : "bg-white/[0.05] text-slate-200"}`}>
                {m.body}
                <div className="mt-0.5 text-[10px] text-slate-500">{new Date(m.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
        <input className="field flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Message ${otherName}…`} />
        <button type="submit" disabled={!body.trim() || sending} className="rounded-2xl bg-gradient-to-br from-pitch-400 to-pitch-600 px-4 font-semibold text-ink-900 disabled:opacity-50">↑</button>
      </form>
    </section>
  );
}
