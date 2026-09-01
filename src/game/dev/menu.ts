export type DevToolId = "ui-editor" | "map-builder" | "balance-lab" | "economy-lab" | "wave-lab" | "quest-editor";

export interface DevToolEntry {
  id: DevToolId;
  label: string;
}

export const DEV_TOOL_ENTRIES: readonly DevToolEntry[] = [
  { id: "ui-editor", label: "UI Editor" },
  { id: "map-builder", label: "Map Builder" },
  { id: "balance-lab", label: "Balance Lab" },
  { id: "economy-lab", label: "Economy Lab" },
  { id: "wave-lab", label: "Wave Lab" },
  { id: "quest-editor", label: "Quest Editor" },
];

export function devToolEntries(enabled: boolean): readonly DevToolEntry[] {
  return enabled ? DEV_TOOL_ENTRIES : [];
}

export function confirmLeaveRaidForMapBuilder(): boolean {
  if (typeof window === "undefined") return true;
  return window.confirm("Leave this raid for Map Builder? The raid will not be saved.");
}
