# FleshMarket - Credits

FleshMarket is written and run by **JW Giles**, who is also its GM.

The in-client panel is the **Asset Credits** button beside the end-of-day
clock, generated from the `CREDITS` table in `client/assets/asset-credits.js`.
That table and this file are maintained by hand and `tools/reach-check.mjs`
asserts every name appears in both, because otherwise they drift, and they drift
in the direction of the client having fewer names.

---

## Art

**Will Tice / unTied Games** - Khai'sultull creatures: crawlers, flies,
hopclops, grubs, eggs and their rounds
(Super Pixel Alien Monster Pack 1)
untiedgames.com

*Attribution here is required by that pack's licence, not optional.*

**AL_Core** - Coalition and Jade Circuit infantry: assault, shield trooper,
engineer and turret
(Sci-Fi Animated Army Squad)

**Aralepixel** - the Turquoise Hound battle tank
(Turquoise Hound animated pixel art tank)

**NickyBHobbying** - merchant hulls, scoundrel corvettes and the Verbattan
Defense Fleet
(Merchants and Scoundrels; Verbattan Shipyards Fleet)

**Helianthus Games** - the spinning planets: every world on the galaxy map and
in system view, and the source every battlefield takes its colour from. Also
the black hole, the Flesh Station megastructure, the Jade Circuit dyson and
quasar bodies, the suns, and the 16px system-view icons
(25 Spinning Planets)
helianthus-games.itch.io

**CodeSpree** - the 64px seamless tile set every battlefield ground texture is
derived from
(114 Free Seamless 64px RPG Tiles)

**RGS_Dev** - low-poly terrain: rocks, crags and cliff meshes
(Nature Pack Low Poly, CC0 1.0)

*CC0 requires no attribution. Credited anyway.*

**gatlingart** - two hundred commissioned portrait sketches, human and android

**Webtential** - science fiction character portraits
(Science Fiction Pixel Art Portraits 1)

**subotai** - cyberpunk and fantasy character portraits
(25 and 60 Cyberpunk portraits; A dwarfload of portraits; Masters of the dark
lord's armies)

**Hanker** - Corpo-Cards: card faces, packs, chests, foil animation and
deck-builder UI
(Pixelart Poker Cards; Deck Building card Template; UI Pack for a DeckBuilding
Game; Chest Asset Pack; Free Card Packs; Rainbow Shine Card Animation)

**almostApixel** - exploration vessel art
(Starlancer Solar Dominion Exploration Vessel)

**Free Game Assets (GUI, Sprite, Tilesets)** - every commodity icon in the game:
the tech, medical and agricultural goods traded on all three markets, 120 of
them. Also the clothing and equipment icons - necklaces, hats, tops, trousers,
shoes and vehicles - and the weapon, ammo and resource icons
(Free Cyberpunk Resource Pixel Art 32x32 Icons; Medicine and Thematic Things
Pixel Art 32x32 Icon Pack; Vegetation Icons 32x32 Pixel Art; Cyberpunk Weapon
and Ammo Pixel Icons)
itch.io/profile/free-game-assets

*Attribution required by licence.*

NOTE ON IDENTITY, recorded rather than assumed: client/assets/commodities/
CREDITS.txt names these packs as CraftPix.net, and the itch profile above is the
handle the same packs are published under. They are credited here as one author
because the repo already asserts both names for the same three packs. If that is
wrong they need splitting into two entries, and the licence line belongs on
whichever of them actually holds it.

**heondu** - the animated book
(Pixel Book Animation)

**Poly Haven** - reference textures (CC0)
polyhaven.com

---

## Type

**AntonXCM** - Anti Kvak, multilingual display face

---

## Still unattributed

Nothing. Every asset in FleshMarket has an author recorded against it.

This section previously listed the black hole, the Flesh Station megastructure,
the Jade Circuit dyson and quasar bodies, the suns and the 16px system-view
icons. It refused to fold them into the Helianthus Games credit on the grounds
that sharing a directory with the spinning planets is not evidence of sharing
an author, and that attributing a directory because most of it has one author
is how the wrong person ends up credited. That reasoning was correct and the
conclusion turned out not to be needed: they are Helianthus Games, identified
against the itch library the rest of this file is built from, and they have
moved into that credit.

The heading stays. The next pack that arrives without a name needs somewhere to
go, and a section that has to be rebuilt from scratch is a section that gets
skipped.

---

## Music and audio

None currently.

---

## Thanks

To everyone who has played, tested, broken, and reported.


## Cyber City facade textures (client/assets/space/city/)

- **papptimus** — https://papptimus.itch.io/cyber-city
- Licence: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- Used: nine building facade textures, their nine emissive maps, and two roof
  sheets. Drawn onto building walls and roofs in the city battlefield viewer.
- Changes made: 20 of the pack's 29 texture files were taken verbatim, byte for
  byte and unrenamed. Nothing was resampled, recoloured or recompressed; the
  renderer tints at draw time. The FBX meshes were not taken.
- Attribution is the single condition CC BY attaches, so this credit is
  required rather than offered.


## Modular city kit (client/assets/space/city/kit.json)

- **Voloshka** — https://viravoloshyn.itch.io/low-poly-city-asset-pack
- Terms: the free edition is stated on the store page as "100% free to download
  and use in your personal or commercial projects", tagged Royalty Free.
- Used: 526 modular meshes — walls, windows, doors, roofs, stairs, roads,
  pavements, kerbs, crossings, lamps, fences, signs, bins and trees.
- Changes made: baked from FBX to a flat vertex/face/normal list by
  `tools/city-meshes.py`; each face's UV resolved against the pack's palette and
  emission textures to a single colour per face, and the texture coordinates
  discarded. The source FBX and palette PNGs are not redistributed.
- The paid pre-assembled demo scene is not used. See
  `client/assets/space/city/KIT_ATTRIBUTION.txt`.


## Distant skyline and vehicles (client/assets/space/city/modern.json)

- **38491748** — https://38491748.itch.io/3d-low-poly-modern-city-assets
- Terms: purchased. The store page states no licence text; what is established
  is the purchase rather than a set of terms, so only the derived mesh data is
  in this repository and the source FBX is not.
- Used: thirteen building meshes as the distant skyline, and four cars.
- Changes made: baked from FBX by `tools/city-meshes.py --materials`; the pack
  ships no textures, so each polygon's material index is resolved to its
  DiffuseColor at build time. Lcl Scaling and Translation applied; Z-up
  converted to Y-up.
