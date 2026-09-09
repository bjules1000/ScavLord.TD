# Cosmetic sprites

Drop PNG parts here. Expected slots/anchors/catalog are defined in `src/game/cosmetics.ts`.

## Folder convention

```
public/game/cosmetics/<slot>/<option-id>.png
public/game/cosmetics/<slot>/<option-id>-shading.png   (optional)
```

- `public/game/cosmetics/head/`
- `public/game/cosmetics/torso/`
- `public/game/cosmetics/legs/`
- `public/game/cosmetics/hat/`

## Sizing

Each slot draws into a fixed box on a 32x64 figure (`COSMETIC_FIGURE.anchors` in `cosmetics.ts`):

| Slot  | Size (w x h) |
|-------|--------------|
| hat   | 16 x 10      |
| head  | 12 x 16      |
| torso | 20 x 22      |
| legs  | 16 x 24      |

Art gets scaled to fit, so it doesn't have to be exactly this size, but matching it exactly keeps pixel art crisp and undistorted — draw each part on its own canvas at that slot's size.

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
