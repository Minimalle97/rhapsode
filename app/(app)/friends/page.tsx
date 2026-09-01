// app/(app)/friends/page.tsx

import { requireUser } from "@/lib/auth";
import { markAcceptancesSeen } from "@/lib/duels";
import { FriendsHub } from "@/components/friends/FriendsHub";

export const metadata = { title: "Friends" };

// Kvitteringen nedan skriver, sa sidan far inte cachas.
export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const user = await requireUser();

  // Den grona bubblan pa fliken betyder "nagon antog din inbjudan". Har
  // ar man framme, och da har man sett den. Kvitteras vid renderingen och
  // inte vid ett klick nagon annanstans, sa att den inte kan bli hangande
  // for att man navigerade bort halvvags.
  //
  // Layouten har redan raknat sina siffror nar det har kors, sa bubblan
  // star kvar just den har laddningen. Det ar med flit: den pekar ut var
  // nyheten finns pa sidan man nyss oppnade, och ar borta vid nasta steg.
  await markAcceptancesSeen(user.id);

  return <FriendsHub />;
}
