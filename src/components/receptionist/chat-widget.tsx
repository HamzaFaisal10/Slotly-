"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { getDb } from "@/lib/db";
import { send, startConversation } from "@/lib/receptionist/receptionist";
import type { Business, ChatMessage } from "@/lib/types";

const KEY = (b: string) => `slotly-chat-${b}`;

export function ChatWidget({ business, onCall }: { business: Business; onCall?: () => void }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useLiveQuery(
    async () => (conversationId ? getDb().messages.where("conversationId").equals(conversationId).sortBy("at") : []),
    [conversationId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, thinking]);

  const ensureConversation = async () => {
    if (conversationId) return conversationId;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(KEY(business.id));
    } catch {}
    if (!id || !(await getDb().conversations.get(id))) {
      id = (await startConversation(business.id, "chat")).id;
      try {
        sessionStorage.setItem(KEY(business.id), id);
      } catch {}
    }
    setConversationId(id);
    return id;
  };

  const toggle = async () => {
    if (!open) await ensureConversation();
    setOpen((o) => !o);
  };

  const submit = async (value: string) => {
    const v = value.trim();
    if (!v || thinking) return;
    const id = await ensureConversation();
    setText("");
    setThinking(true);
    // A short pause so replies read like a person typing, not a form submit.
    await Promise.all([send(id, v), new Promise((r) => setTimeout(r, 650))]);
    setThinking(false);
  };

  const restart = async () => {
    const id = (await startConversation(business.id, "chat")).id;
    try {
      sessionStorage.setItem(KEY(business.id), id);
    } catch {}
    setConversationId(id);
  };

  const last = messages?.at(-1);

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end lg:bottom-4">
      {open && (
        <div
          role="dialog"
          aria-label={`${business.name} receptionist`}
          className="animate-rise mb-3 flex h-[min(620px,75vh)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_30px_70px_-20px_rgba(31,26,46,0.45)] ring-1 ring-line"
        >
          <header className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-violet font-display font-semibold">
              L
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink bg-[#3ddc97]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{business.name} receptionist</span>
              <span className="block text-xs text-white/60">AI assistant · replies instantly</span>
            </span>
            {onCall && (
              <button
                onClick={onCall}
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
                aria-label="Call the receptionist"
              >
                Call
              </button>
            )}
            <button onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-sm text-white/70 hover:text-white" aria-label="Close chat">
              ✕
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4" aria-live="polite">
            {messages?.map((m) => <Bubble key={m.id} m={m} interactive={m.id === last?.id && !thinking} onChoice={submit} />)}
            {thinking && (
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 ring-1 ring-line w-fit" aria-label="Typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(text);
            }}
            className="flex items-center gap-2 border-t border-line bg-white p-3"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask or book, e.g. haircut Saturday afternoon"
              aria-label="Message"
              className="min-w-0 flex-1 rounded-full bg-mist px-4 py-2.5 text-[15px] placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-violet"
            />
            <button
              type="submit"
              disabled={!text.trim() || thinking}
              className="rounded-full bg-violet px-4 py-2.5 text-sm font-medium text-white disabled:bg-ink-3/50"
            >
              Send
            </button>
          </form>
          <div className="flex items-center justify-between bg-white px-4 pb-2 text-[11px] text-ink-3">
            <span>Demo mode: answers come from this salon&apos;s data.</span>
            <button onClick={restart} className="underline-offset-2 hover:underline">
              New chat
            </button>
          </div>
        </div>
      )}

      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-violet py-3 pl-4 pr-5 font-medium text-white shadow-[0_12px_30px_-8px_rgba(91,75,219,0.7)] hover:bg-violet-dark"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        {open ? "Close" : "Ask or book"}
      </button>
    </div>
  );
}

function Bubble({ m, interactive, onChoice }: { m: ChatMessage; interactive: boolean; onChoice: (v: string) => void }) {
  const mine = m.role === "user";
  return (
    <div className={clsx("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug",
          mine ? "rounded-br-md bg-violet text-white" : "rounded-bl-md bg-white text-ink ring-1 ring-line",
        )}
      >
        {m.text}
      </div>
      {m.link && (
        <Link href={m.link.href} className="mt-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-2">
          {m.link.label}
        </Link>
      )}
      {interactive && m.choices && m.choices.length > 0 && (
        <div className="mt-2 flex max-w-[95%] flex-wrap gap-1.5">
          {m.choices.map((c) => (
            <button
              key={c.value}
              onClick={() => onChoice(c.value)}
              className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-violet-dark ring-1 ring-violet/40 hover:bg-violet hover:text-white"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
