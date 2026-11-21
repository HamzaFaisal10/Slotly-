import { ButtonLink } from "@/components/ui";

export function NotFound({ what = "page" }: { what?: string }) {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">We couldn&apos;t find that {what}.</h1>
      <p className="mt-3 text-ink-2">Check the link, or start again from the demo salon.</p>
      <ButtonLink href="/b/lumen-studio" className="mt-6">
        Go to Lumen Studio
      </ButtonLink>
    </main>
  );
}
