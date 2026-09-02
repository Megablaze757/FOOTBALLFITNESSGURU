"use client";

import { useEffect, useRef, useState } from "react";
import { invokeAI } from "@/lib/api";
import { localCoachAnswer, type ChatContext, type ChatTurn } from "@/lib/coach-chat";
import { createClient } from "@/lib/supabase/client";

interface Msg { role: "you" | "coach"; text: string }

const SUGGESTIONS = ["Why is this drill in my plan?", "My knee hurts — what should I do?", "Am I ready to train hard today?"];

export function CoachChat({ context, briefing, suggestions, storageKey, userId, fill }: {
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
  /**
   * Fill the container instead of sizing to the viewport.
   *
   * On /ask this component IS the page and knows how tall it should be. Inside
   * the floating bubble it is a panel within a sheet that has already decided —
   * and a child measuring itself against the viewport inside a parent that is
   * 85% of it produces a composer 15% below the bottom of the screen.
   */
  fill?: boolean;
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

  const canSend = input.trim().length > 0 && !thinking && restored;
  const prompts = suggestions ?? SUGGESTIONS;

  return (
    /**
     * A CONVERSATION, NOT A FORM WITH A LOG ABOVE IT.
     *
     * This was a card with `max-h-72` of scroll, identical bubbles on both
     * sides, and a grey box that said "Coach is thinking…". Everything worked
     * and none of it read as a chat: with the same shape, the same colour
     * weight and no avatar, the only thing separating your words from the
     * coach's was which margin they were pushed against, and a 288px window is
     * a transcript viewer rather than somewhere you talk.
     *
     * Now it fills the screen and the composer sits at the bottom where a
     * thumb already is. Each side has its own shape — the tail corner is
     * squared off toward whoever said it — so a glance sorts the conversation
     * before any reading happens.
     */
    <section className={fill
      ? "flex h-full flex-col overflow-hidden bg-transparent"
      : "flex min-h-[calc(100dvh-14rem)] flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]"}>
      {!fill && <header className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <CoachAvatar />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-slate-100">Your coach</p>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-readiness-green" />
            {thinking ? "Typing…" : "Has your plan, food and lifts in front of it"}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearConversation}
            className="tap-target shrink-0 px-2 text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
          >
            New chat
          </button>
        )}
      </header>}

      {/* THE CONVERSATION SITS ON THE BOTTOM, like every chat anybody has used.
          Filling from the top left the opening line stranded at the ceiling
          with two thirds of a phone of empty space under it, which reads as a
          screen that has not finished loading rather than as a chat waiting for
          a question. `mt-auto` on the inner column rather than `justify-end` on
          the scroller: the latter makes overflowing content unreachable above
          the scroll origin in some engines. */}
      <div ref={listRef} className="no-scrollbar flex flex-1 flex-col overflow-y-auto">
        <div className="mt-auto space-y-3 px-4 py-4">
        {/* THE COACH SPEAKS FIRST. An empty chat with a blinking cursor asks
            somebody to think of a question, which is the hardest part. */}
        {messages.length === 0 && (
          <Bubble role="coach">
            Ask me anything about your training, your recovery or your food — I have already read
            your block, today&apos;s log and every lift you have ranked.
          </Bubble>
        )}

        {/* THE FACE ONLY ON THE LAST OF A RUN. Repeating it beside every
            bubble in a four-paragraph answer is four identical badges down the
            margin, which is noise pretending to be information. */}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} showAvatar={messages[i + 1]?.role !== m.role}>
            {m.text}
          </Bubble>
        ))}

        {thinking && (
          <div className="flex items-end gap-2">
            <CoachAvatar small />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-slate-400"
                  style={{ animationDelay: `${dot * 0.16}s` }}
                />
              ))}
              <span className="sr-only">Coach is typing</span>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* KEPT WITHIN REACH, not deleted on the first message. The old row
          vanished the moment a conversation started, so the four questions the
          coach can actually answer were only ever offered to somebody who had
          not asked anything yet. */}
      {!thinking && input.trim() === "" && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
          {prompts.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={!restored}
              className="chip shrink-0 whitespace-nowrap text-slate-300 hover:border-pitch-400/50 hover:text-pitch-400 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="flex items-end gap-2 border-t border-white/[0.06] bg-white/[0.02] px-3 py-3"
      >
        <input
          className="field min-h-[44px] flex-1 rounded-full px-4"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!restored}
          aria-label="Ask your coach"
          placeholder={restored ? "Ask about training, recovery or food…" : "Loading your conversation…"}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pitch-400 to-pitch-600 text-lg font-bold text-on-accent transition disabled:opacity-40"
        >
          ↑
        </button>
      </form>
    </section>
  );
}

/**
 * One turn.
 *
 * THE TAIL IS THE WHOLE POINT. Both sides used `rounded-2xl` on all four
 * corners, so the bubbles were the same object in two colours and the only
 * signal was the margin. Squaring the corner nearest the speaker gives each
 * side a direction, which is what makes a stack of them read as a conversation
 * at a glance rather than as a list.
 */
function Bubble({ role, children, showAvatar = true }: {
  role: "you" | "coach";
  children: React.ReactNode;
  showAvatar?: boolean;
}) {
  const mine = role === "you";
  return (
    <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
      {/* A spacer where the avatar would be, so a run of coach messages keeps
          one left edge instead of stepping in and out by 24px. */}
      {!mine && (showAvatar ? <CoachAvatar small /> : <span className="w-6 shrink-0" aria-hidden />)}
      <div
        className={`max-w-[82%] whitespace-pre-wrap px-4 py-2.5 text-sm leading-relaxed ${
          mine
            ? "rounded-2xl rounded-br-md border border-pitch-400/25 bg-pitch-400/20 text-slate-100"
            : "rounded-2xl rounded-bl-md bg-white/[0.06] text-slate-200"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Who is talking.
 *
 * A mark rather than a photograph: there is no coach to photograph, and a stock
 * headshot would be pretending there is. It repeats beside every answer so a
 * long reply that scrolls past its own start still says who wrote it.
 */
function CoachAvatar({ small }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-pitch-400 to-pitch-600 font-black text-on-accent ${
        small ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-xs"
      }`}
    >
      PA
    </span>
  );
}
