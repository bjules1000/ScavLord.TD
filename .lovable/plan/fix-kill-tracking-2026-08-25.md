# Fix kill tracking

## What's wrong

Kills are counted with a fragile trick. When an enemy reaches the end of the path and leaks, the game marks it by setting its HP to exactly -1, and the cleanup loop then counts a kill only for enemies whose HP is above -1 (`if (e.hp > -1) killEnemy(...)`).

That means any enemy killed with overkill damage — a sniper hit, a shotgun volley, grenade splash, or several bullets landing in the same frame — ends at HP below -1 and is silently treated as a leak: no kill counter, no roubles bounty, no PMC XP, no floating "+₽" text. Heavy weapons and bosses are the most affected, which is exactly when tracking looks worst.

## The fix

- Stop using HP value as the "leaked" marker. Give each enemy an explicit `leaked` flag set when it reaches the exit (where lives are deducted), and a `counted` flag so an enemy can never be scored twice.
- In the cleanup pass, any enemy at 0 HP or below that is not flagged as leaked gets a proper kill: bounty, run kill counter, scav/boss split, PMC XP, and the floating payout text.
- Keep the leak path unchanged otherwise (lives lost, no bounty).

## Also verified in this pass

- Run kills roll into persistent quest progress on both extract and death (`scavKills`, `bossKills`), so once counting is correct the quest counters (Scav Hunter 25 kills, boss-kill quests) will track correctly too.
- The HUD KILLS stat reads the same run counter, so it is fixed by the same change.

## Technical notes

Files touched: `src/game/types.ts` (add `leaked`/`counted` to the enemy type and its spawn defaults), `src/game/TarkovTD.tsx` (leak branch around line 844 and the enemy cleanup loop around line 918, plus `killEnemy` guarding on `counted`).
