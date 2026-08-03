// app/(app)/today/page.tsx

import { TodayQueue } from "@/components/today/TodayQueue";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return <TodayQueue />;
}
