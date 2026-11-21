import { Suspense } from "react";
import { BookingFlow } from "@/components/customer/booking-flow";

export const metadata = { title: "Book an appointment" };

export default async function Page({ params }: PageProps<"/b/[business]/book">) {
  const { business } = await params;
  return (
    <Suspense>
      <BookingFlow slug={business} />
    </Suspense>
  );
}
