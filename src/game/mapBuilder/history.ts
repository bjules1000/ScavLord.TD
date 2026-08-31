import { HISTORY_LIMIT, cloneDoc, type EditorMapDoc } from "./schema";

export interface EditorSession {
  doc: EditorMapDoc;
  past: EditorMapDoc[];
  future: EditorMapDoc[];
}

export function sessionFrom(doc: EditorMapDoc): EditorSession {
  return { doc: cloneDoc(doc), past: [], future: [] };
}

export function commit(session: EditorSession, next: EditorMapDoc): EditorSession {
  if (session.doc.status === "locked") return session;
  if (next === session.doc) return session;
  const past = [...session.past, cloneDoc(session.doc)];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { doc: next, past, future: [] };
}

/**
 * Commit a live stroke preview. Must compare against the last committed
 * session doc — never against the preview itself, or the stroke is dropped.
 */
export function commitStroke(session: EditorSession, preview: EditorMapDoc | null): EditorSession {
  if (!preview) return session;
  return commit(session, preview);
}

export function undo(session: EditorSession): EditorSession {
  const prev = session.past[session.past.length - 1];
  if (!prev) return session;
  return {
    doc: cloneDoc(prev),
    past: session.past.slice(0, -1),
    future: [...session.future, cloneDoc(session.doc)],
  };
}

export function redo(session: EditorSession): EditorSession {
  const next = session.future[session.future.length - 1];
  if (!next) return session;
  return {
    doc: cloneDoc(next),
    past: [...session.past, cloneDoc(session.doc)],
    future: session.future.slice(0, -1),
  };
}

export function replaceDoc(session: EditorSession, doc: EditorMapDoc): EditorSession {
  return sessionFrom(doc);
}

export function canUndo(session: EditorSession): boolean {
  return session.past.length > 0;
}

export function canRedo(session: EditorSession): boolean {
  return session.future.length > 0;
}
