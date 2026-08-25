import { createFileRoute } from "@tanstack/react-router";
import TarkovTD from "@/game/TarkovTD";

const title = "Kolkhoz Checkpoint — 8-Bit Tarkov Tower Defense";
const description =
  "Hold the extract in an 8-bit Escape from Tarkov tower defense roguelike: deploy PMC operators, farm roubles, loot perks and stop scavs, raiders and Reshala.";

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
