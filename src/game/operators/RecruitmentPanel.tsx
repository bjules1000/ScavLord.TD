import {
  RECRUITMENT_SUBTITLE,
  buildCandidateCardView,
  buildSelectedDetailView,
} from "./recruitmentUi";
import type { RecruitCandidate } from "./types";

export { RECRUITMENT_SUBTITLE };

function StatRow({ label, value, bar }: { label: string; value: number; bar: string }) {
  return (
    <div className="grid grid-cols-[5rem_1.75rem_minmax(0,1fr)] items-center gap-x-2 leading-snug">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="tabular-nums text-[11px] text-foreground">{value}</span>
      <span className="font-mono text-[9px] tracking-tight text-primary/85" aria-hidden>
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
  const view = buildCandidateCardView(candidate);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`pixel-card min-h-[15.5rem] w-full min-w-[11.5rem] p-4 text-left transition-colors sm:min-w-0 ${
        selected ? "border-primary ring-2 ring-primary/60" : "border-border/60 hover:border-border"
      }`}
    >
      <div className="font-display text-[13px] text-primary">{view.name}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{view.archetype}</div>
      <div className="mt-3 space-y-1.5">
        {view.statRows.map((row) => (
          <StatRow key={row.key} label={row.label} value={row.value} bar={row.bar} />
        ))}
      </div>
      <div className="mt-3 border-t border-border/40 pt-2.5 text-[10px]">
        <span className="text-muted-foreground">PERK </span>
        <span className="text-foreground">{view.perkName}</span>
      </div>
      <div className="mt-3 font-display text-[14px] text-accent">{view.costFormatted}</div>
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
  const view = buildSelectedDetailView(candidate, bank);

  return (
    <div className="pixel-card mt-4 p-4 text-left font-mono sm:p-5">
      <div className="font-display text-[14px] text-primary sm:text-[15px]">{view.identity}</div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2 lg:gap-8">
        <div>
          {view.perk && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Perk</div>
              <div className="mt-1 font-display text-[13px] text-primary">{view.perk.name}</div>
              <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {view.perk.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Starting kit</div>
            <div className="mt-2 space-y-1.5 text-[11px]">
              <div className="grid grid-cols-[6.5rem_1fr] gap-x-2">
                <span className="text-muted-foreground">WEAPON</span>
                <span className="text-foreground">{view.kit.weapon}</span>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] gap-x-2">
                <span className="text-muted-foreground">ARMOR</span>
                <span className="text-foreground">{view.kit.armor}</span>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] gap-x-2">
                <span className="text-muted-foreground">ATTACHMENTS</span>
                <span className="text-foreground">{view.kit.attachments}</span>
              </div>
              <div className="pt-0.5 text-[10px] text-muted-foreground">
                KIT VALUE: {view.kit.kitValue.toLocaleString()} ₽
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hiring</div>
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="grid grid-cols-[4.5rem_1fr] gap-x-2">
                <span className="text-muted-foreground">BANK</span>
                <span className="text-foreground">{view.bankFormatted}</span>
              </div>
              <div className="grid grid-cols-[4.5rem_1fr] gap-x-2">
                <span className="text-muted-foreground">COST</span>
                <span className="text-accent">{view.costFormatted}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onHire}
              disabled={!view.affordable}
              aria-disabled={!view.affordable}
              className="pixel-btn pixel-btn-primary mt-3 w-full py-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              HIRE — {view.costFormatted}
            </button>
            {view.affordMsg && (
              <div className="mt-2 text-[10px] font-display uppercase tracking-wide text-destructive" role="status">
                {view.affordMsg}
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
  onBack,
}: {
  candidates: RecruitCandidate[];
  bank: number;
  selectedId: string | null;
  onSelect: (candidateId: string) => void;
  onHire: (candidateId: string) => void;
  onBack?: () => void;
}) {
  const selected =
    candidates.find((c) => c.candidateId === selectedId) ?? candidates[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col text-left font-mono text-[11px]">
      <div className="text-[11px] text-muted-foreground">AVAILABLE OPERATORS</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <div className="mt-4 text-muted-foreground">No transmissions on this frequency.</div>
      )}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="pixel-btn mx-auto mt-5 w-full max-w-xs py-2 text-[10px] sm:mt-6"
        >
          BACK TO CAMP
        </button>
      )}
    </div>
  );
}
