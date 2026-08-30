import { createFileRoute } from "@tanstack/react-router";
import MapBuilder from "@/game/mapBuilder/MapBuilder";

const title = "DEV MAP BUILDER — ScavLord TD";

export const Route = createFileRoute("/dev/map-editor")({
  head: () => ({
    meta: [
      { title },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Developer-only map authoring tool. Not part of raid progression." },
    ],
  }),
  component: MapBuilderPage,
});

function MapBuilderPage() {
  return <MapBuilder />;
}
