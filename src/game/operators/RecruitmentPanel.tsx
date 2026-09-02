import {
  RECRUITMENT_SUBTITLE,
  buildCandidateCardView,
  buildSelectedDetailView,
  formatRecruitmentRoubles,
} from "./recruitmentUi";
import type { RecruitCandidate } from "./types";
import {
  isProceduralRecruitmentUnlocked,
  isUniqueContactRadioActive,
  radioStatePresentation,
  type RadioState,
  type UniqueContactLifecycle,
} from "./radioProgression";
import { PERKS, isNegativeTraitId, allTraitIds } from "./perks";
import type { UniqueTransmissionContent } from "./uniqueOperators";
import type { RequirementEval } from "./recruitmentRequirements";

export { RECRUITMENT_SUBTITLE };

function StatRow({
  label,
  current,
  bar,
}: {
  label: string;
  current: number;
  bar: string;
}) {
  return (
    <div className="grid grid-cols-[3rem_2.5rem_minmax(0,1fr)] items-center gap-x-2 leading-snug">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="tabular-nums text-[12px] font-medium text-foreground">{current}</span>
      <span className="font-mono text-[10px] tracking-tight text-primary/90" aria-hidden>
        {bar}
      </span>
    </div>
  );
}

function traitCardLines(candidate: RecruitCandidate): { positives: string; flaws: string | null } {
  const ids = allTraitIds(candidate);
  const pos = ids.filter((id) => !isNegativeTraitId(id)).map((id) => PERKS[id]?.name ?? id);
  const neg = ids.filter((id) => isNegativeTraitId(id)).map((id) => PERKS[id]?.name ?? id);
  return {
    positives: pos.length ? pos.join(" · ") : "—",
    flaws: neg.length ? `FLAW: ${neg.join(" · ")}` : null,
  };
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
  const traits = traitCardLines(candidate);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`pixel-card w-full p-3 text-left transition-colors sm:p-3.5 ${
        selected ? "border-primary ring-2 ring-primary/60" : "border-border/60 hover:border-border"
      }`}
    >
      <div className="font-display text-[14px] text-primary">{view.name}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{view.archetype}</div>
      <div className="mt-2.5 space-y-1">
        {view.statRows.map((row) => (
          <StatRow key={row.key} label={row.label} current={row.current} bar={row.bar} />
        ))}
      </div>
      <div className="mt-2.5 border-t border-border/40 pt-2 text-[11px]">
        <div className="text-muted-foreground">TRAITS</div>
        <div className="text-foreground">{traits.positives}</div>
        {traits.flaws && <div className="mt-0.5 text-[10px] text-destructive/90">{traits.flaws}</div>}
      </div>
      <div className="mt-2 font-display text-[15px] text-accent">{view.costFormatted}</div>
    </button>
  );
}

