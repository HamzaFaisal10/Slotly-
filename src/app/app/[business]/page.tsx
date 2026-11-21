import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata = { title: "Dashboard" };

export default async function Page({ params }: PageProps<"/app/[business]">) {
  const { business } = await params;
  return <Dashboard slug={business} />;
}
