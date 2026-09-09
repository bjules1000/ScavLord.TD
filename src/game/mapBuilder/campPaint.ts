import type { HubAction } from "../campActions";
import type { EditorMapDoc, EditorProp } from "./schema";

/** Assigns (or clears, with `action: null`) which hub screen a placed camp prop opens. */
export function setPropHubAction(doc: EditorMapDoc, propId: string, action: HubAction | null): EditorMapDoc {
  if (doc.status === "locked") return doc;
  if (!doc.props.some((p) => p.id === propId)) return doc;
  return {
    ...doc,
    props: doc.props.map((p): EditorProp => {
      if (p.id !== propId) return p;
      if (action === null) {
        const { hubAction: _drop, ...rest } = p;
        return rest;
      }
      return { ...p, hubAction: action };
    }),
  };
}
