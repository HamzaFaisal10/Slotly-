"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { send, startConversation } from "@/lib/receptionist/receptionist";
import type { Business } from "@/lib/types";

/**
 * Voice receptionist. In the demo it uses the browser's own speech
 * recognition and speech synthesis (free, no account). In production the same
 * receptionist runs behind a voice provider such as Vapi on a real phone line.
 */

type Phase = "connecting" | "speaking" | "listening" | "thinking" | "ended" | "unsupported";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const preferred = ["Google UK English Female", "Samantha", "Microsoft Aria", "Microsoft Jenny", "Google US English", "Karen", "Serena"];
  for (const name of preferred) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
}

const forSpeech = (t: string) =>
  t
    .replace(/\(Times in [^)]+\)/g, "")
    .replace(/SL-([A-Z0-9]{6})/g, (_, c: string) => `S L ${c.split("").join(" ")}`)
    .replace(/\$(\d+)/g, "$1 dollars");

export function VoiceCall({ business, onClose }: { business: Business; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<((text: string) => Promise<void>) | null>(null);
  const listenRef = useRef<(() => void) | null>(null);
  const failedRef = useRef(false);

  const messages = useLiveQuery(
    async () => (conversationId ? getDb().messages.where("conversationId").equals(conversationId).sortBy("at") : []),
    [conversationId],
  );
  const link = [...(messages ?? [])].reverse().find((m) => m.link)?.link;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, interim]);

  const listen = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || !activeRef.current) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let final = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = text;
      }
      setInterim(text);
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        activeRef.current = activeRef.current && e.error !== "not-allowed";
        setPhase("unsupported");
        failedRef.current = true;
      }
    };
    rec.onend = () => {
      recRef.current = null;
      if (!activeRef.current || failedRef.current) return;
      setInterim("");
      if (final.trim()) void handleRef.current?.(final.trim());
      else setTimeout(() => activeRef.current && listenRef.current?.(), 250); // silence: keep listening
    };
    recRef.current = rec;
    setPhase("listening");
    try {
      rec.start();
    } catch {
      setPhase("unsupported");
    }
  }, []);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth || !activeRef.current) return resolve();
        setPhase("speaking");
        const u = new SpeechSynthesisUtterance(forSpeech(text));
        const v = pickVoice();
        if (v) u.voice = v;
        u.rate = 1.03;
        // Some browsers never fire onend; don't let the call hang on that.
        const guard = setTimeout(resolve, 1500 + text.split(" ").length * 420);
        u.onend = () => (clearTimeout(guard), resolve());
        u.onerror = () => (clearTimeout(guard), resolve());
        synth.speak(u);
      }),
    [],
  );

  const conversationRef = useRef<string | null>(null);
  const handle = useCallback(
    async (text: string) => {
      const id = conversationRef.current;
      if (!id) return;
      setPhase("thinking");
      const replies = await send(id, text);
      for (const r of replies) await speak(r.text);
      if (!activeRef.current) return;
      if (recognitionCtor() && !failedRef.current) listen();
      else setPhase("unsupported");
    },
    [listen, speak],
  );

  useEffect(() => {
    handleRef.current = handle;
    listenRef.current = listen;
  }, [handle, listen]);

  // Start the call
  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;
    (async () => {
      const c = await startConversation(business.id, "voice");
      if (cancelled) return;
      conversationRef.current = c.id;
      setConversationId(c.id);
      window.speechSynthesis?.getVoices();
      await new Promise((r) => setTimeout(r, 700)); // ring
      const first = await getDb().messages.where("conversationId").equals(c.id).first();
      await speak(first?.text ?? "Hello");
      if (!activeRef.current) return;
      if (recognitionCtor()) listen();
      else setPhase("unsupported");
    })();
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      cancelled = true;
      activeRef.current = false;
      clearInterval(timer);
      recRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, [business.id, listen, speak]);

  const hangUp = () => {
    activeRef.current = false;
    recRef.current?.abort();
    window.speechSynthesis?.cancel();
    setPhase("ended");
    setTimeout(onClose, 600);
  };

  const sendTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    recRef.current?.abort();
    const t = typed;
    setTyped("");
    void handle(t);
  };

  const status = {
    connecting: "Calling…",
    speaking: "Receptionist is speaking",
    listening: "Listening, go ahead",
    thinking: "One moment…",
    ended: "Call ended",
    unsupported: "Voice isn't available here, type instead",
  }[phase];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim/60 p-0 sm:items-center sm:p-6" role="dialog" aria-label="Call with the receptionist">
      <div className="animate-rise flex h-[100dvh] w-full flex-col overflow-hidden bg-contrast text-on-contrast sm:h-[min(720px,90vh)] sm:max-w-md sm:rounded-[32px]">
        <div className="flex flex-col items-center px-6 pb-4 pt-10 text-center">
          <div className="relative">
            <span
              className={clsx(
                "absolute inset-0 rounded-full bg-accent/40",
                (phase === "speaking" || phase === "listening") && "animate-ping",
              )}
            />
            <span
              className={clsx(
                "relative flex h-24 w-24 items-center justify-center rounded-full font-display text-3xl font-bold",
                phase === "listening" ? "bg-[#3ddc97] text-ink" : "bg-accent",
              )}
            >
              L
            </span>
          </div>
          <p className="mt-5 font-display text-2xl font-semibold">{business.name}</p>
          <p className="text-sm text-on-contrast/60">
            AI receptionist · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </p>
          <p className="mt-3 rounded-full bg-on-contrast/10 px-3 py-1 text-sm" aria-live="polite">
            {status}
          </p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-3 text-[15px]">
          {messages?.map((m) => (
            <p key={m.id} className={clsx("leading-snug", m.role === "user" ? "text-right text-on-contrast/60" : "text-on-contrast/85")}>
              {m.text}
            </p>
          ))}
          {interim && <p className="text-right italic text-on-contrast/50">{interim}</p>}
          <div ref={endRef} />
        </div>

        {link && (
          <div className="px-5 pb-3">
            <Link href={link.href} onClick={hangUp} className="block rounded-2xl bg-surface py-3 text-center font-medium text-ink hover:bg-glow">
              {link.label}
            </Link>
          </div>
        )}

        <form onSubmit={sendTyped} className="flex gap-2 px-5 pb-3">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={phase === "unsupported" ? "Type what you'd say" : "Or type here"}
            aria-label="Type instead of speaking"
            className="min-w-0 flex-1 rounded-full bg-on-contrast/10 px-4 py-2.5 text-[15px] placeholder:text-on-contrast/40 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button type="submit" className="rounded-full bg-on-contrast/15 px-4 text-sm font-medium hover:bg-on-contrast/25">
            Send
          </button>
        </form>

        <div className="flex items-center justify-center gap-4 px-6 pb-8 pt-2">
          <button
            onClick={hangUp}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-bad text-on-accent shadow-lg hover:brightness-110"
            aria-label="End call"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.47a1 1 0 0 1-1.41.02 11.4 11.4 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z" />
            </svg>
          </button>
        </div>
        <p className="pb-4 text-center text-[11px] text-on-contrast/40">
          Demo: your browser&apos;s speech in Chrome or Edge. Live builds answer a real phone number.
        </p>
      </div>
    </div>
  );
}
