import { TeamPage } from "@/components/dashboard/pages/team";

export const metadata = { title: "Team" };

export default async function Page({ params }: PageProps<"/app/[business]/team">) {
  const { business } = await params;
  return <TeamPage slug={business} />;
}
