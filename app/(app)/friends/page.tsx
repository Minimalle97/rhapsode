// app/(app)/friends/page.tsx

import { FriendsHub } from "@/components/friends/FriendsHub";

export const metadata = { title: "Friends" };

export default function FriendsPage() {
  return <FriendsHub />;
}
