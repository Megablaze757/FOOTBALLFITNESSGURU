"use client";

import { useEffect, useMemo, useState } from "react";
import { shoppingListText, type ShoppingList as List } from "@/lib/meal-plan";
import { SUPERMARKETS, PRICES_REVIEWED, productLink, type StoreId } from "@/lib/food-db";

/**
 * The weekly shop, as something you can actually take to a shop.
 *
 * IT HAD NO CHECKBOXES. That is the entire job of a shopping list — you are
 * standing in an aisle holding a phone, and the one thing you need is to mark
 * what's in the trolley. It was a read-only table of prices instead, so the only
 * way to use it was to remember where you'd got to.
 *
 * WORSE, TAPPING AN ITEM LEFT THE APP. Every food name was a link to a
 * supermarket search opening in a new tab, and the name was the only tap target
 * in the row. The most natural gesture while shopping — tap the thing you just
 * picked up — threw you into Tesco's website. Now the row ticks and a separate
 * small search link does the searching.
 *
 * TICKS SURVIVE THE SHOP. Kept in localStorage against the plan's seed, because
 * a shop takes forty minutes with the phone locked in a pocket, and losing the
 * ticks to a backgrounded tab makes the feature worthless exactly when it's
 * being used. Regenerating the week gets a new seed and therefore a clean list,
 * which is right — it's a different shop.
 */
