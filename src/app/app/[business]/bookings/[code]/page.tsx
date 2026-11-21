import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata = { title: "Booking" };

export default async function Page({ params }: PageProps<"/app/[business]/bookings/[code]">) {
  const { business, code } = await params;
  return <Dashboard slug={business} initialCode={code} />;
}
