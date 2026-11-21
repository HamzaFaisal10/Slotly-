import { ManageBooking } from "@/components/customer/manage-booking";

export const metadata = { title: "Manage booking" };

export default async function Page({ params }: PageProps<"/booking/[code]">) {
  const { code } = await params;
  return <ManageBooking code={code} />;
}
