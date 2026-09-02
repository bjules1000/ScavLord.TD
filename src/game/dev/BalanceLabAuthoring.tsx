import { useMemo } from "react";
import { ATTACHMENTS, WEAPONS, type AttachMount, type AttachmentCompatibility, type WeaponCategory } from "../gear";
import {
  ATTACH_MOUNTS,
  CATEGORY_LABEL,
  MOUNT_LABEL,
  WEAPON_CATEGORIES,
  canInstallAttachment,
  mountRowsForWeapon,
} from "../weaponAttachments";
import {
  attachmentCompatibilityPreview,
  attachmentDefForLab,
  effectiveWeaponCategory,
  effectiveWeaponMounts,
  fittedStatRows,
  setOverrideField,
  testFitLegal,
  type BalanceOverrides,
} from "./balance";

export function WeaponMountEditor({
  weaponId,
  draft,
  setDraft,
}: {
  weaponId: string;
  draft: BalanceOverrides;
  setDraft: (next: BalanceOverrides) => void;
}) {
  const base = WEAPONS[weaponId]!;
  const mounts = effectiveWeaponMounts(weaponId, draft, true);
  const category = effectiveWeaponCategory(weaponId, draft, true);
  const baseCategory = base.category ?? "ar";

  const toggleMount = (mount: AttachMount) => {
    const next = mounts.includes(mount) ? mounts.filter((m) => m !== mount) : [...mounts, mount];
    setDraft(setOverrideField(draft, "weapon", weaponId, "attachmentSlots", next, base.attachmentSlots ?? []));
  };

  const setCategory = (cat: WeaponCategory) => {
    setDraft(setOverrideField(draft, "weapon", weaponId, "category", cat, baseCategory));
  };

  return (
    <div className="mt-5 border-t-2 border-border pt-4">
      <div className="font-display text-[11px] text-primary">ATTACHMENT MOUNTS</div>
      <div className="mt-2 font-mono text-[10px] text-muted-foreground">MOUNTS: {mounts.length}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {ATTACH_MOUNTS.map((mount) => (
          <label key={mount} className="flex items-center gap-1 font-mono text-[10px]">
            <input
              type="checkbox"
              checked={mounts.includes(mount)}
              onChange={() => toggleMount(mount)}
            />
            {MOUNT_LABEL[mount]}
          </label>
        ))}
      </div>
      <div className="mt-3 font-mono text-[10px]">
        <div className="text-muted-foreground">CATEGORY</div>
        <select
          className="mt-1 border-2 border-border bg-background px-2 py-1 text-foreground"
          value={category}
          onChange={(e) => setCategory(e.target.value as WeaponCategory)}
        >
          {WEAPON_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function AttachmentCompatEditor({
  attachmentId,
  draft,
  setDraft,
}: {
  attachmentId: string;
  draft: BalanceOverrides;
  setDraft: (next: BalanceOverrides) => void;
}) {
  const base = ATTACHMENTS[attachmentId]!;
  const effective = attachmentDefForLab(attachmentId);
  const compat = effective.compatibility ?? {};
  const preview = useMemo(() => attachmentCompatibilityPreview(attachmentId), [attachmentId, draft]);

  const updateCompat = (next: AttachmentCompatibility) => {
    setDraft(setOverrideField(draft, "attachment", attachmentId, "compatibility", next, base.compatibility ?? {}));
  };

  const toggleCategory = (cat: WeaponCategory) => {
    const cur = [...(compat.weaponCategories ?? [])];
    const idx = cur.indexOf(cat);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(cat);
    const next: AttachmentCompatibility = { ...compat };
    if (cur.length) next.weaponCategories = cur;
    else delete next.weaponCategories;
    updateCompat(next);
  };

  const toggleWeaponId = (id: string, field: "weaponIds" | "excludedWeaponIds") => {
    const cur = [...(compat[field] ?? [])];
    const idx = cur.indexOf(id);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(id);
    const next: AttachmentCompatibility = { ...compat };
    if (cur.length) next[field] = cur;
    else delete next[field];
    updateCompat(next);
  };

  return (
    <div className="mt-5 border-t-2 border-border pt-4">
      <div className="font-display text-[11px] text-primary">COMPATIBILITY</div>
      <div className="mt-2 font-mono text-[10px] text-muted-foreground">
        SLOT: {effective.slot ? MOUNT_LABEL[effective.slot] : "—"}
      </div>
      <div className="mt-2">
        <div className="font-mono text-[10px] text-muted-foreground">Categories</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {WEAPON_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1 font-mono text-[10px]">
              <input
                type="checkbox"
                checked={compat.weaponCategories?.includes(c) ?? false}
                onChange={() => toggleCategory(c)}
              />
              {CATEGORY_LABEL[c]}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <div className="font-mono text-[10px] text-muted-foreground">Include weapons</div>
        <div className="mt-1 max-h-24 overflow-y-auto">
          {Object.values(WEAPONS).map((w) => (
            <label key={w.id} className="mr-3 inline-flex items-center gap-1 font-mono text-[9px]">
              <input
                type="checkbox"
                checked={compat.weaponIds?.includes(w.id) ?? false}
                onChange={() => toggleWeaponId(w.id, "weaponIds")}
              />
              {w.name}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <div className="font-mono text-[10px] text-muted-foreground">Exclude weapons</div>
        <div className="mt-1 max-h-24 overflow-y-auto">
          {Object.values(WEAPONS).map((w) => (
            <label key={w.id} className="mr-3 inline-flex items-center gap-1 font-mono text-[9px]">
              <input
                type="checkbox"
                checked={compat.excludedWeaponIds?.includes(w.id) ?? false}
                onChange={() => toggleWeaponId(w.id, "excludedWeaponIds")}
              />
              {w.name}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-3 font-mono text-[9px]">
        <div className="text-muted-foreground">FITS</div>
        <div className="text-primary">✓ {preview.fits.slice(0, 8).join(", ") || "—"}</div>
        <div className="mt-1 text-destructive">× {preview.rejects.slice(0, 8).join(", ") || "—"}</div>
      </div>
    </div>
  );
}

export function WeaponTestFit({
  weaponId,
  draft,
  testFit,
  setTestFit,
}: {
  weaponId: string;
  draft: BalanceOverrides;
  testFit: string[];
  setTestFit: (next: string[]) => void;
}) {
  const weapon = WEAPONS[weaponId]!;
  const mounts = effectiveWeaponMounts(weaponId, draft, true);
  const legal = testFitLegal(weaponId, testFit, draft);
  const rows = fittedStatRows(weaponId, legal.legal);
  const mountRows = mountRowsForWeapon(weaponId, legal.legal);

  const setMountAttachment = (mount: AttachMount, attachId: string | null) => {
    const without = testFit.filter((id) => {
      const def = ATTACHMENTS[id];
      return def?.slot !== mount;
    });
    if (!attachId) {
      setTestFit(without);
      return;
    }
    const att = ATTACHMENTS[attachId];
    const effectiveWeapon = { ...weapon, ...draft.weapons[weaponId], attachmentSlots: mounts };
    if (!att || !canInstallAttachment(effectiveWeapon, att).ok) return;
    setTestFit([...without, attachId]);
  };

  return (
    <div className="mt-5 border-t-2 border-border pt-4">
      <div className="font-display text-[11px] text-primary">TEST FIT</div>
      {legal.illegal.length > 0 && (
        <div className="mt-1 font-mono text-[9px] text-destructive">
          Removed illegal: {legal.illegal.join(", ")}
        </div>
      )}
      <div className="mt-2 space-y-1">
        {mounts.map((mount) => {
          const current = mountRows.find((r) => r.mount === mount)?.attachmentId ?? "";
          return (
            <div key={mount} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 font-mono text-[10px]">
              <span className="text-muted-foreground">{MOUNT_LABEL[mount]}</span>
              <select
                className="border border-border bg-background px-1 py-0.5 text-foreground"
                value={current}
                onChange={(e) => setMountAttachment(mount, e.target.value || null)}
              >
                <option value="">—</option>
                {Object.values(ATTACHMENTS)
                  .filter((a) => a.slot === mount)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          );
        })}
      </div>
      <div className="mt-3 font-mono text-[9px]">
        <div className="grid grid-cols-3 gap-2 text-muted-foreground">
          <span />
          <span>BASE</span>
          <span>FITTED</span>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-3 gap-2">
            <span>{row.label}</span>
            <span>{typeof row.base === "number" ? row.base.toFixed(row.label === "ACCURACY" ? 2 : 1) : row.base}</span>
            <span>{typeof row.fitted === "number" ? row.fitted.toFixed(row.label === "ACCURACY" ? 2 : 1) : row.fitted}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
