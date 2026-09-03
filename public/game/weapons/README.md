# Modular weapon sprites

Drop PNG parts here. Expected keys are defined in `src/game/weaponVisuals.ts`.

## AK (`public/game/weapons/ak/`)
- `base.png`
- `parts/stock/default.png` `none.png` `welded.png` `cut.png` `cut_wrapped.png`
- `parts/magazine/default.png` `taped.png`
- `parts/underbarrel/taped_grip.png`
- `parts/optic/beer_sight.png`
- `parts/muzzle/default.png` `sawed.png`

## SKS (`public/game/weapons/sks/`)
- `base.png`
- `parts/stock/default.png` `cut.png` `cut_wrapped.png`
- `parts/optic/beer_sight.png`
- `parts/muzzle/default.png` `sawed.png`

Missing files fall back to a schematic compositor in `WeaponSprite.tsx`.
