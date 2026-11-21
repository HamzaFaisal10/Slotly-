import { BusinessPage } from "@/components/customer/business-page";

export default async function Page({ params }: PageProps<"/b/[business]">) {
  const { business } = await params;
  return <BusinessPage slug={business} />;
}
