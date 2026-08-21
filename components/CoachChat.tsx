"use client";

import { useEffect, useRef, useState } from "react";
import { invokeAI } from "@/lib/api";
import { localCoachAnswer, type ChatContext, type ChatTurn } from "@/lib/coach-chat";
import { createClient } from "@/lib/supabase/client";

interface Msg { role: "you" | "coach"; text: string }

const SUGGESTIONS = ["Why is this drill in my plan?", "My knee hurts — what should I do?", "Am I ready to train hard today?"];

export function CoachChat({ context, briefing, suggestions, storageKey, userId }: {
  context: ChatContext;
  /**
   * The full athlete briefing — see lib/coach-briefing.ts. Optional because the
   * local fallback below can only work from `context`, and because a caller
   * that has not loaded everything should send what it has rather than nothing.
   */
  briefing?: string;
  suggestions?: string[];
  /** Keeps this athlete's current conversation when they leave and come back in the same tab. */
  storageKey?: string;
  /** Enables private cross-device history when migration 0090 is present. */
  userId?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [restored, setRestored] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (userId) {
        const { data, error } = await createClient()
          .from("coach_messages")
          .select("role, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (!cancelled && !error && data?.length) {
          setMessages([...data].reverse().map((row) => ({
            role: row.role === "assistant" ? "coach" : "you",
            text: String(row.content),
          })));
          setRestored(true);
          return;
        }
      }
      if (!cancelled && storageKey) {
        try {
          const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as Msg[];
          setMessages(parsed.filter((m) => (m?.role === "you" || m?.role === "coach") && typeof m.text === "string").slice(-20));
        } catch { /* a corrupt tab cache is the same as no conversation */ }
      }
      if (!cancelled) setRestored(true);
    })();
    return () => { cancelled = true; };
  }, [storageKey, userId]);

  useEffect(() => {
    if (!restored || !storageKey) return;
    sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)));
  }, [messages, restored, storageKey]);

  function saveTurn(message: Msg) {
    if (!userId) return;
    void createClient().from("coach_messages").insert({
      user_id: userId,
      role: message.role === "you" ? "user" : "assistant",
      content: message.text.slice(0, 4_000),
    });
  }

  function clearConversation() {
    setMessages([]);
    if (storageKey) sessionStorage.removeItem(storageKey);
    if (userId) void createClient().from("coach_messages").delete().eq("user_id", userId);
  }

  async function ask(question: string) {
    if (!question.trim() || thinking || !restored) return;
    const userMessage: Msg = { role: "you", text: question };
    setMessages((m) => [...m, userMessage]);
    saveTurn(userMessage);
    setInput("");
    setThinking(true);

    let answer: string;
    try {
      // The bubbles on screen are not memory unless they travel with the next
      // request. Twelve recent turns are enough for follow-ups while keeping an
      // old conversation from crowding out today's athlete briefing.
      const history: ChatTurn[] = messages.slice(-12).map((message) => ({
        role: message.role === "you" ? "user" : "assistant",
        content: message.text,
      }));
      const data = await invokeAI<{ answer?: string }>("coach-chat", { question, context, briefing, history });
      if (!data?.answer) throw new Error("fallback");
      answer = data.answer;
    } catch {
      // Works on GitHub Pages without any AI backend configured. It answers
      // from `context` only — the briefing is prose written for a model, not
      // something the local rule engine can read — so it is deliberately more
      // limited than the real coach rather than pretending otherwise.
      answer = localCoachAnswer(question, context);
    }

    const coachMessage: Msg = { role: "coach", text: answer };
    setMessages((m) => [...m, coachMessage]);
    saveTurn(coachMessage);
    setThinking(false);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }));
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="field-label !mb-0">Ask your coach</h2>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pitch-400" />
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearConversation}
            className="tap-target ml-auto px-1 text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
          >
            New chat
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <div ref={listRef} className="mb-3 max-h-72 space-y-2 overflow-y-auto no-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "you" ? "ml-auto bg-pitch-400/15 text-slate-100" : "bg-white/[0.05] text-slate-200"}`}>
              {m.text}
            </div>
          ))}
          {thinking && <div className="rounded-2xl bg-white/[0.05] px-3 py-2 text-sm text-slate-500">Coach is thinking…</div>}
        </div>
      )}

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {(suggestions ?? SUGGESTIONS).map((s) => (
            <button key={s} onClick={() => ask(s)} className="chip text-slate-300 hover:border-pitch-400/50 hover:text-pitch-400">{s}</button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <input
          className="field flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!restored}
          placeholder={restored ? "Ask about training, recovery or food…" : "Loading your conversation…"}
        />
        <button type="submit" disabled={!input.trim() || thinking || !restored} className="rounded-2xl bg-gradient-to-br from-pitch-400 to-pitch-600 px-4 font-semibold text-ink-900 disabled:opacity-50">↑</button>
      </form>
    </section>
  );
}
