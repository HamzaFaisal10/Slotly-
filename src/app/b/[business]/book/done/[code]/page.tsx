import { Confirmation } from "@/components/customer/confirmation";

export const metadata = { title: "You're booked" };

export default async function Page({ params }: PageProps<"/b/[business]/book/done/[code]">) {
  const { code } = await params;
  return <Confirmation code={code} />;
}
