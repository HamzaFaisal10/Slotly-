import { PaymentsPage } from "@/components/dashboard/pages/payments";

export const metadata = { title: "Payments" };

export default async function Page({ params }: PageProps<"/app/[business]/payments">) {
  const { business } = await params;
  return <PaymentsPage slug={business} />;
}
