import { createFileRoute } from "@tanstack/react-router";
import TarkovTD from "@/game/TarkovTD";

const title = "ScavLord TD";
const description =
  "Prepare a rider, deploy into a hostile zone, hold the extract against scav factions, loot, and walk out alive.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <TarkovTD />;
}