export function ShoppingList({ list, seed, store, onStore, onCorrectPrice }: {
  list: List;
  seed: number | null;
  store: StoreId;
  onStore: (id: StoreId) => void;
  /** Called with the athlete's own price for a pack, in £. */
  onCorrectPrice: (foodId: string, price: number | null) => void;
}) {
  const shop = SUPERMARKETS.find((s) => s.id === store) ?? SUPERMARKETS[0];
  const [copied, setCopied] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const storageKey = seed === null ? null : `shopping:${seed}`;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setTicked(raw ? JSON.parse(raw) : {});
    } catch {
      setTicked({});
    }
  }, [storageKey]);

  function toggle(id: string) {
    setTicked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      // Best effort. A full or blocked localStorage must not stop the tick from
      // showing — the on-screen state is the thing being used.
      if (storageKey) {
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }

  function clear() {
    setTicked({});
    if (storageKey) {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shoppingListText(list));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the list is on screen anyway */ }
  }

  const done = useMemo(
    () => list.lines.filter((l) => ticked[l.food.id]).length,
    [list, ticked]
  );
  const total = list.lines.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  // What's left to buy, not what the whole week costs. Standing in the shop
  // having ticked most of it, the useful number is the rest of the basket.
  const remainingCost = list.lines
    .filter((l) => !ticked[l.food.id])
    .reduce((s, l) => s + l.cost, 0);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-white/[0.08] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Was a `stat-label` — a 10px uppercase whisper for the thing half
                this feature exists to produce. */}
            <h3 className="text-lg font-extrabold">Shopping list</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {done === total && total > 0
                ? "All done — that's the week's shop."
                : `${done} of ${total} in the basket · ~£${remainingCost.toFixed(2)} left to buy`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-lg font-extrabold text-pitch-400">~£{list.total.toFixed(2)}</span>
            <button onClick={copy} className="tap-target text-xs text-slate-400 hover:text-pitch-400">
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-pitch-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Above the list, because it decides what tapping the search link does.
            It used to sit underneath, after a sentence telling you to tap items
            you had already scrolled past. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Now decides the PRICES as well as the search links. The same
              basket differs by well over 10% between a discounter and a
              mid-market chain, which is more than most of the savings the
              planner works to find — quoting one number for all four shops
              made the total wrong for three of them. */}
          <span className="text-xs text-slate-500">Shopping at</span>
          {SUPERMARKETS.map((sm) => (
            <button
              key={sm.id}
              onClick={() => onStore(sm.id)}
              className={`chip transition ${store === sm.id ? "border-pitch-400/50 text-pitch-400" : "hover:text-slate-200"}`}
            >
              {sm.name}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-white/[0.05]">
        {list.byAisle.map((group) => {
          const groupDone = group.lines.filter((l) => ticked[l.food.id]).length;
          const allDone = groupDone === group.lines.length;
          return (
            <div key={group.aisle} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wide transition ${allDone ? "text-slate-600" : "text-slate-400"}`}>
                  {group.aisle}
                  {allDone && <span className="ml-1.5 text-pitch-400">✓</span>}
                </span>
                <span className="text-xs tabular-nums text-slate-600">
                  {groupDone}/{group.lines.length} · ~£{group.cost.toFixed(2)}
                </span>
              </div>

              <ul className="space-y-0.5">
                {group.lines.map((l) => {
                  const isTicked = !!ticked[l.food.id];
                  return (
                    <li key={l.food.id} className="flex items-center gap-1">
                      {/* The whole row is the tick. It's the gesture you make
                          with one hand while pushing a trolley with the other,
                          so it gets the big target and the small link doesn't. */}
                      <button
                        onClick={() => toggle(l.food.id)}
                        aria-pressed={isTicked}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-1 pr-2 text-left transition hover:bg-white/[0.03]"
                      >
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-bold transition ${
                            isTicked
                              ? "border-pitch-400 bg-pitch-400 text-slate-950"
                              : "border-white/25 bg-white/[0.03] text-transparent"
                          }`}
                          aria-hidden
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm transition ${isTicked ? "text-slate-600 line-through" : "text-slate-200"}`}>
                            {l.food.name}
                            <span className={isTicked ? "text-slate-600" : "text-slate-500"}>
                              {" "}× {l.packs} <span className="text-slate-600">({l.food.packLabel})</span>
                            </span>
                          </span>
                          {/* One bag across six meals is the whole point of
                              buying the bag — say so, or it reads as £1.45
                              spent on a single dinner. */}
                          {l.meals > 1 && !isTicked && (
                            <span className="block text-[11px] text-slate-500">covers {l.meals} meals this week</span>
                          )}
                        </span>
                        <span className={`shrink-0 tabular-nums text-sm transition ${isTicked ? "text-slate-600" : l.corrected ? "text-pitch-400" : "text-slate-400"}`}>
                          {l.corrected ? "" : "~"}£{l.cost.toFixed(2)}
                        </span>
                      </button>

                      {/* THE ONLY PRICE IN HERE THAT IS KNOWN RATHER THAN
                          GUESSED. We can't read supermarket prices — there is no
                          public API and scraping the storefronts is against
                          their terms — so the athlete standing in the shop is a
                          better source than our table will ever be. Corrections
                          are kept across weeks, because what a pack costs is a
                          fact about their shop and not about this plan. */}
                      <button
                        onClick={() => {
                          const now = (l.cost / l.packs).toFixed(2);
                          const typed = window.prompt(
                            `What does one ${l.food.packLabel} of ${l.food.name} cost at ${shop.name}?\n\nLeave blank to go back to our estimate.`,
                            l.corrected ? now : ""
                          );
                          if (typed === null) return;
                          const n = Number(typed.replace(/[^\d.]/g, ""));
                          onCorrectPrice(l.food.id, typed.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n);
                        }}
                        className="tap-target shrink-0 px-2 text-[11px] text-slate-600 hover:text-pitch-400"
                        aria-label={`Correct the price of ${l.food.name}`}
                      >
                        {l.corrected ? "edit" : "fix price"}
                      </button>

                      {/* Deliberately small and deliberately separate. Leaving
                          the app is a thing you sometimes want and never want by
                          accident. */}
                      <a
                        href={productLink(l.food, shop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Search ${l.food.name} in ${shop.name}`}
                        className="tap-target shrink-0 rounded-lg px-2 py-2 text-slate-600 transition hover:text-pitch-400"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                        </svg>
                        <span className="sr-only">Search {l.food.name} in {shop.name}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/[0.08] p-4">
        <p className="text-[11px] leading-relaxed text-slate-500">
          {list.ongoingTotal < list.total - 1 && (
            <>
              {/* THE HONEST WEEKLY NUMBER. The total above is what the till
                  charges with a bare cupboard — it buys a whole £3.50 bottle of
                  oil to use 165ml. Repeated over the oil, spices, honey and
                  peanut butter that overstated a week by around a quarter, and
                  it is the figure someone deciding whether they can afford to
                  eat like this was reading. */}
              About <strong className="text-slate-300">£{list.ongoingTotal.toFixed(2)}</strong> of this
              is food you&rsquo;ll actually eat this week — the rest is cupboard and freezer
              stock that lasts, so a normal week runs nearer £{list.ongoingCostPerMeal.toFixed(2)} a meal.{" "}
            </>
          )}
          ~£{list.costPerMeal.toFixed(2)} a meal across {list.mealsPlanned} meals. Estimated {shop.name}
          prices, reviewed {PRICES_REVIEWED} — not live, so your basket will differ. Tap
          &ldquo;fix price&rdquo; on anything that&rsquo;s wrong and we&rsquo;ll use your number from then on.
        </p>
        {done > 0 && (
          <button onClick={clear} className="tap-target mt-2 text-xs text-slate-500 hover:text-slate-300">
            Reset ticks
          </button>
        )}
      </div>
    </div>
  );
}
