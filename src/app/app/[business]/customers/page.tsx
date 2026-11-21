import { CustomersPage } from "@/components/dashboard/pages/customers";

export const metadata = { title: "Customers" };

export default async function Page({ params }: PageProps<"/app/[business]/customers">) {
  const { business } = await params;
  return <CustomersPage slug={business} />;
}
