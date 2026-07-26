# FleshMarket 1.2, devlog notes

Read-aloud version. Last live build was 1.1.9.13. Everything below is new.

---

## Three big things

**1. The Jade Circuit: a second galaxy**

- Sixteen new worlds behind a sealed passage, with their own exchange and their own tickers
- The Circuit trades with itself. Not one lane crosses the border
- Circuit freight flies the Changzheng hull family, built at Changzheng Yards. Coalition ships never appear there and Circuit ships never appear here
- Flesh Station's deep scan stops at the passage. You can see a Circuit freighter; you cannot read what it's carrying
- Its own map, its own palette, its own news

**2. The client speaks Chinese**

- Not a menu pass. The trading chrome, the order form, the colony and planet data, all eleven casino games, the P&L tab, chat, the tax office
- The news engine too, down to individual generated headlines. The server sends structured data and the client builds the sentence, which is the only way a headline written at runtime can be read in two languages
- Faction names, ticker names, commodity names, hull classes

**3. Cities**

- Nineteen colonies now carry a city. Each city has districts. You buy mayoral office over a district and run it
- Four policy levers, security, politics, services and upkeep, driving six simulated conditions
- Development and civic works build a skyline you can see from orbit
- Anyone can lease a storefront, mayor or not. Twenty five thousand established businesses are already trading and you can buy one out
- The mayor sets the commerce rate and taxes what everyone earns. Set it too high and firms leave
- Seats are contestable. Offices default on unpaid civic debt. Conquest vacates the lot

---

## And cities stopped being a closed system

- What a city can't grow, it buys, and that now shows up in that colony's own commodity prices
- Zone your districts for food and your world becomes the cheap place to buy food
- Zone for nothing and you pay for it on your own board
- Get blockaded having zoned for nothing and you pay through the nose
- Mayors can lay in siege stores ahead of a blockade. They cover the shortfall while they last and spoil while they sit
- Legitimacy now prices the seat. Govern badly and your office becomes cheap to take
- Shopholders can file a petition against their mayor and push that legitimacy down
- Corruption now skims the civic bill, so a district that's rotted costs more to run than the levers claim
- Businesses fold and open. Faster where a district has been run into the ground

---

## Under the hood

- The city tick used to pay a fixed hour of income on every restart, no matter how long had actually passed. It reads a real clock now
- Business buyouts were priced off live income, and two of those inputs were levers the sitting mayor could move and move straight back. Twenty five to forty four percent off, free, reversible. Closed
- The websocket had no rate limit of any kind. It has two now
- The colony charter had been sitting in the database since cities shipped, read in one place and written nowhere, so the branch that used it could never fire. It works now
- Districts keep a record. Who took the seat, who lost it, who built what

---

## Numbers

- 25,236 businesses trading across the colonies
- 275 districts across 19 cities
- 63 trade lanes, 26 of them inside the Circuit
- 120 commodities priced per colony
- The commodity coupling was simulated across 200 runs before it was written, because it's permanent pressure on a market that was tuned without it
- 172 automated checks across the suite, most of which didn't exist a week ago

---

## Closing note

The migration was rehearsed against a copy of the real database before any of this
goes near the live one. Every schema change is additive, so a rollback is safe.
