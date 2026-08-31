import { MAP_BUILDER_STORAGE_KEY, MAP_BUILDER_SCHEMA_VERSION, type EditorMapDoc, type EditorStoreV1 } from "./schema";
import { normalizeEditorDoc } from "./document";

export { MAP_BUILDER_STORAGE_KEY, MAP_BUILDER_SCHEMA_VERSION };

export function emptyStore(): EditorStoreV1 {
  return { version: MAP_BUILDER_SCHEMA_VERSION, activeId: "", docs: {} };
}

export function readStore(storage: Pick<Storage, "getItem"> | null): EditorStoreV1 {
  if (!storage) return emptyStore();
  const raw = storage.getItem(MAP_BUILDER_STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as EditorStoreV1;
    if (parsed.version !== MAP_BUILDER_SCHEMA_VERSION || !parsed.docs || typeof parsed.docs !== "object") {
      return emptyStore();
    }
    return {
      version: MAP_BUILDER_SCHEMA_VERSION,
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : "",
      docs: Object.fromEntries(
        Object.entries(parsed.docs).map(([id, doc]) => [id, normalizeEditorDoc(doc as EditorMapDoc)]),
      ),
    };
  } catch {
    return emptyStore();
  }
}

export function writeStore(storage: Pick<Storage, "setItem"> | null, store: EditorStoreV1): void {
  if (!storage) return;
  storage.setItem(MAP_BUILDER_STORAGE_KEY, JSON.stringify(store));
}

export function upsertDoc(store: EditorStoreV1, doc: EditorMapDoc): EditorStoreV1 {
  return {
    version: MAP_BUILDER_SCHEMA_VERSION,
    activeId: doc.id,
    docs: { ...store.docs, [doc.id]: doc },
  };
}

export function removeDoc(store: EditorStoreV1, id: string): EditorStoreV1 {
  const docs = { ...store.docs };
  delete docs[id];
  const ids = Object.keys(docs);
  return {
    version: MAP_BUILDER_SCHEMA_VERSION,
    activeId: store.activeId === id ? (ids[0] ?? "") : store.activeId,
    docs,
  };
}

export function gameplaySaveKey(): string {
  return "kolkhoz-meta-v5";
}

export function storageKeysOverlap(): boolean {
  return MAP_BUILDER_STORAGE_KEY === gameplaySaveKey();
}
