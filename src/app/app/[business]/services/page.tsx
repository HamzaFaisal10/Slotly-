import { ServicesPage } from "@/components/dashboard/pages/services";

export const metadata = { title: "Services" };

export default async function Page({ params }: PageProps<"/app/[business]/services">) {
  const { business } = await params;
  return <ServicesPage slug={business} />;
}