function SelectedCandidateDetail({
  candidate,
  bank,
  hireBlockedReason,
  onHire,
}: {
  candidate: RecruitCandidate;
  bank: number;
  hireBlockedReason: string | null;
  onHire: () => void;
}) {
  const view = buildSelectedDetailView(candidate, bank);
  const traits = traitCardLines(candidate);
  const blocked = !!hireBlockedReason || !view.affordable;

  return (
    <div className="pixel-card mt-3 p-3.5 text-left font-mono sm:p-4">
      <div className="font-display text-[14px] text-primary">{view.identity}</div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Traits</div>
          <div className="mt-1 text-[12px] text-foreground">{traits.positives}</div>
          {traits.flaws && <div className="mt-0.5 text-[11px] text-destructive/90">{traits.flaws}</div>}
          {view.perk && (
            <div className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
              {view.perk.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Starting kit</div>
            <div className="mt-1.5 space-y-1 text-[11px]">
              <div className="grid grid-cols-[6rem_1fr] gap-x-2">
                <span className="text-muted-foreground">WEAPON</span>
                <span className="text-foreground">{view.kit.weapon}</span>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-x-2">
                <span className="text-muted-foreground">ARMOR</span>
                <span className="text-foreground">{view.kit.armor}</span>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-x-2">
                <span className="text-muted-foreground">ATTACHMENTS</span>
                <span className="text-foreground">{view.kit.attachments}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hiring</div>
            <div className="mt-1.5 space-y-0.5 text-[11px]">
              <div className="grid grid-cols-[3.5rem_1fr] gap-x-2">
                <span className="text-muted-foreground">BANK</span>
                <span className="text-foreground">{view.bankFormatted}</span>
              </div>
              <div className="grid grid-cols-[3.5rem_1fr] gap-x-2">
                <span className="text-muted-foreground">COST</span>
                <span className="text-accent">{view.costFormatted}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onHire}
              disabled={blocked}
              aria-disabled={blocked}
              className="pixel-btn pixel-btn-primary mt-2.5 w-full py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              HIRE — {view.costFormatted}
            </button>
            {(hireBlockedReason || view.affordMsg) && (
              <div className="mt-1.5 text-[10px] font-display uppercase tracking-wide text-destructive" role="status">
                {hireBlockedReason ?? view.affordMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RadioInactivePanel({
  radioState,
  questHint,
}: {
  radioState: RadioState;
  questHint?: string | null;
}) {
  const copy = radioStatePresentation(radioState);
  return (
    <div className="pixel-card p-4 text-left font-mono">
      <div className="font-display text-[16px] text-primary">{copy.title}</div>
      <div className="mt-1 text-[12px] uppercase tracking-wide text-muted-foreground">{copy.subtitle}</div>
      <div className="mt-3 whitespace-pre-line text-[12px] text-foreground">{copy.body}</div>
      {questHint && <div className="mt-3 text-[11px] text-accent">{questHint}</div>}
    </div>
  );
}

/** Generic unique-contact transmission panel (Wolf and future contacts). */
export function UniqueContactTransmission({
  transmission,
  lifecycle,
  onAdvance,
  onRecruit,
  requirements,
  canRecruit,
  recruitBlockedReason,
  showRequirements,
}: {
  transmission: UniqueTransmissionContent;
  lifecycle: UniqueContactLifecycle;
  onAdvance?: (() => void) | null;
  onRecruit?: (() => void) | null;
  requirements?: RequirementEval[] | null;
  canRecruit?: boolean;
  recruitBlockedReason?: string | null;
  showRequirements?: boolean;
}) {
  const advanceLabel = transmission.actionLabel;
  const showAdvance =
    onAdvance &&
    advanceLabel &&
    (lifecycle === "DISTRESS_SIGNAL" ||
      lifecycle === "IDENTIFIED" ||
      lifecycle === "REQUIREMENTS_VISIBLE" ||
      lifecycle === "CONTACTABLE" ||
      lifecycle === "RECRUITED");
  const showHire = onRecruit && (lifecycle === "RECRUITABLE" || (lifecycle === "CONTACTABLE" && canRecruit));

  return (
    <div className="pixel-card border-accent/50 p-3.5 text-left font-mono sm:p-4">
      <div className="text-[10px] uppercase tracking-wide text-accent">Incoming transmission</div>
      <div className="mt-1 font-display text-[14px] text-primary">{transmission.title}</div>
      {transmission.status && (
        <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          {transmission.status}
        </div>
      )}
      <div className="mt-3 whitespace-pre-line text-[12px] text-foreground">{transmission.body}</div>
      {transmission.knownRoleHint && (
        <div className="mt-2 text-[11px] text-muted-foreground">Profile: {transmission.knownRoleHint}</div>
      )}
      {transmission.knownLocationHint && (
        <div className="text-[11px] text-muted-foreground">Location: {transmission.knownLocationHint}</div>
      )}
      {transmission.knownTraits?.length ? (
        <div className="mt-1 text-[11px] text-foreground">
          Known strengths: {transmission.knownTraits.join(" · ")}
        </div>
      ) : null}

      {showRequirements && requirements && requirements.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Requirements</div>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {requirements.map((r) => (
              <li key={r.label} className={r.met ? "text-accent" : "text-foreground"}>
                [{r.met ? "✓" : " "}] {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAdvance && (
        <button type="button" onClick={onAdvance!} className="pixel-btn pixel-btn-primary mt-3 w-full py-2 text-[11px]">
          {advanceLabel}
        </button>
      )}

      {showHire && (
        <>
          <button
            type="button"
            onClick={onRecruit!}
            disabled={!canRecruit || !!recruitBlockedReason}
            className="pixel-btn pixel-btn-primary mt-3 w-full py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {transmission.actionLabel ?? "RECRUIT"}
          </button>
          {recruitBlockedReason && (
            <div className="mt-1.5 text-[10px] font-display uppercase tracking-wide text-destructive" role="status">
              {recruitBlockedReason}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export type UniqueContactPanelProps = {
  uniqueId: string;
  lifecycle: UniqueContactLifecycle;
  transmission: UniqueTransmissionContent;
  onAdvance?: (() => void) | null;
  onRecruit?: (() => void) | null;
  requirements?: RequirementEval[] | null;
  canRecruit?: boolean;
  recruitBlockedReason?: string | null;
};

export default function RecruitmentPanel({
  candidates,
  bank,
  selectedId,
  onSelect,
  onHire,
  onBack,
  radioState = "SIGNAL_RESTORED",
  hireBlockedReason = null,
  retransmission,
  uniqueContact = null,
  questHint = null,
}: {
  candidates: RecruitCandidate[];
  bank: number;
  selectedId: string | null;
  onSelect: (candidateId: string) => void;
  onHire: (candidateId: string) => void;
  onBack?: () => void;
  radioState?: RadioState;
  hireBlockedReason?: string | null;
  retransmission?: {
    unlocked: boolean;
    nextCost: number;
    onRequest: () => void;
  } | null;
  uniqueContact?: UniqueContactPanelProps | null;
  questHint?: string | null;
}) {
  const procedural = isProceduralRecruitmentUnlocked(radioState);
  const uniqueActive = isUniqueContactRadioActive(radioState);
  const showRequirements =
    uniqueContact != null &&
    (uniqueContact.lifecycle === "REQUIREMENTS_VISIBLE" ||
      uniqueContact.lifecycle === "CONTACTABLE" ||
      uniqueContact.lifecycle === "RECRUITABLE");

  // Pre-signal: broken / static only.
  if (!uniqueActive && !procedural) {
    return (
      <div className="flex min-h-0 flex-col text-left font-mono">
        <RadioInactivePanel radioState={radioState} questHint={questHint} />
        {onBack && (
          <button type="button" onClick={onBack} className="pixel-btn mx-auto mt-4 max-w-[10rem] px-4 py-1.5 text-[10px]">
            BACK TO CAMP
          </button>
        )}
      </div>
    );
  }

  const selected = candidates.find((c) => c.candidateId === selectedId) ?? candidates[0] ?? null;

  return (
    <div className="flex min-h-0 flex-col text-left font-mono">
      {!procedural && (
        <div className="mb-2">
          <div className="font-display text-[14px] text-primary">CONTACTS / TRANSMISSIONS</div>
          <div className="text-[11px] text-muted-foreground">
            Signal restored — scav network offline. Procedural recruitment locked.
          </div>
          {questHint && <div className="mt-1 text-[11px] text-accent">{questHint}</div>}
        </div>
      )}

      {uniqueContact && (
        <UniqueContactTransmission
          transmission={uniqueContact.transmission}
          lifecycle={uniqueContact.lifecycle}
          onAdvance={uniqueContact.onAdvance ?? null}
          onRecruit={uniqueContact.onRecruit ?? null}
          requirements={uniqueContact.requirements ?? null}
          canRecruit={uniqueContact.canRecruit ?? false}
          recruitBlockedReason={uniqueContact.recruitBlockedReason ?? null}
          showRequirements={showRequirements}
        />
      )}

      {procedural && (
        <>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">AVAILABLE OPERATORS</div>
            {retransmission?.unlocked && (
              <button
                type="button"
                className="pixel-btn px-2 py-1 text-[10px]"
                onClick={retransmission.onRequest}
              >
                REQUEST NEW TRANSMISSION — {formatRecruitmentRoubles(retransmission.nextCost)}
              </button>
            )}
          </div>

          {candidates.length === 0 ? (
            <div className="mt-3 text-muted-foreground">No transmissions on this frequency.</div>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {candidates.map((c) => (
                <CandidateCard
                  key={c.candidateId}
                  candidate={c}
                  selected={selected?.candidateId === c.candidateId}
                  onSelect={() => onSelect(c.candidateId)}
                />
              ))}
            </div>
          )}
          {selected ? (
            <SelectedCandidateDetail
              candidate={selected}
              bank={bank}
              hireBlockedReason={hireBlockedReason}
              onHire={() => onHire(selected.candidateId)}
            />
          ) : null}
        </>
      )}

      {!procedural && !uniqueContact && (
        <div className="pixel-card mt-2 p-3 text-[12px] text-muted-foreground">
          Waiting for a transmission…
          {questHint && <div className="mt-2 text-accent">{questHint}</div>}
        </div>
      )}

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="pixel-btn mx-auto mt-4 max-w-[10rem] px-4 py-1.5 text-[10px]"
        >
          BACK TO CAMP
        </button>
      )}
    </div>
  );
}
