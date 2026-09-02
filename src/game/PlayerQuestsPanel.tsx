/**
 * Player-facing Quest panel — Active (ACTIVE + READY_TO_REDEEM) / Completed.
 */

import {
  evaluateQuest,
  getQuestLifecycle,
  getQuestTracker,
  type QuestLifecycle,
  type QuestProgress,
  type QuestSpec,
  type QuestUnlockContext,
} from "./quests";

export type PlayerQuestFilter = "active" | "completed";

export function playerVisibleQuests(
  catalog: readonly QuestSpec[],
  ctx: QuestUnlockContext,
  progress: QuestProgress,
  filter: PlayerQuestFilter,
): QuestSpec[] {
  return catalog.filter((spec) => {
    const life = getQuestLifecycle(spec, ctx, progress);
    if (life === "LOCKED") return false;
    if (filter === "completed") return life === "COMPLETED";
    return life === "ACTIVE" || life === "READY_TO_REDEEM";
  });
}

export default function PlayerQuestsPanel({
  catalog,
  unlockCtx,
  questProgress,
  filter,
  onFilter,
  onRedeem,
}: {
  catalog: readonly QuestSpec[];
  unlockCtx: QuestUnlockContext;
  questProgress: QuestProgress;
  filter: PlayerQuestFilter;
  onFilter: (f: PlayerQuestFilter) => void;
  onRedeem: (questId: string) => void;
}) {
  const list = playerVisibleQuests(catalog, unlockCtx, questProgress, filter);

  return (
    <div className="pixel-card pixel-scrollbar max-h-[min(70vh,36rem)] w-full overflow-auto p-3 text-left sm:p-4">
      <div className="flex flex-wrap gap-2">
        {(["active", "completed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onFilter(t)}
            className={`border-2 px-3 py-1.5 font-display text-[11px] uppercase tracking-wide sm:text-[12px] ${
              filter === t ? "border-primary text-primary" : "border-border/60 text-muted-foreground"
            }`}
          >
            {t === "active" ? "ACTIVE" : "COMPLETED"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {list.length === 0 ? (
          <div className="font-mono text-[13px] text-muted-foreground sm:text-[14px]">
            {filter === "active" ? "No active quests." : "No completed quests yet."}
          </div>
        ) : (
          list.map((spec) => {
            const life: QuestLifecycle = getQuestLifecycle(spec, unlockCtx, questProgress);
            const evald = evaluateQuest(spec, {
              kind: "meta",
              progress: getQuestTracker(questProgress, spec.id),
            });
            const ready = life === "READY_TO_REDEEM";
            return (
              <div
                key={spec.id}
                className="border-b-2 border-border/50 pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div
                      className={`font-display text-[16px] leading-tight sm:text-[18px] ${
                        life === "COMPLETED" ? "text-muted-foreground" : "text-primary"
                      }`}
                    >
                      {life === "COMPLETED" ? "✓ " : ""}
                      {spec.name}
                    </div>
                    {ready && (
                      <div className="mt-1 font-display text-[12px] uppercase tracking-wide text-accent sm:text-[13px]">
                        Ready to redeem
                      </div>
                    )}
                    <div className="mt-1.5 font-mono text-[13px] leading-snug text-foreground/90 sm:text-[14px]">
                      {spec.desc}
                    </div>
                  </div>
                  {ready && (
                    <button
                      type="button"
                      onClick={() => onRedeem(spec.id)}
                      className="pixel-btn pixel-btn-primary shrink-0 px-3 py-2 text-[11px] sm:text-[12px]"
                    >
                      REDEEM
                    </button>
                  )}
                </div>

                {(life === "ACTIVE" || life === "READY_TO_REDEEM") && (
                  <ul className="mt-3 space-y-1.5 font-mono text-[12px] sm:text-[13px]">
                    {evald.objectives.map((row) => (
                      <li
                        key={row.label}
                        className={`grid grid-cols-[1fr_auto] gap-3 ${
                          row.done ? "text-accent" : "text-foreground"
                        }`}
                      >
                        <span>
                          {row.done ? "✓" : "□"} {row.label.toUpperCase()}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {Math.min(row.current, row.required)} / {row.required}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
