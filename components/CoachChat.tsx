"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { localCoachAnswer, type ChatContext } from "@/lib/coach-chat";

interface Msg { role: "you" | "coach"; text: string }

const SUGGESTIONS = ["Why is this drill in my plan?", "My knee hurts — what should I do?", "Am I ready to train hard today?"];

export function CoachChat({ context }: { context: ChatContext }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || thinking) return;
    setMessages((m) => [...m, { role: "you", text: question }]);
    setInput("");
    setThinking(true);

    let answer: string;
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("coach-chat", {
        body: { question, context },
      });
      if (error || !data?.answer) throw new Error("fallback");
      answer = data.answer as string;
    } catch {
      // Works on GitHub Pages without the Edge Function deployed.
      answer = localCoachAnswer(question, context);
    }

    setMessages((m) => [...m, { role: "coach", text: answer }]);
    setThinking(false);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }));
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="field-label !mb-0">Ask your coach</h2>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pitch-400" />
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
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} className="chip text-slate-300 hover:border-pitch-400/50 hover:text-pitch-400">{s}</button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <input className="field flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about your training…" />
        <button type="submit" disabled={!input.trim() || thinking} className="rounded-2xl bg-gradient-to-br from-pitch-400 to-pitch-600 px-4 font-semibold text-ink-900 disabled:opacity-50">↑</button>
      </form>
    </section>
  );
}
