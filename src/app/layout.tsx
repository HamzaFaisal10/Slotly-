import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import { DemoProvider } from "@/components/demo-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Slotly: online booking for service businesses", template: "%s · Slotly" },
  description:
    "Online booking, deposits, a team calendar and an AI receptionist for salons, clinics and studios.",
};

export const viewport: Viewport = { themeColor: "#fafafd" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
