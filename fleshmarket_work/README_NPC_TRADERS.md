
# NPC Traders Integrated (v1)

This build includes AI agent market-flow. The NPC engine is auto-wired via a safe script tag.
- Files in: `client/npc/`, plus `npc_config.json` in `client`.
- Autowire injected into: 1 HTML file(s).

## Configure
Edit `client/npc_config.json`:
- `impact`: try `0.003` to see stronger movement.
- `liquidity`: bigger = harder to move.
- `globalIntensity`: master multiplier.

## Notes
- If your engine exposes `market.onTick(cb)` or `market.subscribe(cb)`, the NPC module hooks there.
- Otherwise it wraps a global `priceUpdate(symbol, price)` if found.
- If neither exists, NPC remains idle (no-op) and won’t break anything. You can wire manually by importing `createNPCEngine` and calling `apply(...)` per tick.
