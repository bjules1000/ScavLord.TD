import { createFileRoute } from "@tanstack/react-router";
import MapBuilder from "@/game/mapBuilder/MapBuilder";

const title = "DEV MAP BUILDER — ScavLord TD";

function mapEditorSearch(search: Record<string, unknown>): { map?: string } {
  const map = search["map"];
  if (typeof map === "string" && map.length > 0) return { map };
  return {};
}

export const Route = createFileRoute("/dev/map-editor")({
  validateSearch: mapEditorSearch,
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
  const search = Route.useSearch();
  return search.map ? <MapBuilder initialMapId={search.map} /> : <MapBuilder />;
}
