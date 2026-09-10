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

Layer order (back to front): legs, torso, head, hat, armor, arms. Armor sits above hat/head
since it's worn over the whole assembled figure, but arms are drawn last of all so hands
stay visible over a vest/helmet — they're holding whatever weapon the figure is aiming.

## Sizing — no scaling, no per-part anchors

Every part is exported at the **exact same canvas size** — `COSMETIC_FIGURE.width x height`
in `cosmetics.ts`, currently 32x32 to match the Aseprite canvas. Draw the whole figure once across aligned layers (legs, torso, head, hat) the way
you already do, and export each layer as its own PNG at that full canvas size, transparent
everywhere except that part's own pixels. The game draws each layer at native size, at
(0, 0), stacked in order — nothing is scaled or repositioned, since your layers are already
aligned by construction. If a PNG comes out the wrong size, the CUSTOMIZE screen logs a
console warning naming the file rather than silently stretching it.

## Recolorable regions

A recolorable region (e.g. hair, skin) must be painted as **one exact flat color**, with no anti-aliasing at its edges. Antialiased/blended pixels won't match the marker color exactly and will keep their original tint after a recolor. The established markers: `#ff00ff` magenta = fabric (primary), `#00ffff` cyan = trim (secondary), `#ffff00` yellow = skin, `#ffffff` white = hair. Pick a color not used anywhere else in the sprite when introducing a new region.

**Why white for hair, not black:** black is reserved for a different job (see "Front overlays" below) — and multiplicatively, black can't be a shading *base* anyway, since nothing is darker than black to shade down to. White has the opposite problem for a *structural* marker (too easy to collide with real highlight pixels), but as a shading base it works exactly like the others: pick a marker, then add darker marker(s) for its shaded tiers, all resolving through the same chosen swatch.

**Shade tiers** — a region can have more than one marker. Add extra entries to `shadeMarkers` in the option's catalog entry, each reusing an already-chosen swatch but scaled darker by a fixed ratio, e.g. a `#baba00` shadow-skin marker next to a `#ffff00` base-skin marker implies `factor = 0xba/0xff`. Compute the factor from the actual pixel values you painted, not a rounded guess. This works for any region — skin, hair, fabric, trim — and a region can have as many tiers as the art needs (jacket's fabric uses three: `#ff00ff` → `#ad00ad` → `#700270`).

Older parts also support a separate multiply-blend shading PNG (`shadingKey`) instead of/alongside marker tiers: white = unchanged, darker = darkens the recolored base proportionally. Multiply can only darken, never lighten.

## Front overlays

Sometimes a few pixels of a lower layer need to render *above* a later one — e.g. a collar that wraps in front of the neck, drawn from the torso option but needing to sit above the head layer. Split those pixels into their own PNG and wire it as `frontOverlay` on the option; the renderer draws it immediately after the "head" layer instead of at the option's normal stacking position. It gets its own `paintRegions` map (resolved through the same slot, so it automatically matches whatever swatch the rest of the option is using).

**Convention:** mark front-overlay pixels with `#000000` black. Black is otherwise useless as a *shading* marker (you can't shade something darker than black), so it's reserved for this structural, non-color purpose instead.

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

`paintRegions` maps a region name to the exact marker hex you painted that region with. Region names are free-form, but reuse `hair`/`skin`/`fabric`/`trim` where it fits — `skin` and `hair` are special: they're the regions whose color syncs across every equipped slot (see `GLOBAL_PAINT_REGIONS`), everything else is chosen independently per slot. Introducing a new region name needs one more entry in `SWATCH_LISTS` (also in `cosmetics.ts`) so there's a color list to cycle through.

Missing files fall back to a flat placeholder block in the CUSTOMIZE screen — nothing else breaks if a PNG isn't there yet.
