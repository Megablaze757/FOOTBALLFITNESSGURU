"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Opting out of the waitlist email, without an account.
 *
 * THE CONSTRAINT THAT SHAPES THIS PAGE: the people it is for do not have logins.
 * That is the whole reason they are on a waitlist. So the token in the link is
 * the only credential, `unsubscribe_waitlist` is callable by anon, and there is
 * nothing on screen to sign into.
 *
 * It also runs on load rather than behind a confirm button. A one-click
 * unsubscribe is what the List-Unsubscribe header promises mail clients, and
 * Gmail and Yahoo require that promise to be kept on bulk mail — a page that
 * says "click here to confirm" fails it. The undo is that they can rejoin the
 * waitlist, which the success state links to.
 */
type State = "working" | "done" | "bad-token" | "error";

export default function UnsubscribePage() {
  const [state, setState] = useState<State>("working");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t")?.trim();
    if (!token) { setState("bad-token"); return; }

    let live = true;
    void createClient()
      .rpc("unsubscribe_waitlist", { p_token: token })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          // An unparseable token comes back as a Postgres cast error rather
          // than `false`, and telling someone "something went wrong" when the
          // real answer is "that link is malformed" sends them to support for
          // no reason.
          if (/invalid input syntax|uuid/i.test(error.message)) { setState("bad-token"); return; }
          setState("error");
          setDetail(error.message);
          return;
        }
        setState(data === true ? "done" : "bad-token");
      });
    return () => { live = false; };
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(600px_240px_at_50%_0%,rgba(227,181,63,0.14),transparent)]" />

      <div className="w-full max-w-md text-center">
        <div className="mb-8 text-2xl font-extrabold tracking-tight">
          <span className="text-accent-400">◆</span> PocketAthlete
        </div>

        {state === "working" && (
          <p className="text-sm text-slate-400">Unsubscribing…</p>
        )}

        {state === "done" && (
          <>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">You&apos;re unsubscribed.</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-slate-400">
              We won&apos;t email you about Pocket Athlete again. Nothing else to do.
            </p>
            <p className="mx-auto mt-6 max-w-sm text-xs text-slate-500">
              Changed your mind? You can{" "}
              <Link href="/waitlist" className="text-accent-400 underline">join again</Link> any time.
            </p>
          </>
        )}

        {state === "bad-token" && (
          <>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">That link didn&apos;t work.</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-slate-400">
              It may have been cut in half by your email app — those links are long. Try opening it
              again from the email, or reply to the email and we&apos;ll take you off by hand.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">Something went wrong.</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-slate-400">
              We couldn&apos;t process that just now. Reply to the email and we&apos;ll remove you by hand
              — you do not have to keep trying.
            </p>
            {detail && <p className="mt-2 text-xs text-slate-600">{detail}</p>}
          </>
        )}
      </div>
    </main>
  );
}
