"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { DEMO_BUSINESS_ID, DEMO_SLUG } from "@/lib/seed";
import { signIn, type DemoSession } from "@/lib/session";
import { Avatar } from "@/components/ui";

/** One-click demo sign-in. A real build uses Supabase Auth (email + password or magic link). */
export function SignInPicker() {
  const router = useRouter();
  const staff = useLiveQuery(() => getDb().staff.where("businessId").equals(DEMO_BUSINESS_ID).toArray(), []);

  const enter = (s: DemoSession) => {
    signIn(s);
    router.push(`/app/${DEMO_SLUG}`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <Link href="/" className="font-display text-xl font-bold">
        Slotly
      </Link>
      <h1 className="mt-10 font-display text-4xl font-semibold tracking-tight">Sign in to Lumen Studio</h1>
      <p className="mt-2 text-ink-2">
        Demo accounts, no password needed. Each role sees what it would see in the real product.
      </p>

      <div className="mt-8 space-y-2">
        <RoleButton
          title="Maya Brooks, owner"
          body="Everything: dashboard, team calendar, every booking."
          onClick={() => enter({ role: "owner", name: "Maya Brooks" })}
          initials="Maya Brooks"
          color="#1f1a2e"
        />
        <RoleButton
          title="Front desk, manager"
          body="The team calendar and bookings for all staff."
          onClick={() => enter({ role: "manager", name: "Front desk" })}
          initials="Front Desk"
          color="#4d4763"
        />
      </div>

      <p className="mt-8 text-sm font-medium text-ink-3">Or as a team member</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {staff?.map((m) => (
          <RoleButton
            key={m.id}
            title={m.name}
            body={m.title}
            initials={m.name}
            color={m.color}
            onClick={() => enter({ role: "staff", staffId: m.id, name: m.name })}
          />
        ))}
      </div>
    </main>
  );
}

function RoleButton({
  title,
  body,
  initials,
  color,
  onClick,
}: {
  title: string;
  body: string;
  initials: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-line hover:ring-2 hover:ring-accent"
    >
      <Avatar name={initials} color={color} size={40} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-sm text-ink-3">{body}</span>
      </span>
    </button>
  );
}
