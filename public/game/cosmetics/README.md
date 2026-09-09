# Cosmetic sprites

Drop PNG parts here. Expected sizes/catalog are defined in `src/game/cosmetics.ts`.

## Folder convention

```
public/game/cosmetics/<slot>/<option-id>.png
public/game/cosmetics/<slot>/<option-id>-shading.png   (optional)
```

- `public/game/cosmetics/head/`
- `public/game/cosmetics/torso/`
- `public/game/cosmetics/legs/`
- `public/game/cosmetics/hat/`
- `public/game/cosmetics/arms/`
- `public/game/cosmetics/armor/`

Layer order (back to front): legs, torso, head, hat, arms, armor. Arms sit above hat/head
because they swing forward to aim; armor sits above everything since it's worn over the
whole assembled figure.

## Sizing — no scaling, no per-part anchors

Every part is exported at the **exact same canvas size** — `COSMETIC_FIGURE.width x height`
in `cosmetics.ts`, currently 32x32 to match the Aseprite canvas. Draw the whole figure once across aligned layers (legs, torso, head, hat) the way
you already do, and export each layer as its own PNG at that full canvas size, transparent
everywhere except that part's own pixels. The game draws each layer at native size, at
(0, 0), stacked in order — nothing is scaled or repositioned, since your layers are already
aligned by construction. If a PNG comes out the wrong size, the CUSTOMIZE screen logs a
console warning naming the file rather than silently stretching it.

## Recolorable regions

A recolorable region (e.g. hair, skin) must be painted as **one exact flat color**, with no anti-aliasing at its edges. Antialiased/blended pixels won't match the marker color exactly and will keep their original tint after a recolor. Pick a color not used anywhere else in that sprite as the marker — pure magenta (`#ff00ff`) or cyan (`#00ffff`) work well since they rarely occur naturally.

Shading is a separate, optional PNG at the same size, composited with a **multiply** blend: white = unchanged, darker = darkens the recolored base proportionally. Multiply can only darken, never lighten — leave highlights white/near-white rather than painting a bright highlight into it.

## Wiring a new option

Add one entry to `COSMETIC_CATALOG` in `src/game/cosmetics.ts`:

```ts
{
  id: "head-scout",
  slot: "head",
  name: "SCOUT",
  spriteKey: "/game/cosmetics/head/scout.png",
  shadingKey: "/game/cosmetics/head/scout-shading.png", // omit if there's no shading layer
  paintRegions: { hair: "#ff00ff", skin: "#00ffff" },   // omit if this sprite has no recolorable regions
},
```

`paintRegions` maps a region name to the exact marker hex you painted that region with. Region names are free-form, but reuse `hair`/`skin`/`fabric`/`trim` where it fits — `skin` is special: it's the one region whose color syncs across every equipped slot, everything else is chosen independently per slot. Introducing a new region name needs one more entry in `SWATCH_LISTS` (also in `cosmetics.ts`) so there's a color list to cycle through.

Missing files fall back to a flat placeholder block in the CUSTOMIZE screen — nothing else breaks if a PNG isn't there yet.
