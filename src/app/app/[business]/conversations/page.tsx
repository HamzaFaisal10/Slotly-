import { ConversationsPage } from "@/components/dashboard/pages/conversations";

export const metadata = { title: "Conversations" };

export default async function Page({ params }: PageProps<"/app/[business]/conversations">) {
  const { business } = await params;
  return <ConversationsPage slug={business} />;
}
