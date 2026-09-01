import { PERKS } from "./perks";
import {
  RECRUITMENT_SUBTITLE,
  canAffordRecruitment,
  candidateStatRows,
  compactKitLine,
  perkRecruitmentDetail,
  primaryPerkId,
  recruitmentAffordabilityMessage,
  startingKitDisplay,
} from "./recruitmentUi";
import type { RecruitCandidate } from "./types";

export { RECRUITMENT_SUBTITLE };

function StatRow({ label, value, bar }: { label: string; value: number; bar: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1.5rem_1fr] items-center gap-x-1 leading-tight">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
      <span className="truncate font-mono text-[8px] tracking-tighter text-primary/80" aria-hidden>
        {bar}
      </span>
    </div>
  );
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: RecruitCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const perkId = primaryPerkId(candidate);
  const perkName = perkId ? (PERKS[perkId]?.name ?? perkId) : "—";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`pixel-card w-full min-w-0 text-left transition-colors ${
        selected ? "border-primary ring-1 ring-primary/50" : "border-border/60 hover:border-border"
      }`}
    >
      <div className="font-display text-[10px] text-primary">{candidate.name}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{candidate.roleLabel}</div>
      <div className="mt-2 space-y-0.5 font-mono text-[9px]">
        {candidateStatRows(candidate.stats).map((row) => (
          <StatRow key={row.key} label={row.label} value={row.value} bar={row.bar} />
        ))}
      </div>
      <div className="mt-2 border-t border-border/40 pt-1.5 text-[9px]">
        <span className="text-muted-foreground">PERK </span>
        <span className="text-foreground">{perkName}</span>
      </div>
      <div className="mt-1 truncate text-[8px] uppercase text-muted-foreground">{compactKitLine(candidate.equipment)}</div>
      <div className="mt-2 font-display text-[11px] text-accent">{candidate.cost} ₽</div>
    </button>
  );
}

function SelectedCandidateDetail({
  candidate,
  bank,
  onHire,
}: {
  candidate: RecruitCandidate;
  bank: number;
  onHire: () => void;
}) {
  const affordable = canAffordRecruitment(bank, candidate.cost);
  const affordMsg = recruitmentAffordabilityMessage(bank, candidate.cost);
  const kit = startingKitDisplay(candidate.equipment);
  const perkId = primaryPerkId(candidate);
  const perk = perkId ? perkRecruitmentDetail(perkId) : null;

  return (
    <div className="pixel-card mt-3 text-left font-mono text-[10px]">
      <div className="font-display text-[12px] text-primary">{candidate.name}</div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Archetype</div>
            <div className="mt-0.5 text-[10px] text-foreground">{candidate.roleLabel}</div>
          </div>

          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Stats</div>
            <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {candidateStatRows(candidate.stats).map((row) => (
                <StatRow key={row.key} label={row.label} value={row.value} bar={row.bar} />
              ))}
            </div>
          </div>

          {perk && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Perk</div>
              <div className="mt-0.5 font-display text-[10px] text-primary">{perk.name}</div>
              <div className="mt-1 space-y-0.5 text-[9px] text-muted-foreground">
                {perk.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Starting kit</div>
            <div className="mt-1 space-y-1 text-[9px]">
              <div>
                <span className="text-muted-foreground">WEAPON </span>
                <span className="text-foreground">{kit.weapon}</span>
              </div>
              <div>
                <span className="text-muted-foreground">ARMOR </span>
                <span className="text-foreground">{kit.armor}</span>
              </div>
              <div>
                <span className="text-muted-foreground">ATTACHMENTS </span>
                <span className="text-foreground">{kit.attachments}</span>
              </div>
              <div className="text-[8px] text-muted-foreground">KIT VALUE: {kit.kitValue} ₽</div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-2">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Hiring</div>
            <div className="mt-1 space-y-0.5 text-[9px]">
              <div>
                <span className="text-muted-foreground">BANK </span>
                <span className="text-foreground">{bank} ₽</span>
              </div>
              <div>
                <span className="text-muted-foreground">COST </span>
                <span className="text-accent">{candidate.cost} ₽</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onHire}
              disabled={!affordable}
              aria-disabled={!affordable}
              className="pixel-btn pixel-btn-primary mt-2 w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              HIRE — {candidate.cost} ₽
            </button>
            {affordMsg && (
              <div className="mt-1.5 text-[9px] font-display uppercase tracking-wide text-destructive" role="status">
                {affordMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecruitmentPanel({
  candidates,
  bank,
  selectedId,
  onSelect,
  onHire,
}: {
  candidates: RecruitCandidate[];
  bank: number;
  selectedId: string | null;
  onSelect: (candidateId: string) => void;
  onHire: (candidateId: string) => void;
}) {
  const selected =
    candidates.find((c) => c.candidateId === selectedId) ?? candidates[0] ?? null;

  return (
    <div className="text-left font-mono text-[10px]">
      <div className="text-muted-foreground">AVAILABLE OPERATORS</div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {candidates.map((c) => (
          <CandidateCard
            key={c.candidateId}
            candidate={c}
            selected={selected?.candidateId === c.candidateId}
            onSelect={() => onSelect(c.candidateId)}
          />
        ))}
      </div>
      {selected ? (
        <SelectedCandidateDetail
          candidate={selected}
          bank={bank}
          onHire={() => onHire(selected.candidateId)}
        />
      ) : (
        <div className="mt-3 text-muted-foreground">No transmissions on this frequency.</div>
      )}
    </div>
  );
}
