"use client";

import clsx from "clsx";
import { useTheme } from "@/lib/theme";

const SIZES = {
  calendar: [1440, 900],
  conversations: [1440, 900],
  customers: [1440, 900],
  payments: [1440, 900],
  "booking-mobile": [780, 1688],
  "business-mobile": [780, 1688],
  "chat-mobile": [780, 1688],
} as const;

export type ShotName = keyof typeof SIZES;

/** A real screenshot of the app, in the theme the visitor is looking at. */
export function ProductShot({
  name,
  alt,
  className,
  priority,
}: {
  name: ShotName;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const theme = useTheme();
  const [w, h] = SIZES[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- screenshots swap per theme on the client
    <img
      src={`/product/${theme}/${name}.webp`}
      alt={alt}
      width={w}
      height={h}
      loading={priority ? "eager" : "lazy"}
      className={clsx("block h-auto w-full", className)}
    />
  );
}

/** Desktop app window around a screenshot. */
export function BrowserFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-hidden rounded-2xl bg-surface shadow-[0_40px_90px_-40px_rgba(18,10,16,0.55)] ring-1 ring-line", className)}>
      <div className="flex items-center gap-1.5 border-b border-line bg-mist/60 px-4 py-2.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="ml-3 h-5 flex-1 rounded-md bg-surface ring-1 ring-line" />
      </div>
      {children}
    </div>
  );
}

/** Phone around a mobile screenshot. */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-[38px] bg-contrast p-2.5 shadow-[0_40px_80px_-30px_rgba(18,10,16,0.6)]", className)}>
      <div className="overflow-hidden rounded-[30px]">{children}</div>
    </div>
  );
}
