import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import { DemoProvider } from "@/components/demo-provider";
import { ThemePicker } from "@/components/theme-picker";
import { themeBootScript } from "@/lib/theme-boot";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Slotly: online booking for service businesses", template: "%s · Slotly" },
  description:
    "Online booking, deposits, a team calendar and an AI receptionist for salons, clinics and studios.",
};

export const viewport: Viewport = { themeColor: "#fdf6f6" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full">
        <DemoProvider>{children}</DemoProvider>
        <ThemePicker />
      </body>
    </html>
  );
}
