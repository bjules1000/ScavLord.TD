import type { ProgressionNotice } from "./progressionNotifications";

/** Aggregated progression feedback modal (quest complete / new quest). */
export default function ProgressionNoticeModal({
  notice,
  onContinue,
}: {
  notice: ProgressionNotice;
  onContinue: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-[2px]">
      <div className="pixel-card w-full max-w-lg p-5 text-left sm:p-6">
        <div className="font-display text-[18px] text-primary sm:text-[20px]">{notice.title}</div>
        {notice.subtitle && (
          <div className="mt-2 font-display text-[16px] text-accent sm:text-[17px]">{notice.subtitle}</div>
        )}
        {notice.body && (
          <div className="mt-3 font-mono text-[13px] leading-snug text-foreground sm:text-[14px]">
            {notice.body}
          </div>
        )}
        {notice.sections.map((sec) => (
          <div key={sec.heading} className="mt-4">
            <div className="font-display text-[12px] uppercase tracking-wide text-muted-foreground">
              {sec.heading}
            </div>
            <ul className="mt-2 space-y-1 font-mono text-[13px] text-foreground sm:text-[14px]">
              {sec.lines.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </div>
        ))}
        <button
          type="button"
          className="pixel-btn pixel-btn-primary mt-6 w-full py-2.5 text-[12px] sm:text-[13px]"
          onClick={onContinue}
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
}
