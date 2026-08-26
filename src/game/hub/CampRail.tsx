import { compactContracts } from "./contracts";
import { DEBUFF_BY_ID, xpForLevel, type Meta } from "../meta";

export default function CampRail({ meta }: { meta: Meta }) {
  const need = xpForLevel(meta.pmc.level);
  const xp = meta.pmc.xp;
  const scar = meta.pmc.debuffs[0] ? DEBUFF_BY_ID[meta.pmc.debuffs[0]] : null;
  const contracts = compactContracts(meta.quests, meta.claimed, 3);

  return (
    <aside className="flex flex-col gap-3 lg:max-h-[calc(100dvh-var(--td-chrome,13rem))] lg:overflow-y-auto lg:pr-1 td-side">
      <div className="pixel-card">
        <div className="font-display text-[10px] text-primary">SCAVLORD</div>
        <div className="mt-2 font-display text-[11px] text-foreground">
          {meta.pmc.name} · LVL {meta.pmc.level}
        </div>
        <div className="mt-3 font-mono text-[10px]">
          <div className="text-muted-foreground">XP</div>
          <div className="text-foreground">
            {xp}/{need}
          </div>
          <div className="mt-1 h-2 border border-border bg-background">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, need ? (xp / need) * 100 : 0)}%` }}
            />
          </div>
        </div>
        <div className="mt-3 font-mono text-[10px]">
          <div className="text-muted-foreground">CONDITION</div>
          <div className={scar ? "text-destructive" : "text-accent"}>{scar ? scar.name : "STABLE"}</div>
        </div>
        <div className="mt-3 font-mono text-[10px]">
          <div className="text-muted-foreground">SKILL POINTS</div>
          <div className="text-foreground">{meta.skillPoints}</div>
        </div>
      </div>

      <div className="pixel-card">
        <div className="font-display text-[10px] text-primary">CONTRACTS</div>
        <ul className="mt-2 space-y-2 font-mono text-[10px]">
          {contracts.length === 0 ? (
            <li className="text-muted-foreground">All current contracts claimed.</li>
          ) : (
            contracts.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 border-b border-border/40 pb-1">
                <span className={c.ready ? "text-accent" : "text-foreground"}>{c.name}</span>
                <span className="shrink-0 text-muted-foreground">{c.line}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}
