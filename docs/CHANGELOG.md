# FleshMarket - Changelog

All versions in chronological order. Each entry corresponds to a former `PATCH_NOTES_X.md` file, now unified here.

---

## v1.3.9.3 (2026-08-21) - Waow's Band (SERVER + CLIENT)

Server restart required. Hard refresh required. Files touched: `server/db.js`, `client/assets/inventory.js`, `client/version.json`, `docs/CHANGELOG.md`, `docs/MANIFEST.txt`.

`cat_ear_headband` is renamed to Waow's Band and promoted from common to legendary.

THERE WERE TWO CAT EAR ITEMS AND ONLY ONE MOVED. `cat_ear_beanie` (uncommon, 35, member of the `crimson_wave` set) is untouched. `cat_ear_headband` is the one that is literally a band, which the sprite confirms, and it is standalone, so promoting it disturbs no set bonus. If the beanie was the intended item, this is the wrong one and the fix is the same two lines in the other entry, plus pulling it out of `crimson_wave` or accepting a legendary inside a set built around an uncommon.

THE ID IS UNCHANGED AND THAT IS THE ACTUAL DECISION HERE. `player_inventory` stores `item_id`, so every row already holding one becomes a legendary in place. Nobody is reissued anything and nothing is migrated, which also means whoever rolled this hat back when it was a common now owns a legendary, and there is no undo short of editing the table by hand. The alternative was a new `waows_band` id, leaving existing headbands alone as commons; the ask said rename, so rename is what shipped.

PASSIVE MOVES 15 TO 555. `getEquippedPassiveBonus` sums `item.passive` straight off the catalog; it does not derive the number from rarity. `RARITY_CONFIG.legendary.passiveBonus` is display metadata, not the payout. Leaving passive at 15 would have shipped a legendary that pays a third of what an uncommon pays, and rarity in this table is otherwise a strict function of passive within a slot. 555 is the existing legendary hat rate, matching Warlord Helm.

IT IS 60 TIMES HARDER TO ROLL NOW. `rollItemDrop` picks a rarity by weight and then picks uniformly inside that rarity's pool. As a common it was 550/1000 weight across 42 items, or 1.31 percent of a drop. As a legendary it is 5/1000 across 23, or 0.02 percent. The common pool shrinks 42 to 41 and the legendary pool grows 22 to 23, so every other legendary in the game got slightly rarer too: 0.0227 percent down to 0.0217 percent each. Small, but it is a real change to items nobody asked to touch, and it is what promoting anything into a five-weight bucket costs.

FIRST CATALOG NAME WITH AN APOSTROPHE IN IT. Stored double-quoted. Every path that renders an item name was checked before committing to the name: all of them put it in HTML text content or inside a double-quoted attribute, and the one `onclick` that sits next to a name passes `invId` and `slot` rather than the name. Nothing needed escaping. Worth knowing for the next name like this, because the failure would have been a broken handler rather than a wrong-looking string.

THE ENTRY MOVED TO THE END OF THE NEW-PACK HAT BLOCK, which is ordered by ascending rarity. Verified inert: the only consumer of catalog order is `Object.values` inside `rollItemDrop`, which filters by rarity and then picks at random.

---

## v1.3.9.2 (2026-08-21) - the profile reads the same playtime the dossier reads (SERVER + CLIENT)

Server restart required. Hard refresh required. Files touched: `server/db.js`, `server/server.js`, `client/assets/player-profile.js`, `client/version.json`, `docs/CHANGELOG.md`, `docs/MANIFEST.txt`.

THIS FIXES A DUPLICATE I SHOULD NOT HAVE BUILT. `players.play_seconds` has existed since the FRS telemetry work, accrues once a minute off `playerSockets`, and is what the god panel dossier prints. 1.3.9.0 added a second column, `playtime_sec`, with a second tick doing the same job from the same source, and pointed the profile at it. The new column started at zero, so an account reading 521h 39m in the dossier read a handful of minutes on its own profile.

THE DUPLICATE IS DELETED, NOT RECONCILED. `playtime_sec`, `addPlaytimeSeconds` and the second `setInterval` are gone. The surviving accrual is the original telemetry tick, unmodified. The profile endpoint calls `getPlaySeconds`, which is the same function the dossier path already called. Two surfaces, one column, one getter, no reconciliation logic to drift.

THE CLIENT FORMATTER NOW MATCHES `_frsTime` IN god-panel.js EXACTLY. Not approximately: same thresholds, same output string. The old profile formatter dropped minutes above 100 hours and printed seconds below a minute. A dossier saying 521h 39m beside a profile saying 521h for one account is a bug report waiting to happen, and the fix for it would have been this anyway.

THE VISIBILITY GATE IS GONE AND THAT IS A REAL LOSS. 1.3.9.0's tick skipped players whose tab reported itself hidden. `play_seconds` has no such gate and counts any live socket, so idle time with the tab open accrues again. Keeping the gate would have meant applying it to a column with a long history behind it, which silently redefines what every existing number in it means and puts a discontinuity in a stat the dev panel uses for analysis. Counting idle time is the smaller problem. The constraint from 1.3.9.0 stands unchanged and now covers a column that predates it: NOTHING MAY BE GATED ON PLAYTIME. No payout, no unlock, no title, no prized leaderboard.

THE DEAD `visibility` WEBSOCKET FRAME IS REMOVED on both ends. Nothing reads it now. A half-wired message type that looks load-bearing is worse than no message type.

THE ORPHAN COLUMN STAYS. Any database that already took 1.3.9.0 has a `playtime_sec` column that nothing reads. It is additive, it holds at most a few hours of data nobody saw, and dropping a column buys nothing while risking a rewrite of the players table. It is left alone deliberately.

---

## v1.3.9.1 (2026-08-21) - a real Edit Profile button, and the modal was buried on mobile (CLIENT ONLY)

No server change. No restart. Hard refresh required. Files touched: `client/index.html`, `client/assets/player-profile.js`, `client/version.json`, `docs/CHANGELOG.md`, `docs/MANIFEST.txt`.

THE UNDERLINE IS GONE AND THERE IS A BUTTON. `Edit Profile` sits in the header next to the name, styled like the rest of the header controls. The name stays clickable and opens the read-only view; the button opens the editor directly, because a control labelled Edit Profile should not drop the player on a panel where they have to find a second Edit Profile.

THE BUTTON IS A SIBLING OF THE NAME, NOT A CHILD OF IT. This is the same constraint as last release and it has not gone away: `mobile.js` `paintTitle()` mirrors `#fm-header-name.textContent` into the mobile top bar, so anything nested inside that span puts its label into the mobile title. Beside it is fine. Inside it is not. The comment above the span now says so, because the next person to touch this will reach for the obvious wrapper.

WIRING THE BUTTON TURNED UP A WORSE BUG THAN THE ONE BEING FIXED. `body.fm-mobile .wrap` is `position:fixed`, which makes it a stacking context, and the profile overlay ships inside `.wrap`. Its z-index of 10500 was therefore never compared against the mobile chrome at 9990 through 9998 at all; it was compared against `.wrap`'s siblings, and `.wrap` sits at auto. The profile modal would have opened underneath the top bar and the bottom nav on every phone. This is the identical defect to the drawer bug fixed in 1.3.6.1, described at length in the comment above the `.wrap` rule in mobile.css, and it is fixed the same way: the overlay is hoisted to body before it is shown. One-way, unlike the drawer, because nothing reads this node's position in the tree and there is nothing to restore on leaving mobile.

WORTH BEING CLEAR ABOUT WHOSE FAULT THIS WAS. The old cursor-anchored popup lived in the same place and had the same defect, so this predates 1.3.9.0. What 1.3.9.0 changed is how much it costs: a small box tucked near the tap point is a cosmetic annoyance when it renders low, and a full-screen modal that is the only route to a player's profile is the feature not working on mobile at all.

AND A SMALLER ONE, WORSE IN KIND THAN IN ODDS. `_ppBioCurrent` was cleared on close but not on open. Open another player's profile, close it, open your own while the fetch fails, and their text is sitting in your editor one Save away from being published under your name. The odds are poor, the outcome is not recoverable by the player, and the fix is one line in the reset block. Cleared on open now.

---

## v1.3.9.0 (2026-08-21) - player profiles: bios, playtime, and one panel instead of two (SERVER + CLIENT)

Server restart required. Hard refresh required. Files touched: `server/db.js`, `server/server.js`, `client/index.html`, `client/assets/player-profile.js`, `client/assets/player-profile.css`, `client/version.json`, `docs/CHANGELOG.md`, `docs/MANIFEST.txt`.

ONE PROFILE SURFACE, NOT TWO. The old cursor-anchored 280px popup is gone. Clicking a name in chat, clicking a chat avatar, and clicking your own name in the header all open the same modal. The desktop case is mildly worse for it: a screen-blocking overlay on a casual "who is this" click is more interruption than a small card next to the cursor was. It loses that argument on mobile, where a popup positioned at the tap coordinate was half off screen as often as not, and it loses it again on principle, because two panels describing the same object drift.

THE EDIT CONTROL IS NOT IN THE HEADER. It sits under the name inside the profile, self only, alongside Change Portrait. The header row was the obvious place and it is the wrong one for a concrete reason: `mobile.js` `paintTitle()` mirrors `#fm-header-name.textContent` into the mobile top bar, so a button nested under that node puts the string "Edit Profile" into the mobile title. The header name is now a click target instead, which costs nothing and reaches the same place.

THE BIO IS THE ONLY STRING ON THIS PANEL THAT AN UNTRUSTED PARTY WROTE. Every other value the profile renders comes from `ITEM_CATALOG` on the server, which is why the existing render path builds the whole thing with `innerHTML` and has been safe doing it. Putting player text through that path is stored XSS on every viewer who clicks the name. The bio goes through `textContent` and nothing else. URLs are not auto-linked either: a clickable link a stranger controls is a phishing surface and the server does not vet destinations.

THE 2000 CHARACTER CAP AND THE SLUR FILTER ARE CONTENT POLICY. They are not the injection defence and must not be read as one. `filterChat` is the same pass chat runs through, applied on write. Writes are on a twenty second cooldown, admins exempt, and dunced accounts cannot write at all. Admins get a Clear Bio control that wipes the field without touching anything else on the account.

TWO TIME STATS, BECAUSE THE ASK WAS TWO THINGS. "How long have you had the account" is Joined, read from `created_at`, already in the table, and impossible to manufacture. "Track your own time" is Playtime, a new `playtime_sec` column.

PLAYTIME ACCRUES SERVER SIDE AND STILL COUNTS IDLE TIME. One tick a minute walks `playerSockets` and credits every player who has a live socket that has not reported its tab hidden. Presence is therefore a server held fact, not a number the client hands over, and the only thing the client contributes is a `visibility` frame. The most a forged frame buys is what leaving the tab open already buys, which is the whole reason this shape is acceptable. The elapsed value is measured rather than assumed, so a stalled event loop under-credits instead of drifting, and the credit is clamped to an hour so a suspended process cannot dump a day into the column on resume.

WHICH MAKES IT A SESSION ODOMETER AND NOT AN ENGAGEMENT SCORE. NOTHING MAY BE GATED ON IT. No payout, no unlock, no title, no leaderboard with a prize attached. The number is cosmetic and it is only safe while it stays cosmetic; the moment a reward hangs off it, it has to be re-derived from something an open tab cannot fake. That constraint is written into the comment above `addPlaytimeSeconds` and above the tick, in both places, because one of them will get read and the other will not.

FOR SALE IS A SEPARATE QUERY, NOT A FILTER ON THE OWNED SET. `getInventory` already excludes rows with an open `item_market` listing. Reusing it for a shelf-and-stock view would have rendered a profile with exactly the for-sale items missing from it. `getPlayerItemListings` reads the listings directly and the panel shows them in their own grid with prices. Added `idx_item_market_seller` so the per-seller lookup is not a table scan on every profile open.

The visibility frame is handled ahead of the rate limiter on purpose. It fires on tab switch, and a player alt-tabbing quickly would otherwise spend their chat budget on it.

MIGRATIONS ARE ADDITIVE AND RUN THROUGH THE EXISTING COLUMN BLOCK: `bio`, `bio_updated_at`, `playtime_sec`. No table rewrite, no backfill, nothing to undo. Old clients that never send a `visibility` frame are treated as visible rather than frozen at zero, so the stat starts moving on restart without waiting for everyone to refresh.

---

## v1.3.8.4 (2026-08-21) - droid5 is withdrawn, and a withdrawn portrait stops leaving a hole (SERVER + CLIENT)

Server restart required. Hard refresh required. Files touched: `client/assets/portraits/droid5.png` (DELETED), `client/assets/portrait-manifest.js`, `server/db.js`, `server/db_council.js`, `server/server.js`, `client/version.json`, `docs/CHANGELOG.md`, `docs/MANIFEST.txt`.

DROID5 IS DEFECTIVE AND IS GONE. Fifth tile in the Synthetic group, gatlingart pack. The PNG is deleted and the id is out of both `FM_PORTRAITS.groups` and `FM_PORTRAITS.all`. Synthetic goes 100 to 99, the whole picker 258 to 257. It was never in `frame` because the entire droid set renders 1:1, so there is nothing to remove there. Nothing else in the codebase named it: no codec rep, no SEAT_META regent, no seed.

THE DELETE ON ITS OWN WOULD HAVE BEEN HALF A FIX, AND THE WORSE HALF. `PORTRAIT_SET` is a readdir at boot, so removing the file removes the id from validation on the way IN and does exactly nothing about the rows that already hold it. Anyone wearing droid5 keeps wearing it. The header badge is a background-image, so a 404 there is not a broken image icon, it is an empty square with the + affordance suppressed: no avatar, and no visible way to go get one, because the picker no longer lists the thing they are currently wearing. Chat avatars would hide the wrapper on error and codec would hide the img, which is tidier and just as silent.

SO THE SWEEP. `clearWithdrawnPortraits(isValid)` in db.js nulls `players.portrait` for every id the caller rejects, and the wearer falls back to the + and repicks. The predicate lives in server.js as `portraitStillExists`, not in db.js, because which ids are real is a filesystem fact and a gating fact, and the storage layer has no business knowing either. Gated ids and `item:` / `data:` forms are passed rather than judged: their art is not in the portraits dir at all.

THE COUNCIL SWEEP IS NOT A BONUS, IT IS THE OTHER HALF OF THE SAME BUG. `councilPostView` resolves the author's LIVE portrait first and reads the frozen `council_posts.portrait` column only when the author has none. Which means the players sweep, on its own, creates the case that falls through to the frozen id. Clear a droid5 wearer and every council post they ever made starts rendering the dead id it froze at post time. `clearWithdrawnPostPortraits` runs in the same boot block for that reason, and touches floor posts even though `pruneCouncilPosts` deliberately does not, because this nulls a rendering hint and not a record of what was said.

THE SWEEP IS GATED ON A SUCCESSFUL READ AND A FLOOR OF 200. This is the part worth arguing about, so: the two failure directions are not the same size. Skipping the sweep costs one player one blank avatar until the next boot. Running it against a `PORTRAIT_SET` that came back empty or truncated from a bad mount nulls the portrait column for every account on the station, and there is no undo short of a backup restore. The existing try/catch logged the read failure and carried on with an empty set, which was harmless when the set was only ever read to reject writes and is not harmless now that something writes based on it. `PORTRAIT_LOAD_OK` plus the floor is four lines against an unrecoverable outcome.

IT LOGS WHAT IT CLEARED, BY ID AND BY COUNT, and says so explicitly when it clears nothing. A destructive boot step that prints nothing is how a bad predicate gets found a week later by a player instead of on the first restart. It is idempotent: second boot finds nothing and touches nothing.

OPEN ITEM FOR THE NEXT PORTRAIT BUILD. `portrait-manifest.js` is generated by a tool that does not live in this repo. This edit is to the generated artifact. If the generator runs again over the portraits dir it will produce 257 correctly, since it reads the directory; if it works from a stored id list, droid5 must be struck there too or it comes straight back.

---

## v1.3.8.3 (2026-08-19) - 198 portraits, six faces change hands, and the framing stops being a constant (SERVER + CLIENT)

Server restart required. Hard refresh required. Files touched: client/assets/portraits/ (198 new PNGs), client/assets/portrait-manifest.js, client/assets/player-profile.js, client/assets/codec-data.js, client/assets/council.js, client/assets/core.js, client/style.css, server/server.js, client/version.json.

THE PICKER GOES FROM 60 TO 258. Ninety eight Colonist heads and one hundred Synthetic ones join the five groups already there, at 393x397 RGBA like everything else, so there is no resize path and no second loader. The sixty originals in the incoming pack were byte compared against the sixty on disk and are identical, which means nothing anybody is currently wearing moves.

THE ARTIST CREDIT IS THE PART OF THIS THAT IS NOT BOOKKEEPING. It was one line in the modal header, "Art by subotai", sitting above the whole list. That was accurate for as long as subotai drew all sixty and stops being accurate the instant a second artist is in the set, at which point a line intended as credit quietly assigns someone else's work to the wrong name. Credit now attaches to the group rather than the modal, and a group with no entry renders nothing at all rather than inheriting whatever sits above it. Colonist and Synthetic credit gatlingart.

SIX FACES CHANGE. Captain Trisha McHallan moves to scan99, Rahtan to scan80, Father Xen to droid38, which is the first time the Void Collective's tech priest has had a head that is actually a machine rather than a man with parts in him. Jaquet stays on hacker1. In the chamber, Guild Notary Ostrow moves to scan10 and Syndicate Proxy Vasari to scan31.

THAT LAST PAIR CLOSED SOMETHING NOBODY HAD FILED. Rahtan and Vasari were both corpo7. The Guild's factor and the Syndicate's proxy have been wearing the same face this whole time, one in the codec and the other in the chamber, which is exactly the sort of collision that survives because the two rooms are never open at once.

THE FRAMING WAS ONE HARDCODED NUMBER, 1.55x anchored thirty seven percent down, applied to every ring that shows a face. That constant was measured against art that sits inset in its frame with margin on every side. The scan set is drawn out to the frame edges and is already larger in frame before anything zooms it, so the same correction on top cropped straight through the face. Ostrow came out as hair and a pair of goggles. Vasari came out as a jaw.

WHAT REPLACED IT, AND WHAT DID NOT. The scan portraits carry three numbers measured off the PNG at build time: the width of the widest point in the top of the silhouette, its centre, and where the subject begins. Everything else renders 1:1, no crop at all, which is both the correct default for art with no measurement and, for the original sixty, better than the crop they had always shipped with. Those were only readable as too tight once looser heads sat beside them in the same row.

THE MEASUREMENT ASSUMES A HUMAN BUST and two things are not one. A machine bust is head all the way down, so the rule reads a droid's narrow crown as a small head and zooms in on it, worst on the most machine-like: droid16 landed at 2.79x, framed on a blank curve of helmet with the robot entirely out of shot. All hundred droids render 1:1. scan31 fails the same way for a different reason, a narrow hood over a wide beard, and is excluded by name. Both were found by rendering every portrait the rule zoomed past 1.25x and looking at them, not by trusting the arithmetic, which had already been wrong once.

MR FLESH GAINS THE MOST AND WAS NOT PART OF THE REQUEST. His portrait is the Preserved Brain sprite, 32x32, and the old zoom cut the glass off entirely: the ring showed brain matter with no jar around it, which is a fairly serious thing to have been doing to the proprietor. He renders whole.

THE CHAT AVATAR IGNORED THE ACCESSIBILITY CONTROL. It was forty pixels, written inline, while the text next to it scaled off the A+ / A- setting. Somebody turning the type up is doing it because the small size is hard to read, and the face was the one element that stayed put. It now scales off the same variable with a base of fifty two pixels set in one place in style.css; council room avatars do the same at thirty four. A broken image hides the whole ring rather than leaving an empty bordered circle behind.

THE SERVER NEEDED NO VALIDATION CHANGE, which is worth stating rather than leaving implied. The selectable set is a readdir at boot, so new files are legal the moment the process restarts and illegal until then. A client that has hard refreshed against an old process will show the new faces and fail to save one.

VERIFIED IN A REAL DOM. The picker is built under jsdom and asserted on: every tile resolving to a file that exists, no duplicates, selection highlight, credit placement, framing present for exactly the measured set and absent everywhere else, no ring left with an uncovered gap, and item art falling through to 1:1. A control run against the unmodified files fails eleven of them, which is the only reason the passing run means anything.

---

### Council chamber redesign (same release)

Files touched: client/assets/council.js, client/assets/galaxy.js, client/assets/sound.js.

THE CHAMBER WAS ONE COLUMN ABOUT 2500 PIXELS LONG: the ring, then four seat cards, then the composer, then the treasury, then the chat, then the accord list, then the log. Everything was there and none of it was next to anything it related to. You could not see who held a chair and what was being said in the room at the same time, and that pairing is most of what the page exists for.

IT NOW HAS THE SAME SHAPE AS THE REST OF THE CLIENT. style.css lays the main view out as a centre column with a chat rail down the right, and the chamber is the same kind of page: one thing you are looking at and one conversation beside it. It had invented a different arrangement for no reason a player would recognise. The ring is centre stage, the four chairs sit directly under it because they are the choice the ring illustrates, and the floor scrolls below them. The treasury and the room move into the right rail, laid out like #rightPanel: treasury at its natural height, the room taking everything left, so the chat grows with the window instead of being pinned to an arbitrary 300 pixels.

THE RING AND THE CHAIRS DO NOT SCROLL. They are the header of the centre column, so who holds a seat cannot leave the screen while you read what is on the floor, which is the pairing the old single column made impossible.

FULLSCREEN IS THE SAME MECHANISM CITIES ALREADY USED, a class toggled on the pane by the sub tab handler, rather than a second way of doing the same thing. Unlike cities this pane covers the tab bar, so the band carries its own way out, and that exit clicks the sub tab it wants instead of hand unsetting display, so one code path still decides what is visible.

TEXT SIZE RUNS OFF THE CONTROL THAT ALREADY EXISTS. All eighty two inline sizes in council.js were literals; they are now expressed against a single variable derived from the same A+ / A- setting the chat uses, at a 1.15 baseline so the default is larger than it was. A council only size control would have been a second thing to find and a second thing to drift out of sync with the first.

UNDER 900 PIXELS IT IS ONE COLUMN and the ring goes. That is the breakpoint style.css already uses for the main grid, rather than a second number that means the same thing. A 900 by 260 graphic at phone width is a smear, and the four cards carry the same information in text. The columns flow into a single scroll rather than fighting over the height.

THE SEAT CARDS WERE CARRYING TOO MUCH. Name, status and timer are what change between visits; the title that holds the chair and the house note do not, and four cards of that side by side was most of the reading weight on the page. Those open on click now. Which cards are open survives a rebuild, so an accord expiring elsewhere does not close what you were reading.

THE COMPOSER NEVER GOT ITS CARET BACK, and this was found by the test rather than by reading. 1.3.8.2 gave the room chat box its text, its caret and its focus across a rebuild, and left the Accord composer directly above it with the text only. Same mistake, one element over, in the other direction, and it survived because restoring the text looks like the fix. It restores the caret and focus now, and only takes focus back if the person actually had it, which is the part that stops it stealing the cursor out of the chat below. Both column scroll positions are preserved on the same principle: a reader halfway down the accord list thrown back to the top because an unrelated chair moved has lost their place exactly the way a half typed clause used to be lost.

THE RING IS CAPPED at a viewport fraction. At its natural size it would take a third of a laptop screen before a single accord was visible. The first attempt capped it across a full width band, which letterboxed a 900 by 260 graphic into a wide strip with empty gutters either side; inside the centre column its own width sets the height and the cap only catches tall windows.

VERIFIED IN A REAL DOM: 32 assertions under jsdom covering the shell, which content lands in which region, the collapsed seat details toggling, and the state that has to survive a rebuild. No control run is available for this suite, since it drives a debug hook the old file does not have; the caret assertion did fail against the unfixed code while it was being written, which is what put the fix in.

---

## v1.3.8.2 (2026-08-16) - The Council tab was eating what you typed (CLIENT)

Client only. No restart. HARD REFRESH REQUIRED. Files touched: client/assets/council.js, client/version.json.

THE SYMPTOM was a Council tab that appeared to refresh every ten seconds or so, clearing anything half written. Nothing in the codebase runs on a ten second cadence; the cause was event driven and it was entirely mine.

renderRooms() rebuilds croomWrap with innerHTML, and the room chat input was never captured across that rebuild. The Accord composer got captureDraft/restoreDraft when it shipped, precisely because a redraw eating a half typed 50,000,000 clause was the wrong failure, and then the chat box sitting directly beneath it got none of that treatment. Same mistake, one element over.

WHAT WAS TRIGGERING THE REDRAWS, none of them on a timer that matched the reported interval: anyone posting in the room, a council_dirty broadcast whenever an accord or a seat moved, and a blind thirty second tick that called a FULL render regardless of whether anything had changed. With two people in a room those land every few seconds, which is where the ten seconds came from.

FOUR FIXES.

The room input now preserves its text, its CARET and its focus across every render, matching the composer. Restoring the text but dropping the cursor to the end is its own small insult when you were editing the middle of a line. Focus is only taken back if the person actually had it, because calling focus() unconditionally on every render steals the caret out of the Accord composer, or out of the main chat, while somebody is typing there.

An incoming post now APPENDS one line rather than rebuilding the pane. That was the most frequent trigger by a distance, and rebuilding everything to add a line at the bottom is what made typing feel like it was being eaten. The draft survives either way now, but not touching the input at all is better than restoring it.

The thirty second tick exists only to age relative timestamps such as "expires in 47h 58m". It now skips entirely while anything inside the pane has focus, so a redraw can never land mid sentence.

council_dirty defers while typing and coalesces, so a burst of chamber activity results in one reload once you stop, rather than a reload per event on top of your sentence.

Scroll position is preserved as well, and follows new messages down only when you were already at the bottom, which is how a chat should behave and was not what a full rebuild did.

VERIFIED IN A REAL DOM, not by reading. council.js is run under jsdom, a line is typed with the caret placed mid string, and a post is delivered over the event bus: 11 assertions covering text, caret, focus, the message actually rendering, and send still clearing the box. A control run against the unfixed code reproduces the symptom exactly, failing on typed text, caret and focus, which is what makes the passing run mean anything.

---

## v1.3.8.1 (2026-08-16) - Mr. Flesh takes the room (SERVER + CLIENT)

Server side. Requires a restart. Hard refresh. Files touched: server/server.js, client/assets/council.js, client/version.json.

THE BRAIN PORTRAIT DID NOT RENDER, AND THE REASON IS WORTH RECORDING. Mr. Flesh's portrait is not a file. codec-data.js gives him 'item:jarred_brain', the Preserved Brain item art, resolved out of ITEM_CATALOG_CLIENT as a base64 data URI. The chamber's resolver only understood bare stems, so it stripped the colon, built assets/portraits/itemjarred_brain.png and rendered a broken image. It now handles all three shapes codec.js:103 already handled: a data URI used as is, an item reference resolved from the catalog, and a bare stem from the portraits directory. Same id, same result, in both places.

ITEM_CATALOG_CLIENT LIVES IN THE LAZY LOADED inventory.js, so the chamber pulls it in on demand and re-renders once, guarded by a flag rather than queuing a load per message in a room full of his lines.

THE ART IS A 32 BY 32 SPRITE. It renders image-rendering:pixelated, because upscaling a brain in a jar smoothly turns it into a smear. Portraits-dir images are full resolution and are left smooth, which is the same split codec.js makes.

PINNED TO THE HOUSE. The owner account now renders fleshstation gold and the brain portrait in the chamber whatever the players row says. syncDevAccounts sets faction='fleshstation' on promotion, but it only runs at boot from a .env that is not present on the VPS, so the row is unreliable and the proprietor was rendering as an unaligned nobody in his own chamber. This is a DISPLAY pin and deliberately does not write the row: it is a fact about who he is, not a claim of faction membership, and writing it would start paying him a faction colony bonus.

THE PROPRIETOR VOICE. Mr. Flesh joins the GM voice picker on the floor, listed first because he is always available. He is A VOICE AND NOT A CHAIR: his seat is null, he cannot table, sign, decline or pull anything, and he does not appear in the seat roster. Giving the house a vote would make every other chair decorative. He owns the building; he does not need a seat at the table.

The record still knows who typed it. council_posts.author_id holds the real account and speaking_as holds the persona, exactly as it does for the regents, and author_id is still never sent to any client.

TESTED, 19 NEW ASSERTIONS. The owner pinned to fleshstation over a NULL faction row, the brain portrait overriding his own picked portrait, the players row confirmed NOT rewritten, the voice offered only to the GM, a normal player refused it, the persona carrying the brain and the npc flag with no seat, the proprietor refused when tabling an Accord, the seat roster confirmed to contain no proprietor chair, and the typing indicator naming him. The 176 assertions from 1.3.8.0 pass unchanged.

---

## v1.3.8.0 (2026-08-16) - The Council Chamber (SERVER + CLIENT)

Server side. Requires a restart. Hard refresh for the Store and Galactic tabs. Files touched: server/db_council.js (new), server/db.js, server/server.js, client/assets/council.js (new), client/assets/galaxy.js, client/assets/core.js, client/assets/market-state.js, client/assets/sound.js, client/index.html, client/version.json.

VERSION NOTE, BECAUSE THE HISTORY WILL LOOK ODD OTHERWISE. This work was drafted across seven patches numbered 1.4.0.0 to 1.5.0.0 and is consolidated here as 1.3.8.0, a straight patch increment on 1.3.7.6. The old numbering was not merely inflated, it COLLIDED: v1.5.0.0 and v1.5.1.x already exist in this file from 2026-07-24. Nothing in the codebase compares version strings (apply.sh and ship.sh read client/version.json only to name a commit), so renumbering downward breaks nothing.

WHY ANY OF THIS EXISTS. Players were already conducting territorial diplomacy in global chat, unprompted and with an audience. The Void Collective took two colonies and then offered the acting President a swap. Every part of that deal was ALREADY mechanically executable, because /api/galaxy/fund has never required faction membership and anyone may fund any faction on any colony. What was missing was not a room. It was ENFORCEMENT. Building a nicer room for the same unenforceable conversation would have added a paywall to content that was already happening for free.

### The Accord

A pair of typed obligation lists the server owns, escrows and executes atomically, plus an optional free text RIDER it stores and never reads.

BONDED VERSUS RIDER IS THE WHOLE THING. A bonded clause is a guarantee the server holds credits against. A rider is a stated intention nothing enforces. The composer, the ledger and the signature confirmation all say which is which in words rather than only in colour, because a player who signs a rider believing the server was holding it is the exact failure that kills the guarantee for everyone at once, permanently. Riders are still the good part: a broken rider is a public, dated, on the record betrayal the whole chamber can read six months later.

THERE IS DELIBERATELY NO CASH CLAUSE. Every player to player value route sits behind canSendValue, and the wire charges 2% plus a 90% Guild surcharge above 10,000. An Accord with a credits clause and no surcharge is a strictly better wire than the wire with no 12 hour cooldown, which is the Fbay hole from 1.2.x wearing a treaty. One that DID carry the surcharge would price a 500,000,000 political payment at 450,000,000 in tax. Neither branch is acceptable, so there is exactly one clause kind, fund_colony, which BURNS credits into a colony war chest and transfers to nobody. No transfer means no clearance surface and no laundering route. It is also the clause the real scenario needed: two blocs trade territory by buying each other's control percentage, not by wiring each other cash.

applyColonyFunding was extracted verbatim from the /api/galaxy/fund route body so an Accord funds through the IDENTICAL path rather than a parallel implementation that can drift. The alreadyDebited flag exists because an Accord escrows hours before the funding applies.

### The four chairs

Coalition is the EXISTING Presidency, resolved live from the president variable, still bought in the Title Market. Guild is never purchasable: it is the notary and the house, and since it holds real territory a Guild outside the room would be the one bloc that can conquer and cannot be bargained with. Syndicate and Void are Legendary titles at 500,000,000 each, sitting in the same rack as the Presidency, because offices living in two shops made no sense.

THE TITLE IS THE OFFICE. Granted on acquisition, auto-equipped, stripped on overthrow, and each drives the holder's chat colour. council_seats stays authoritative for one reason only: it carries acquired_at and a title has no timestamp, so a protected term cannot live in ownedTitles. buildAvailableTitles re-derives in BOTH directions so a drifted row self corrects.

CHAIR COLOURS WERE PICKED AGAINST THE CHAT CHAIN, NOT THE FACTION PALETTE. The obvious choices, #e74c3c and #9b59b6, are already the escaped-cyborg and plain-cyborg colours; a delegate in either would tell every reader the wrong thing about who they are.

PROTECTED TERMS ON EVERY CHAIR. 72 hours for the council seats, SEVEN DAYS for the Presidency. Before this the Presidency could be taken the instant somebody outbid it, which makes the office a live readout of who has the most cash rather than a position anyone holds, and the Coalition chair is a Council seat, so a counterparty who can vanish mid negotiation is not worth signing with. A protected term also guarantees the holder the passive for its whole length, a floor of 5,040,000 nobody can interrupt, and makes election rallies rarer. Both accepted; an office anyone can take at any second is not an office.

ESCROW FOLLOWS THE PERSON, THE RIGHT TO SIGN FOLLOWS THE CHAIR. An ousted delegate is refunded in full; Accords addressed TO their chair stay open for the incoming holder to inherit.

### The three surfaces

floor (delegates only, NEVER pruned), gallery (anybody, bounded), faction:<id> (that faction only, and a non-member cannot even read one). Reading is deliberately laxer than writing: the floor is public to watch and closed to speak in, which is the entire shape of the feature. The floor is excluded from the prune sweep IN THE QUERY, because a chamber whose transcript ages out is not a record and riders only matter because a broken one is readable months later.

THE GM REGENT VOICE. A dev, admin or owner addresses the floor as any REGENT HELD chair and the room sees the regent: name, portrait, faction colour, and a live typing indicator. The costume is on the DISPLAY ONLY. council_posts.author_id always holds the real account and speaking_as holds the persona, because an audit trail that lies about authorship is worse than none. author_id is never sent to any client. A GM cannot speak for a chair a player holds.

SPEAKER IDENTITY RESOLVES LIVE. Portrait and faction are looked up on every read rather than frozen onto the row: the row records WHAT WAS SAID, but who the speaker is NOW is a property of the speaker. Old posts pick up a portrait chosen later and recolour on a faction change. The live broadcast and the history read go through one function, because two constructions of one wire shape is how they drift.

### Faction treasuries

Before this a faction owned NOTHING. faction_funding is a ledger of past individual spending; there was no pot, so a head could only commit their own wallet, which makes the chair a signature rather than an office.

THE INVARIANT, a property of the code and not a policy: treasury credits can become faction control or Accord escrow and can NEVER become any player's personal cash, by any path. There is no withdraw endpoint and adding one undoes the feature. FOUR refund routes exist (decline, withdraw, expiry sweep, seat loss) and four independent implementations is four chances to send faction credits into a personal wallet, so all four go through one router that reads payer_proposer / payer_counter and sends money back where it came from.

The consequence is the design: a bad leader can WASTE a treasury and cannot STEAL one. Waste is recoverable, public in the ledger, and gets them ousted from a chair contestable every 72 hours.

Funding is VOLUNTARY, not a levy on member activity, so a leader nobody trusts runs an empty treasury. Contributions are NOT gated by Guild clearance, because clearance guards player to player routes and a contribution reaches no player ever.

### Announce then execute

WHAT IS ACTUALLY IRREVERSIBLE IS NARROWER THAN "A BIG ACCORD". A leader spending their own money on a bad deal hurts only them. A treasury spend on their OWN faction's control is waste at worst: the credits are gone but the ground is theirs. The case needing a brake is the pair PAID FROM A TREASURY and FUNDING A FACTION THAT IS NOT THAT TREASURY'S OWN, which is the only combination where members are harmed by a decision they did not make and cannot undo. Everything else still executes on signature.

A WINDOW, NOT A VOTE. Quorum in a faction with a dozen active players is a feature that dies quietly and a voting UI nobody reaches. A 12 hour countdown needs neither. The answer to "our leader is about to hand Gluttonis to the Void" becomes: argue in the faction room, lobby the other chairs on the floor, or if their 72 hour term has lapsed, buy the chair out from under them before the clock runs out. The right to pull follows the CHAIR, not the person who committed, so the new holder can cancel their predecessor's decision. That is politics resolving politics using only parts that already exist.

The receiving chair deliberately CANNOT pull it. They agreed; the window protects a faction from its own leader, not either signatory from a deal they regret.

THE WINDOW COVERS BOTH ROUTES, AND THE FIRST CUT DID NOT. It was gated on the ACCORD SHAPE rather than on the condition, so a leader who wanted to hand ground away did not need an Accord at all: pointing /api/council/treasury/fund at a rival landed instantly, with no counterparty and nobody able to pull it. Found by inventorying what a chair actually grants before shipping rather than by reading the code, and confirmed against a running server, where one call moved lustandia void control from 28% to 32%. The predicate is now applied at the source, and it is named for the CONDITION rather than for the Accord, because naming it after the shape is what caused the gap. A direct spend has no Accord to hang a pending status on, so committed spends live in treasury_pending; the credits leave the balance at commit time and are held there exactly as Accord escrow is, so the figure members read is honest about what is already spoken for.

TWO BUGS IN THAT FIX, BOTH CAUGHT BY THE SUITE. First, applyColonyFunding already returns a field called `pending`, the war fund carry-forward remainder, and spreading its result alongside a boolean `pending` made an INSTANT spend read as held to anything checking the flag. The flag is now `held`. Second, the outflow was double counted: credits are debited once at commit and logged there as spend_pending, and logging the execution as another negative made the ledger stop summing to the balance, which is the one property that makes the ledger worth reading. The execution entry is now amount 0.

### Bugs found along the way, recorded because they repeat

STALE OBJECT OVERWRITE, caught by the escrow conservation assertion and would otherwise have shipped. refundProposerAccords reads and saves its OWN player row, so any player object read BEFORE it is stale by exactly the refund and saving it afterwards silently reverses the credit. Adding stripSeatTitle to the ouster path introduced precisely that. The same hazard was latent in the President path.

SAVE INSIDE A CONDITIONAL, pre-existing. The President ouster had savePlayer inside the equipped-title check, so a player who OWNED the title without WEARING it kept a Presidency they had lost across a reload.

GLOW ON AN IMAGE IS A BLUR. The portrait glow filter was applied to the image itself, which smears the face and defeats the reason for having one. It belongs on the ring.

TWO CONSTRUCTIONS OF ONE WIRE SHAPE. The live post broadcast hand-built its payload while history went through councilPostView, which is why a live post carried a portrait the same post lacked after reload.

### Verification

199 assertions across eleven suites, run against a live server: the Accord primitive and its guards, chair titles and colours, portraits, the three surfaces and the GM persona, speaker identity, treasuries and the no-withdraw invariant, treasury escrow surviving an ouster, the delay rule, and the chair-takeover counterplay. Plus i18n-check, selector-check, scopecheck and mobile-audit.

### Currency glyph

23 pre-existing instances of the wrong symbol are corrected: U+0192, a small f with hook, where U+0191, the capital F with hook, is the game's credit sign. They sat in the warehouse rent and shortfall messages, the faction bonus summaries, and the Chinese translations, where the English read "+Ƒ500 per income cycle" and the zh string directly beside it read "+ƒ500". Ƒbay was already correct in all 17 of its uses, which is what confirmed which character was intended. Every occurrence was inventoried and classified before the swap rather than blanket replaced on faith; there is no legitimate use of U+0192 anywhere in the tree. Historical CHANGELOG prose keeps its original characters, because that is a record of what was written at the time rather than shipped copy.

### Still open

Regent names and the two chair title names are placeholders, not GM-authored. Mining cash remains client-authoritative via mining_bank, and it matters more now: a fabricated balance can flow into a treasury and out as territory, at which point it is laundered into world state rather than isolated to one account.

---

## v1.3.7.6 (2026-08-12) - Dev account decommission: four retirements, two rotations (SERVER)

Server side. Requires a `.env` edit on the VPS and a restart. Files touched: server/seed_devaccounts.mjs, server/.env.example, server/server.js (comment), docs/README_LOCAL.md, deploy/DEPLOY_README.md, client/version.json.

WHY. Four former collaborators hold the plaintext passwords for DEV-FIXER, DEV-SLUT, DEV-GURU and DEV-PEAK and no longer work on the project. Every dev account is also an admin account, so an unrotated credential is a live admin session for anyone who kept it.

RETIRED, NOT DELETED. `PRAGMA foreign_keys = ON` is set in db.js, and three references to `players(id)` carry no `ON DELETE CASCADE`: `fund_proposals.proposer_id`, `fund_votes.player_id` and `funds.owner_id`. A `DELETE FROM players` would therefore fail outright for any retired dev who had ever filed a fund proposal or voted on one, and succeed for the rest, which is the worse outcome of the two: a partial purge that looks finished. Deleting would also orphan their trade history and cascade away their chat. The player rows stay; the privileges do not.

LOGIN SEALED, NOT ROTATED. The four retired accounts do not receive new passwords. `password_hash` is set to 64 bytes of random data, which is not the hash of any string, and `verifyPassword` compares a 64 byte attempt against a 64 byte stored value and can never match it. There is no plaintext to leak because none was ever generated. Reviving an account means re-issuing a real hash, which is a deliberate act rather than an oversight.

THE NON-OBVIOUS PART: DEMOTION ALONE WOULD HAVE PROMOTED THEM. Three behaviours interact. `seed_devaccounts.mjs` sets `patreon_tier=3` on every dev. `revokeExpiredPatreon()` skips `patreon_tier=3` entirely, because tier 3 is CEO and treated as lifetime, so the tier never lapses on its own. `syncFundMembership()` auto-enrols every player at `patreon_tier>=2` into MERCHANTS_GUILD. Today those accounts are held out of the guild only by the sweep that deletes memberships where `(is_dev=1 OR is_admin=1) AND is_prime=0`. Clear `is_dev` and `is_admin` without clearing the tier and that sweep stops matching them, the patron sweep enrols them on the next tick, and four retired accounts acquire deposit, withdraw and proposal rights on the guild hedge fund that they do not have while they are still devs. Removing a name from `DEV_ACCOUNTS` and stopping there would have widened access rather than narrowed it.

WHAT RETIREMENT ACTUALLY CLEARS. `is_dev`, `is_admin`, `is_prime` to 0. `patreon_tier` to 0 with `patreon_member_id` and `patreon_expires_at` nulled, so the tier cannot be inferred back. The dev-only `fleshstation` faction dropped, since `syncDevAccounts()` sets that faction on promotion but never removes it on demotion and `/api/faction/join` rejects `fleshstation` as dev-only, leaving a non-dev holding a faction they could not join. Memberships in both FLSH and MERCHANTS_GUILD deleted. Order matters: the tier is zeroed before membership is pruned, otherwise the patron sweep re-adds what the prune removed.

BOTH HALVES ARE REQUIRED. `DEV_ACCOUNTS` in `.env` governs role flags at boot, since `syncDevAccounts()` resets `is_dev` and `is_admin` for every non-prime player and then re-flags only the listed names. It does not touch passwords, tiers or fund membership. The `RETIRED_ACCOUNTS` block in the seed script covers those. Doing only the env half leaves four working logins; doing only the script half means the next boot is clean but nothing enforces it thereafter.

ROTATED. MrFlesh and DEV-SMASHER keep dev status with new 144 bit passwords and new salts. The old hashes are replaced, so the previously distributed plaintexts stop working for these two as well.

AUDIT LINE. The seed script now prints every account still carrying `is_dev`, `is_admin` or `is_prime`, and prints a `[WARN]` if any of them is not in `DEV_ACCOUNTS`. This is the check to read after running it; a silent success is not evidence that the set is correct.

IDEMPOTENT. Re-running the script is safe and converges on the same state.

---

## v1.3.7.5 (2026-08-08) - Codec story mode: three reps written and brought online (CLIENT)

Client only. No restart. Hard refresh required. Files touched: client/assets/codec-data.js, client/version.json.

THREE OF FIVE CODEC CONTACTS WERE UNREACHABLE. Mr. Flesh and Father Xen had branching lore trees and played. Captain Trisha McHallan, Rahtan and Jaquet had no tree, and none of the three was callable at all.

WHY THEY WERE OFFLINE. `repEnabled()` requires `enabled === true`. McHallan was explicitly `enabled:false`. Rahtan and Jaquet had no `enabled` key whatsoever, which fails the identity check exactly as hard as false does, so both rendered with the red Offline button and refused the call. All three are now `enabled:true`.

WHY A TREE ALONE WOULD NOT HAVE BEEN ENOUGH. `connect()` calls `selectCurrentQuest(qlist)` first and only falls through to `rep.tree` when the list is empty or every quest is completed. McHallan carried COLD OPEN inside `quests[]`. Rahtan and Jaquet used the legacy `rep.quest` shape, which the engine wraps into a one item qlist at call time. In all three cases the quest pitch wins and the tree never renders. Each rep now carries `quests:[]`, the same parking pattern Father Xen already used for COMMUNION.

NOTHING WAS DELETED. McHallan's COLD OPEN moved to `parkedQuests`, a key the engine does not read. Rahtan's CREDIT CHECK and Jaquet's BEAR RAID stay on `rep.quest`, now shadowed by the empty `quests` array. Every script is intact and each questline restores by renaming one key or removing one empty array.

presidentLock REMOVED FROM McHALLAN. `if (st.locked) { presidentBlock(); return; }` fires in `connect()` before the tree branch is ever reached, so with the lock on, the President would call the Coalition liaison, receive a single line and never see a word of the lore. The `{name}` token already resolves to President for the seat holder, so the writing addresses that player correctly without an engine change. Restore the lock together with a president router node when COLD OPEN ships.

NEW CONTENT. 24 nodes each for McHallan, Rahtan and Jaquet, matching the depth of the two trees already live. Six topics per rep plus a `work` stub in the idle slot. One faction router each, mirroring Father Xen's augment recognition: McHallan and Jaquet route on the proprietor question, Rahtan routes on Guild ownership, which is where his secret sits.

McHALLAN AND RAHTAN WERE REWRITTEN BEFORE RELEASE. Their first draft read as machine written and the first draft was measured rather than argued about. The tic was antithesis, the sentence shape "it is not X, it is Y" with a closing aphorism on nearly every node: McHallan 17 percent of nodes, Rahtan 26 percent, Jaquet 9 percent. Mr. Flesh, written by the GM, scores zero. The seed lines each carry one epigram, which is right; the error was promoting it from a rare punch to the default sentence shape. Second tell, contractions: Rahtan used none at all, McHallan 13 percent, against Mr. Flesh at 38 and Father Xen at 15. Third tell, uniform node length: the draft trees sat at a 37 to 41 word median with a narrow spread, so every answer came out the same size regardless of the question, where Mr. Flesh runs from one word to ninety six. After the rewrite: McHallan antithesis 13 percent, contractions 74 percent, length 1/31/55. Rahtan antithesis 13 percent, contractions 83 percent, length 11/42/63.

McHALLAN ALREADY HAD A VOICE IN THIS FILE. Her COLD OPEN script reads "You're late. Doesn't matter, it's slow today" and "I don't lose couriers over cargo." Clipped, contracted, plain. The final tree is checked line by line against that script rather than written from scratch.

REGISTER. McHallan is an officer on a bad posting: fragments, contractions, requisitions New Anchor has been sitting on, two ice moon transfers she signed herself, a predecessor who lasted eleven months. She refuses questions rather than philosophising about why she cannot answer them. Rahtan is a merchant priest with a guest in the room: long winded, asks questions back, offers the player a plate, cites the third book of the Reckoning instead of minting his own proverbs, digresses about vintages. He keeps exactly one aphorism, at the end of the wine thread. Jaquet was written last and needed no pass; he digresses, corrects himself mid thought, uses filler, never summarises his own point and never lands a mic drop, which is the standard the other two were measured against.

CROSS REFERENCES ARE DELIBERATE. McHallan files a complaint about Jaquet every quarter and waves at him in the corridor; Jaquet says three parties who agree on nothing all agree on Jaquet. Jaquet claims the Coalition manufactures the Syndicate on schedule and in writing, and McHallan never contradicts it. Rahtan goes exactly as far as capital that has never asked for a vote and stops, which is the closest a factor can stand to Mr. Flesh's own admission that he sponsors the Guild without confirming it. Jaquet knows a unit sits at the base of his neck and was told it is medical, which leaves the proprietor's account of the implant true and Jaquet neither ignorant nor informed.

NEW CANON INTRODUCED, PENDING GM RATIFICATION. Nine Coalition council seats. Jaquet aboard eleven years. Rahtan forty years in the seat. McHallan's predecessor lasted eleven months. The Guild worships the Balance and reads the Reckoning, kept deliberately distinct from Void's Abraxas so the two religions are not the same religion twice. Guild chapter members can enter through debt tenure. The Limbosis firing corridor maintained to specification for sixty years and never test fired. McHallan's account of how corporate wars begin: nobody declares one, somebody misses a payment, somebody seizes cargo to cover the hole, an escort fires on the seizure.

DATA ONLY. codec.js is untouched.

VALIDATED. A tree walker resolved every `next` and both destinations of every `branch` node across all five reps: 184 options, 0 dangling references, 0 unreachable nodes, 0 nodes with zero options. `node --check` clean. `tools/lore-check.mjs` 38 passed, 0 failed. Zero em dashes in the file.

KNOWN GAPS. Codec text has no `zh` path, the same as the two trees already shipped, so this is an English only surface. The Jade Circuit does not appear in Rahtan's lanes, which is the obvious next Guild topic once the Jade faction copy is settled. Layer 3 is still a stub: `quest_accept` fires and nothing tracks, which is the gate on unparking COLD OPEN, CREDIT CHECK and BEAR RAID.

PROCESS NOTE. Before writing dialogue for any rep, read that rep's existing lines in the same file first. Voice drift is invisible to `node --check`, to the tree walker and to `lore-check.mjs`.

---

## v1.3.7.4 (2026-08-04) - _godTok is not defined (CLIENT)

Client only. No restart. Hard refresh required.

REPORTED FROM THE CONSOLE: `Uncaught ReferenceError: _godTok is not defined` at `window.godPatreonHolders` and `window.godPatreonAudit`. Every Patreon button in the dev panel failed on click.

THE 1.3.7.3 CODE WAS APPENDED TO THE END OF THE FILE. god-panel.js is a single IIFE opening at line 2 and closing at line 856. `_godTok` is declared at line 803, INSIDE it. The new functions landed at 858 and after, OUTSIDE it. An inner declaration is not visible to an outer reference, so the token helper resolved to nothing the moment a button was pressed.

`node --check` PASSES ON THIS. It is a scope error, not a syntax error, and the file parses perfectly. Nothing in the build validates identifier resolution, so the only thing that catches this class is either clicking the button or a scope checker. This is the second time this pattern has shipped, after the comZ regression in 1.6.2.1, which is what `tools/scopecheck.py` was written for and which was not run.

FIX: the block moved inside the IIFE, where every other god function already lives and where `window.godX = ...` assignments still export correctly.

RUNNING scopecheck.py THEN FOUND THE SAME SHAPE IN galaxy.js. The 1.3.7.2 warehouse helpers had been appended after the last IIFE closed, and `renderWarehousePanel()` is called from inside one at line 2644. That one was a FALSE POSITIVE: a top level function declaration hoists into global scope and an inner reference resolves outward, confirmed with a direct repro of both shapes. The asymmetry is the whole point: outer declaration with inner reference works, inner declaration with outer reference does not, and only the second was ever broken.

The helpers were moved inside the calling IIFE regardless. A checker that reports a known-benign hit on every run trains you to skip its output, which is exactly how the real one would be missed next time.

THE FIRST RELOCATION ATTEMPT WAS WRONG AND THE CHECKER CAUGHT IT. It targeted the LAST `})();` in the file rather than the one closing the IIFE that contains the call site, which put the helpers in a sibling IIFE and broke `renderWarehousePanel`, `gToast` and `renderMarketsTab` for real. Re-run reported five cross-scope risks where there had been one. Corrected to select the first top level close after `renderMarketsTab`, then clean: 171 changed lines across 3 IIFEs.

Also removes an em dash that survived into dev panel output.

TESTED, 117 assertions across six suites, 0 failures, clean boot with 0 errors. Server behaviour is unchanged by this patch; the suites confirm nothing regressed.

---

## v1.3.7.3 (2026-08-04) - Patreon membership audit (SERVER)

Server restart required. One column migration. Hard refresh for the dev panel.

THE CODEBASE COULD NOT ASK PATREON ANYTHING. The only credential that existed was `PATREON_WEBHOOK_SECRET`, which verifies inbound webhook signatures. There was no access token and no campaign id, so nothing could query the member list. Every tier in the game rested on webhooks arriving and matching correctly, and there was no way to check whether they had.

WHY A PATRON KEPT THEIR TIER AFTER QUITTING. `members:pledge:delete` resolves a player by `patreon_member_id` first and `patreon_email` second. If the webhook never arrived, or arrived with an email Patreon reports differently from the one the player linked, nothing happened at all. `revokeExpiredPatreon` is the backstop and it already ran HOURLY, not monthly, so cadence was never the problem. The problem is that every `members:update` sets `patreon_expires_at` to now plus 40 days, so a live-but-cancelling member keeps refreshing the buffer and a missed cancellation sits for up to 40 days after the last event.

WHAT THIS ADDS IS VERIFICATION, NOT FREQUENCY. `auditPatreonMemberships` pulls the campaign member list from the Patreon v2 API, paginated, and reconciles it against every account holding a paid tier. Members are keyed by BOTH member id and lowercased email because the webhook path matches on either and the audit has to resolve the same players. Tier is derived through `parseTierFromPatreon` so the audit and the webhook cannot drift on where the tier lines sit.

Outcomes per account: verified and expiry renewed, adjusted to the tier actually entitled, or revoked. An upgrade to tier 3 discovered by the audit still goes through `grantPatreonTier`, so `CEO_MAX` binds the same way it does on a webhook.

THREE STANDING EXEMPTIONS, applied in `revokeExpiredPatreon` as well as the audit so the timer sweep and the reconciliation cannot disagree about who is safe:
- tier 3, because CEO is lifetime and does not lapse with a billing cycle
- `patreon_member_id` beginning `dev_grant_`, which `set_patreon` already writes for GM-issued tiers, so custom grants were self-identifying before this patch and needed no new marker
- `patreon_exempt`, a new column, toggled from the dev panel for anything bespoke

CEO BEING LIFETIME HAS A CONSEQUENCE. `CEO_MAX` is 10. A lifetime CEO holds their slot permanently whether or not they keep paying, so the ten slots are now a finite one-time allocation rather than a rolling one. That is a deliberate choice and worth revisiting if the slots fill with lapsed patrons.

THE CIRCUIT BREAKER IS THE IMPORTANT PART. A campaign id typo, or a token missing the `campaigns.members` scope, returns a perfectly valid 200 with an empty list. Read literally that means nobody is subscribed, and a naive audit would strip every paying account in the game in one pass. So the audit decides in one pass and applies in a second, and refuses to commit when Patreon reports zero members while accounts hold paid tiers, or when a run would revoke more than `PATREON_AUDIT_MAX_REVOKE_FRAC` (default half) of non-exempt tiers. Blocked runs return the full plan so the GM can read it, and an explicit force overrides. Caught in testing that the first version of this condition let `wipe` short-circuit the force check, so the override could never actually fire.

DEV PANEL. Preview, List holders, Commit, and an exempt/un-exempt control by player name. Preview is the default and Commit asks for confirmation, because a run removes tiers from real paying accounts and that should not be one unlabelled click away. The holders list flags whether the API is configured at all, so a silently inert audit is visible rather than assumed working.

TESTED, 117 assertions across six suites, 0 failures, clean boot with 0 errors. The new Patreon suite of 22 runs against a mock Patreon v2 API on a local port via `PATREON_API_BASE`, covering: a patron who quit and is absent from the campaign loses the tier (the motivating case), a `former_patron` still listed loses it, a still-paying patron keeps it, a downgrade adjusts rather than revokes, all three exemption classes survive, dry run touches nothing, the breaker blocks an empty campaign, force overrides it, and a non-admin gets 403. The 1.3.7.0 clearance suites (24 and 15), the 1.3.7.1 mining suite (8) and the 1.3.7.2 warehouse suites (24 and 24) all pass unchanged.

CANNOT BE TESTED HERE: the live Patreon endpoint. The container cannot reach patreon.com and there is no real token, so the request shape, scopes and pagination are written from the v2 API contract and verified only against a mock. First real run must be a Preview.

---

## v1.3.7.2 (2026-08-04) - Warehouses (SERVER)

Server restart required. Schema migration on boot. Hard refresh for the Markets tab.

STORAGE WAS FREE AND UNBOUNDED. `addCargo` just incremented a row. Ship capacity (2,500 / 10,000 / 35,000 / 70,000) is checked only in `/api/cargo/ship`, so it gated how much moved in one run and never gated buying or holding. Holding was therefore not a decision: every real choice sat at buy and at ship, and "should I sit on this" had no cost on either side of it. A player could accumulate a colony's entire supply through many small buys and park it forever at zero carrying cost.

WHAT WAS PROPOSED ALREADY EXISTED. `player_cargo` has been keyed `(player_id, commodity_id, colony_id)` since a migration off a global table, `/api/commodities/sell` clamps to the colony passed in, and `/api/cargo/ship` checks holdings at the origin. Cargo already lived at a specific colony and already had to be shipped to be sold elsewhere. The gap was never storage location. It was that storage cost nothing.

CAPACITY IS DENOMINATED IN F, NOT CRATES. Per unit pricing charged the same to shelve frayed wiring (basePrice 210) as nano filament (4100) while the position is twenty times the value, which is backwards: the storage problem is the value at risk. New `store_unit_val` on `player_cargo`, blended on merge exactly the way `avg_cost` is so a partial sale releases shelf at the blend without per lot bookkeeping. Backfilled from `avg_cost`.

THE VALUATION LOCKS AT ENTRY AND IS NEVER MARKED TO MARKET. A price crash must not silently free shelf, and a spike must not blow a lease a player set in good faith. Shipments lock theirs AT SHIP TIME off the destination's price, persisted on `cargo_shipments.store_unit_val`, for two reasons: origin cost would let a player buy cheap on a poor colony and shelve it on a rich one at the cheap valuation, which is an arbitrage on rent; and locking it means the berth reserved is exactly the berth consumed on arrival, so price drift in flight can never overflow the destination shed.

RENT IS DAILY, NOT PER TICK. `tickCommodityPrices` reverts 0.25 toward target every 5 minutes, so a dislocation half lives in roughly 12 minutes and no amount of waiting beats reversion. The only durable reason to hold is a change in the TARGET, and `commodityTargetPrice` moves on faction control, tension and civic demand, which run over hours and days. Charging per tick would have taxed ordinary buy-ship-sell flow while barely touching the behaviour being priced. 0.8% of capacity per day puts a week of holding at about 5.6% of position value against roughly 30 to 60% for correctly calling a control flip, which makes holding a bet with a price rather than a free option.

RENT IS PRICED BY COLONY CONTROL, which until now drove exactly one thing. Syndicate 0.70 and contested 0.75 are cheap and unbonded; Coalition 1.30 and Guild 1.15 are dear and safe. Tension adds up to 35%. Cheap-goods colonies now carry a real downside and a control flip is something an inventory holder has to react to.

RESERVATION HAPPENS AT SHIP TIME. `/api/cargo/ship` escrows units out of the origin with `removeCargo`, so a capacity check at DELIVERY would have no state to fall back on and a full destination shed would orphan the cargo. Booking the berth up front turns that into a clean rejection before launch. Released on delivery and on interception alike.

ARREARS FOLLOW THE MARGIN CALL MODEL rather than inventing a second one. Unpayable rent rolls into arrears instead of pushing cash negative, because nothing else in this codebase handles a negative balance. A call opens at two days owed with 36h grace. The sweep runs every 60s for every open call whether or not the player is connected and re-reads live state at the deadline, so anyone who paid or sold down in time is never touched. Settlement takes cash first, then sells stock at that colony's price, DEAREST FIRST so the fewest units go, priced through `nudgeAndBroadcast` so a forced sale eats its own slippage. Overshoot is refunded: the player loses price control, not value.

CONTAINMENT IS THE POINT. A shed in arrears settles from its own stock at its own colony. It never reaches cash held for anything else, another colony's shed, equities, or fund stake, the same way `settleMarginCall` never touches fund stake. That is what makes this lease enforcement rather than confiscation.

THREE EXPLOITS FOUND IN TESTING, ALL BY WRITING THE ADVERSARIAL CASE FIRST.

THE DODGE. The first design deleted the shed when settlement found no cash and no stock, on the reasoning that a debt should not follow a player around. That was wrong. A player could let arrears build, sell the stock VOLUNTARILY at a price of their choosing, move the proceeds into equities before the deadline, and settlement would find nothing to take and tear up the lease along with the debt. Free storage on a loop, arbitrage profit kept. The lease is now cut to its reserved berth with the arrears intact, and the colony is closed for 30 days.

THE UNIT MISMATCH. One patch script hit an assertion and aborted before writing, and the set route never received its F conversion, so the slider floor compared a F CAPACITY AGAINST A UNIT COUNT. A player holding F366,630 of goods in 1,100 units could have shrunk their lease to F1,100 and paid 0.3% of the rent owed: the entire meter defeated by a unit mismatch. The pre-existing "cannot shrink below stored" assertion passed the whole time because units happened to exceed the value under test, which is the failure mode of an assertion that is true and proves nothing.

THE UNLIFTED LOCKOUT. The settlement comment claimed a player could buy their way out early. Nothing ever cleared `locked_until`, so paying cleared the debt and left the 30 day bar standing. Settling in full now lifts it immediately; an expired lockout writes off whatever residual debt it carried.

CLIENT. Warehouse panel in the Markets tab: per shed usage bars, capacity, daily rent, arrears and lockout countdowns, a live rent quote as the slider moves, and PAY. Buy and ship failures now surface the server's written message instead of a raw error code.

TESTED, 95 assertions across five suites, 0 failures, clean boot with 0 errors. The 1.3.7.0 clearance suites (24 and 15) and the 1.3.7.1 mining suite (8) still pass unchanged. New warehouse suites of 24 and 24 cover F cap creep through many small buys, per commodity cap splitting, the unit count floor bypass, shrinking under stored or in flight value, buying into reserved shelf, negative payments and capacities, leasing on another player's behalf, unauthenticated calls, containment against other colonies and equities, the sell out dodge, and lockout expiry.

---

## v1.3.7.1 (2026-08-04) - The mining budget was per message (SERVER)

Server restart required. No schema change beyond 1.3.7.0.

THIS STARTED AS A TUNING QUESTION AND TURNED UP TWO BUGS. The 1.3.7.0 notes flagged `MINING_MAX_YIELD_PER_SEC` at 5000 as a number that needed checking against real yields. Reading the mining code to set it properly found that the cargo drone path was broken in two separate ways.

CARGO DRONES DO NOT ADD CAPACITY. They ferry value already in the hold: `state.cargoValue -= takeVal` and the drone carries it to the mothership. `CARGO_DRONE_CAP` of 300 is value per ferry trip, not extra storage. So the honest ceiling on a run is a RATE, not a hold size, which is the right shape for the existing per-second bound.

BUG ONE, DOUBLE CREDIT. On docking, the drone ran `state.runBanked += cd.carryingValue` AND sent `bank_delta` with that same value. The server credited it there. Then at end of run, `fmBridgeSend('bank_delta', { delta: state.runBanked })` sent a total that still contained it. Every cargo drone haul was paid twice. `dockDrone()` does it correctly by comparison: it only accumulates to `runBanked` and lets the end of run settlement send once. Ferried value now goes to `state.runFerried` for the summary and straight to `state.bank` for the display, and never rides in `runBanked`.

BUG TWO, THE BUDGET WAS PER MESSAGE. The handler called `_miningRuns.delete(actor.id)` on the first positive delta. Cargo drones bank MID RUN and there can be many. So the first ferry closed the run, and every subsequent message found no open run, fell through to the `MINING_RUN_FALLBACK_SEC` branch, and was handed a fresh full cap. The real ceiling was never 450k per run, it was 450k times however many bank messages a client chose to send. Unbounded in count.

The budget is now cumulative: the window carries `banked`, each credit subtracts from the run's total allowance, and only the end of run settlement closes it. Measured: five forged claims of 1,000,000 each now credit 897 in total, against roughly 2.25M before.

THE CEILING WAS 31x THE PHYSICALLY IMPOSSIBLE MAXIMUM. Derived rather than picked this time. `LASER_MINE_RATE` is 1.6 per frame against a threshold of 100, the best hull in `MINING_SHIP_CATALOG` has `drillMul` 1.75, and each drill completion yields ONE unit, so 100/2.8 = 35.7 frames, about 0.60s per unit at 60fps. The richest mineral is musgravite at 250. Heat is the real governor: firing adds 0.9 per frame and cooling removes 0.55, so sustained duty is 38%. That is roughly 160 F/sec, and only if every rock in the field is musgravite with zero travel, zero scanning and perfect aim, which the flat 30% depleted rate makes impossible.

`MINING_MAX_YIELD_PER_SEC` 5000 to 400, which leaves 2.5x headroom over a ceiling no honest run can reach. `MINING_MAX_RUN_BANK` 10,000,000 to 500,000. A forged orphan claim drops from 450,000 to 36,000.

NEAR CAP CLAIMS NOW LOG. The old admin signal only fired ABOVE the cap, so a forgery tuned to sit just under the ceiling was completely silent. Anything over 75% of the remaining budget now raises `mining_near_cap` alongside the existing `mining_clamped`.

WHY THIS MATTERS MORE AFTER 1.3.7.0. `recordNetWorth` is called inside the mining handler, so banked mining raises `peak_net_worth`. Forged mining was therefore the cheapest available way to MANUFACTURE Guild Clearance, and clearance made the vector more attractive than it was before. This does not close client authority over mining, which still needs the server to derive yield rather than bound it, and remains the top item on the backlog.

CLEARANCE PROMPT REWORDED. The zero clearance line pointed new players at Capital Houses, which they will not touch for a long time. Now reads "Trade, gamble, mine, complete tests." on both the client readout and the server denial.

TESTED, 47 assertions across three suites, 0 failures, on a clean boot with zero errors. The 1.3.7.0 clearance suites still pass unchanged (24 and 15). New mining suite of 8: the loadout deduction opens a run, five forged ferry claims share one budget instead of each getting a fresh cap, the end of run claim is bounded by what the run has left, an orphan claim is capped at the new fallback, and an honest 900 yield is credited in full and never clamped. VERIFIED NON-VACUOUS by mutation: re-running with `MINING_MAX_YIELD_PER_SEC=5000` fires four assertions and the orphan claim credits exactly 450,000.

---

## v1.3.7.0 (2026-08-04) - Guild Clearance (SERVER)

Server restart required. Schema migration runs on boot.

THE PROBLEM WAS NEVER ALT ACCOUNTS. Every new account is handed a 1000 seed advance and `/api/register` takes a name and a four character password with no email, no captcha and no throttle of any kind: `ratelimit.js` is websocket only and `express-rate-limit` is not a dependency. Nothing stopped that advance from being wired straight back out. At the 2% transfer tax that is exactly 980 per registration, and the whole loop is a twenty line script against an unthrottled endpoint. Not theoretical.

IP LIMITING WAS CONSIDERED AND REJECTED AS A GATE. Mobile carriers put thousands of users behind one CGNAT address, households and offices share an address, and a farmer buys a proxy pool for pennies or toggles airplane mode. High false positive rate against real players, near zero true block rate against the one person motivated enough to script it. IP is a signal, not a gate.

AN ACCOUNT AGE TIMER WAS ALSO REJECTED. Registration is free and instant, so a 30 day lock is a delay and not a cost: script 500 accounts tonight, harvest on day 31. A delay only defends if somebody is watching the window, and nothing was logged.

THE GATE IS PROVENANCE. An account may only move value it has demonstrably created.

    allowance = peak_net_worth - seed_grant - lifetime_received
    remaining = allowance - lifetime_sent

A fresh account has peak 1000, grant 1000, received 0. Allowance zero, forever. No timer to outwait, so pre-registering a farm buys nothing. A player who turned the seed into 200k has 199k of clearance on their first afternoon and will never see the ceiling. Farming an alt now requires playing the alt until it has earnings, at which point it is not an exploit, it is labour.

SUBTRACTING lifetime_received IS WHAT KILLS LAUNDERING CHAINS. Value that arrives from another player raises peak net worth and is subtracted straight back out, so it cannot be forwarded on to mint clearance downstream. A -> B -> C terminates at B.

GATING ONLY THE WIRE WOULD HAVE BEEN DECORATIVE. Three other routes moved cash between players and two of them were strictly better than the wire.

- `tcgBuyCard` and `buyMarketItem` both debit the buyer and credit the seller at full price. No fee, no cooldown, no age check, price ceilings of 1e15 and 999,999,999. A main lists a junk common for 980, the alt buys it, and 980 moves at 100% efficiency against the wire's 98%, with no 12 hour cooldown and no per account limit. Ƒbay was a better wire than the wire.
- Fund deposits reach a pool that `fundWithdrawFn` lets an owner or treasurer draw against FUND CASH, not against the withdrawer's own stake (model B, deliberate and unchanged). Deposit is therefore a send. No owner exemption: an alt that owns its own house and appoints the main as treasurer is the same route wearing a hat.

fund_out IS TRACKED SEPARATELY AND DELIBERATELY NOT SUBTRACTED FROM THE ALLOWANCE. Peak net worth already includes fund stake, so a deposit is not a loss of value. fund_out exists only so a withdrawal can tell return of own capital apart from a drain of other members' deposits; the excess is what books as received. Without this, a whale round tripping their own money through their own house would burn allowance permanently.

THE PEAK IS MONOTONE AND RIDES ON THE EXISTING HISTORY WRITE. `recordNetWorthFn` raises `peak_net_worth` in the same transaction, so all eleven existing `recordNetWorth` call sites maintain it untouched. A drawdown never destroys earned clearance. Live net worth is re-maxed against the stored peak at check time and the raise persisted, so a player who earned through a route that never writes history is not penalised.

BACKFILL. One time, guarded by a `clearance_meta` key: every existing player's peak seeded from `MAX(net_worth)` in `net_worth_history`, floored at current cash. Nobody established wakes up locked out. Past transfers are amnestied because there is no record to reconstruct them from, which is the second reason this shipped.

value_flow_log IS THE TRAIL THAT DID NOT EXIST. Every player to player movement, whatever the route, with both counterparties and a kind. Before this, a farm could not be sized, attributed or unwound after the fact. Four admin endpoints read it: per player clearance and flow history, recent flows, a farm signature report (one receiver, several senders who were young at the moment they sent, a shape legitimate play does not produce), and a two way manual exemption. Reporting only. Nothing acts automatically on a heuristic, because that is how you ban a household.

WIRE COOLDOWN WAS SILENTLY NON FUNCTIONAL. It lived in `global._lastWire`, a plain in memory Map, so every PM2 restart handed everyone a fresh wire. Moved to `last_wire_at` on the players row and max'd against the in memory value so a running process does not forget one mid flight. Independent of the alt question and broken since it was written.

KNOWN COSTS, ACCEPTED. Gifted credits are spendable but not forwardable: a player who receives 100k can trade, gamble, mine and spend at NPC sinks, but cannot buy on Ƒbay or deposit into a house until they have earned clearance of their own. Card and item sales mint no allowance, since proceeds raise peak and received by the same amount, which is also what stops wash trading. `clearance_exempt` per player and `CLEARANCE_ENABLED=0` globally are the escape hatches.

CLIENT. The wire panel shows the clearance figure and its derivation before the button is pressed, and the button pre-checks it. Item market and fund deposit surface the server's message instead of a raw error code.

TESTED AGAINST A LIVE SERVER, 39 assertions across two suites: the seed advance cannot leave a fresh account, an earned account wires normally, gifted value cannot be forwarded, all four routes reject and none of them record a ledger entry when they do, own capital round trips through a house book nothing, a drain books the excess as received, the peak survives a wipeout, the cooldown persists, and the farm report fires on a synthetic farm. Route ordering bug caught in test: `/api/admin/clearance/farms` was being swallowed by `/:name`.

---

## v1.3.6.2 (2026-08-02) - The drawer painted under the scrim (CLIENT)

Client only. No restart. Hard refresh required.

REPORTED BY SCREENSHOT: "pops but no button works." The drawer renders. Every row in it is dimmed to exactly the same degree as the grid behind it, while the close button and the menu button are not. That is the tell. It is under the scrim.

THE DRAWER IS z-index 9995. THE SCRIM IS 9994. THOSE TWO NUMBERS WERE NEVER COMPARED.

`#fmTop`, `#fmNav`, `#fmScrim` and `#fmDrawerClose` are all created with `body.appendChild`, so they sit in the root stacking context. The drawer does not. It is `#fm-header-user`, which lives at `.wrap > .row:first-child > .row > span`, and `body.fm-mobile .wrap` is `position: fixed`. A fixed position element always creates a stacking context, with or without a z-index. So 9995 was resolved inside `.wrap`, and what actually competed with the scrim was `.wrap` itself at z-index auto, which loses to 9994. The entire subtree painted underneath the scrim, and the scrim ate every tap in it.

This was true before 1.3.6.1 as well. It was invisible then because the drawer was also `display:none` and generated no box at all. Fixing the first bug exposed the second.

THE FIX RETIRES THE PREVIOUS ONE. mobile.js hoists `#fm-header-user` to `body` on enter and restores it to its original parent and next sibling on leave. That puts it in the same stacking context as the rest of the chrome, where every existing z-index in this file finally means what it says, and it makes the ancestor `display:none` irrelevant. So the zero height chain added in 1.3.6.1 is gone and the header row is plain `display:none` again.

MOVING THE NODE IS NOT WHAT DESIGN RULE 1 FORBIDS. That rule exists so the drawer's listeners, ids and data-i18n attributes survive; `appendChild` relocates the same node and preserves all three. Rebuilding it is what would break them.

WHY NEITHER CHECK SUITE CAUGHT THIS. A stacking context is not a property of any one rule, it is a consequence of `.wrap` being fixed and the drawer being nested. No grep over CSS can compute it and jsdom does not lay out. The 1.3.6.1 assertions were true and useless: they confirmed the drawer was rendered, which was never the question.

client/mobile-mockup.html now hit tests it. With the drawer open it calls `document.elementFromPoint` at the drawer's centre and reports `tappable` or `BLOCKED` along with whatever is actually on top. Asking the browser what is on top is the only thing that settles this, and it is the assertion the static suite structurally cannot make. It also reports whether the drawer is hoisted.

The static suite still covers what it can: the hoist exists, is wired into enter and leave, records the next sibling as well as the parent, is idempotent, and the four other chrome elements are still body children. Plus two anchors on the facts the reasoning rests on: the drawer is still nested in the markup, and `.wrap` is still `position: fixed`. 71 assertions. Verified non-vacuous by mutation.

---

## v1.3.6.1 (2026-08-02) - The drawer never rendered (CLIENT)

Client only. No restart. Hard refresh required.

REPORTED BY SCREENSHOT: the menu opens, the scrim dims the screen, the close button appears, and there is no menu.

`#fm-header-user` is not a top level element. It sits at:

    .wrap > .row:first-child > .row > span#fm-header-user

and `body.fm-mobile .wrap > .row:first-child` was `display:none !important`. A `position:fixed` descendant of a `display:none` ancestor generates no box. display:none removes the entire subtree from the box tree and nothing a descendant declares can bring it back, not `position:fixed`, not `!important`, not a z-index of 9995. So the 238px width, the `translateX(100%)` to `translateX(0)` slide, the border, the overflow scroll and every child rule in that block were applied to boxes that were never generated.

This has been true since the shell shipped in 1.3.0. The file's own design rule reads "the drawer is #fm-header-user repositioned by CSS, not relocated, so all of its listeners, ids and data-i18n attributes survive untouched", and that is a good rule, but it was never checked against the one thing that makes repositioning impossible.

IT IS ALSO THE FIRST CAUSE OF THE FREEZE. 1.3.6 closed four gaps around the drawer: a scrim that could not be tapped on iOS, a menu button that opened but never toggled, that button being buried under the scrim, and no close control. Those four are what made the state unrecoverable. This is what made it empty. Both were needed to produce "tap the menu and the game is gone".

THE FIX. The chain stays in the box tree at zero height, and the row's other contents are hidden instead. `#name` and `#helloBtn` are already inline `display:none`, so the only sibling group that needed hiding is the wordmark and EOD block. `mirror()` still reads `#eod-timer.textContent`, which `display:none` does not affect, so the top bar clock is unchanged.

`#fm-header-user` also now carries `display:flex !important` on mobile. index.html ships it as inline `display:none` and funds.js sets it to flex on the auth event; on mobile it IS the drawer, so it has to exist whether or not that event has landed. A guest still needs Bugs, Jade, Tutorial and Discord.

WHY THE 1.3.6 CHECK DID NOT CATCH IT. It asserted the drawer rules were present and correctly shaped. They were. It never asserted that the element those rules target can render, because that is a computed style question and the suite is static. Six new assertions cover the shape of the chain and the DOM position it depends on, which is the part that silently rots. Verified non-vacuous: restoring the exact 1.3.6 rule fires five of them. 61 assertions total.

client/mobile-mockup.html now ships `#fm-header-user` as inline `display:none`, matching production, so the harness exercises the override rather than papering over it. The harness reproduced this defect faithfully and would have shown it on first open. It was not opened before shipping 1.3.6.

---

## v1.3.6 (2026-08-02) - Mobile: drawer lockup, touch incompatible systems, casino widths (CLIENT)

Client only. No restart. Hard refresh required.

THE DRAWER COULD LOCK THE CLIENT, AND IT TOOK FOUR THINGS TO DO IT.

`#fmScrim` was a bare `div` with a `click` listener. iOS Safari only synthesizes a click on a non-interactive element when it has decided the element is clickable, and one of the signals it uses is `cursor:pointer`. The `pointer:coarse` block at the top of mobile.css sets `cursor:auto !important` on every element on the page, which strips that signal. So on iPhone the scrim could swallow every tap and never close.

That alone would have been survivable if anything else could have closed it. Nothing could. `.fmt-menu` called `drawer(true)` unconditionally rather than toggling, so tapping the button again was a no-op. The scrim is z-index 9994 and `#fmTop` is 9992, so the button was underneath it and unreachable regardless. And the drawer had no close control at all. Four independent gaps, all pointing the same way: tap the menu, and the game is gone until you reload.

Every one of the four is closed. The scrim binds `pointerdown` and `touchstart` alongside `click`, debounced 400ms, and carries `role="button"`. The menu button toggles. The top bar is lifted to 9996 while the drawer is open, with the rest of the bar made inert so a stray tap cannot fire the portrait picker underneath an open menu. A `#fmDrawerClose` control was added, and Escape and `popstate` both dismiss.

AND A SECOND THING WITH THE SAME SYMPTOM. The drawer's Bugs button runs `document.getElementById('bugsTabBtnHidden').click()`, which is a real `.tab` node. core.js switches the center panel and mobile.js never hears about it, because `bridgeShowTab` only patches `window.showTab`. If the current view was not a center panel view then `#fmCenter` still carried `.fm-off`, so the player tapped Bugs, the drawer closed, and the screen did not change. Fixed at the root with `bridgeTabClicks`, a capture phase listener that resyncs the shell after any `.tab` click the shell did not initiate, so anything added later is covered too.

SYSTEMS THAT CANNOT BE PLAYED ON A TOUCH DEVICE. Drone Mining is mouse aimed and keyboard flown and there is no touch control scheme for it. It is now reddened in the More grid with a DESKTOP ONLY tag, and LAUNCH EXPEDITION is disabled behind a notice pinned directly above it. The tab is still reachable on purpose: the brief screen carries the bank balance and the leaderboard, and those are worth reading on a phone. The gate is `(pointer: coarse)` and not `(any-pointer: fine)`, not screen width, so a 1024px tablet is locked and a narrow desktop window is not. It is driven by a `LOCKED` table, so adding a system is one line.

CASINO WIDTHS. The v1.3.4 audit set `#casinoContent{overflow-x:auto}` as a net and said in its own comment that it did not reflow anything. That is why the games still read as too wide. Four surfaces actually fixed:

- `#wheelCanvas` is `width="400" height="400"` with no CSS width, so roulette had a 400px floor before padding, on the pane that opens by default. Capped at 300px. The wheel is drawn into the backing store and is display only, so scaling the box costs nothing.
- `.rl-num-cell` was a hard 22px across 13 `1fr` tracks, 310px inside a table already spending 32px on padding. The hard width was the only thing stopping it reflowing.
- `#chessBoard` (360px, squares absolutely positioned at `x*45` in JS), `.sol-board` (`repeat(7,minmax(56px,1fr))`, 440px floor) and `#ms-board` (JS writes `repeat(cols,28px)`, Expert is 898px) are laid out in pixels that are load bearing. Overriding those widths in CSS breaks hit testing or tears the solitaire sprite sheet, whose `background-position` is computed from card width. So the boards are SCALED, not reflowed. All three use real child elements with their own listeners, or `elementFromPoint` in the solitaire drag case, and browsers map pointer coordinates through transforms for both. `transform` alone does not shrink the layout box, so negative margins pull the box in to match, which is what actually kills the overflow.

Minesweeper stops scaling at 0.58, because below that a cell is under 17px and no thumb can hit one; past the floor `#ms-wrap` scrolls. Expert on a phone remains thumb hostile and is a candidate for the `LOCKED` table.

tools/mobile-136-check.mjs NEW, 52 assertions. Half of them are FIX assertions. The other half are ANCHORS, and those are the point of the file: `fitBoard` scales using hardcoded natural widths because none of the three boards can be measured from CSS, so the check asserts `const S = 45`, `minmax(56px,1fr)`, `gap:8px`, `28px`, `cols:30` and `width="400"`. Change any of those and the scale goes silently wrong with nothing throwing. Now it fails instead. Verified non-vacuous by mutation: reverting the menu toggle, moving chess S to 44 and lifting the wheel cap produced exactly three failures.

client/mobile-mockup.html NEW. A skeleton that satisfies everything mobile.js reaches for and loads the real mobile.css and mobile.js, with the three boards stubbed at their exact natural sizes. Verifies the shell on a phone with no server, socket or login, and reads out viewport, touchOnly, view state, page overflow and the live scale factor for each board. Safe to delete before a public release.

NEW I18N KEYS, ENGLISH ONLY: `mob.lock.tag`, `mob.lock.mining`, `mob.lock.miningLong`. These will render English in Jade mode until zh entries are added.

---

## v1.3.5 (2026-08-02) - Guild Numeracy Exams; two payout holes closed (SERVER + CLIENT)

Server and client. Restart required. Hard refresh required.

THE REPORTED BUG WAS NOT ONE BUG. Players said the math quiz was not paying out. Five things were wrong, and the one causing the reports is the second least interesting.

The client opened a server round at Start and closed it at Test Complete. Any refresh, dropped socket or tab-away mid-test left that round `open`. `casino_bet` refuses a second open round for the same game. The client handled that with `.then(r=>{ if(r&&r.ok) mqRoundId=r.roundId })` and no else branch, so `mqRoundId` stayed null, the player answered all ten questions, the score row counted up to "Earned: 800", and `endTest` ran `if(mqRoundId)` and sent nothing. Nothing on screen was wrong. The number was just never real. It stayed that way until the fifteen minute sweep, so every test started in that window paid zero.

The other four: error acks from `casino_result` carried no roundId, so `casino-net.js` could never correlate them and every failed settle in EVERY casino game resolved as a twelve second timeout instead of its actual reason; the math client discarded the settle promise entirely so no failure could ever surface; the nominal 1 stake locked out any player at zero cash, which is exactly the player grinding a quiz for money, silently; and a backgrounded tab throttles setInterval to about 1/s, stretching a test past its round timeout so the sweep expired it mid-play.

AND THE ONE NOBODY REPORTED. The payout was client-declared. `CasinoNet.result(roundId, totalEarned+1)`, capped at flat 900, gated by `minDurMs:5000`, with the cooldown in localStorage. A console one-liner was worth 900 every five seconds, about 648k an hour against a starting balance of 1000, with no arithmetic involved. That is a larger faucet than the drone mining hole.

WHAT REPLACED IT. `server/mathtest.js` generates the paper, holds the answer key, times each question on the server clock, grades every submission and settles the round itself. `publicQuestion` is the only path a question takes to the wire and it strips `answer` and `tol`. The client renders and posts answers; it declares nothing that costs money. Same shape as solitaire.

Ten topics (arithmetic, order of operations, powers and roots, percentages, fractions, algebra, sequences, ratios and rates, interest, trade problems) across five tiers. Five papers: Numeracy Drill (free, topic-selectable, four minute cooldown), Ledger Clerk Paper (150), Speed Reckoning (250, nine second clocks, streak bonuses), Broker Certification (700), Quant Board Exam (2500, gated on a passing Broker result). One CASINO_CFG entry per paper, generated from the exam table, so cooldowns, caps and the gate are per paper and a retune moves the cap with it.

THE PAYOUT MODEL IS NOW A WAGER, NOT A FAUCET. Earnings accrue visibly per correct answer, then multiply by the grade band at settlement. Below 60 percent the multiplier is zero and the entry fee is gone. Break even sits between 65 and 75 percent on every paid paper. Cooldown and the certification gate both derive from the existing `casino_rounds` ledger, so there is no migration and nothing to keep in sync.

A REFRESH NO LONGER COSTS THE ENTRY FEE. The lobby reports any open paper and offers a resume. The question that was live when the connection went is scored WRONG and the paper moves on. Re-issuing it with a fresh clock would make refresh a free re-roll on anything hard, which is a worse bug than the one it fixes. One question is the price of the interruption.

THE WORST FIND, AND IT PREDATES THIS PATCH BY A LONG WAY. `casino_result` looked a round up by id and player and then paid whatever the client asked for, capped at that game's flat. It never checked WHICH game opened the round. So any round opened by a server-authoritative handler could be settled through the client-declared path instead, skipping the code that was supposed to decide the payout. `solitaire_start` followed by `casino_result{payout:999999}` paid 1848 against a 250 buy-in without a card being moved, and solitaire's minDurMs is 0 so there was nothing throttling the loop. That has been live since solitaire shipped. The exams would have inherited it on day one, which is the only reason it was found. `SERVER_SETTLED_GAMES` now names solitaire and all five papers, and both `casino_result` and `casino_bet_addon` refuse them (addon grows the wager, which grows the cap, so it is the same lever).

FOUND BY PLAYING IT, NOT BY READING IT. Every static check passed while that hole was open, and they were right to: each individual handler is correct. The hole is only visible if you ask what ELSE can reach a round after one of them opens it, and that question has no answer in a file. A live socket run against a booted server found it in the first pass.

THE CAP FALLBACK WAS WRONG IN FOUR PLACES. `(cfg.mult||1)` reads 1 for every game declaring 0, because 0 is falsy, so sudoku, minesweeper, solitaire and the exams all had a cap of wager plus flat rather than flat. Harmless while the honest maximum sat under the cap, but a backstop that is not the number you wrote is not a backstop. Two were fixed by reading the file, a third (casino_play) was found by asserting the COUNT of guarded sites rather than the absence of the old pattern, and the fourth was the new exam settle. The check asserts four.

THREE BUGS THE CHECK SUITE FOUND IN THIS PATCH'S OWN CODE:
1. `maxGross` computed the cap from the unrounded product while `buildPaper` rounds each reward, and rounding up is the common case. Drill: cap 136, flawless paper 140. It would have clamped the best player in the game and logged them to the admin panel as a cheater.
2. Topic resolution tested `TOPIC_IDS.has('mixed')`, which is false, so every "mixed" drill fell through to arithmetic only. That reads as a run of bad luck, not a bug, which is the worst way for it to fail.
3. Compound interest carried a tolerance of 1.2 on an answer specified to the nearest 1, so an answer wrong by exactly 1 was paid.

LOCALIZATION. The old five difficulty labels and single payout line are gone with the game that used them. Word problems ship a template key plus its vars alongside the rendered English, so a Jade player reads the question rather than whatever the generator happened to emit; symbol-only questions ship text alone because there is nothing in them to translate. Ten topic names, sixteen question templates, forty five UI strings, all with zh. The casino subtab is now Numeracy Exams. i18n-check: 0 missing keys, 0 missing zh, 0 unsupplied tokens.

`tools/mathtest-check.mjs` is new: 77 assertions over seven groups (PAPER, KEY, CURVE, CAP, WIRE, SERVER, I18N), including a 41,000 question fuzz that asserts every generated answer is finite, typeable at three decimal places, graded correct by its own tolerance and NOT graded correct one off. Source assertions strip comments first, because a comment describing a bug quotes the exact pattern the grep is looking for. Suite total 508 across ten tools, plus a 37 assertion live socket run that is not shipped because it needs a booted server and a throwaway account.

STILL NOT FIXED, AND SAYING SO PLAINLY: none of this makes the exams bot-resistant. The server is asking a question a computer answers instantly and correctly, and no latency floor separates a script from a fast human without punishing the fast human, so none was added. What server authority buys is that earning requires answering, which pins the maximum drain to entry fee times grade curve times cooldown. Botting is now a number to price rather than an unbounded hole. Making it bot-hard means questions that stop being machine-solvable, which is a different feature.

The economics are a proposal, not a finding. Perfect-play ceilings: drill about 1.7k an hour, quant about 11k. `perQ` in the exam table is the single number to move; the cap and the UI both derive from it.

Changed files: server/mathtest.js (new), server/server.js, server/db.js, client/assets/casino-mathgame.js (rewritten), client/assets/casino-mathgame.css (rewritten), client/assets/core.js, client/index.html, client/version.json, tools/mathtest-check.mjs (new), docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.3.4 (2026-07-30) - Mobile panel audit (CLIENT)

Client only. Hard refresh. No restart needed. CSS only plus one new tool. No change to any panel's own code.

Cities was not a one-off, it was a class, so this pass audited every panel rather than waiting for the next report. `tools/mobile-audit.mjs` is new: it reads inline styles from index.html, every client stylesheet, and the CSS that modules inject as strings, and reports seven hazard classes plus tab reachability. It is static and exits 0. It reports suspects, not verdicts, because there is no layout engine here to measure a rendered box.

WORST FIND, and it was mine. `#sell-modal .card` and `#short-modal .card` declare `min-width:420px`. The 1.3.0 shell set `width:95vw` and `max-width:95vw` on them and did nothing at all, because min-width beats max-width in the cascade. The card stayed 420px on a 360px screen with the confirm button off the right edge, and the page cannot scroll sideways. Selling and covering a short are core actions and they were unreachable from a phone for four patches. Now `min-width:0`.

The same trap on `#fm-auth-card`, which declares `min-width:340px` and overflows a 320px device. That is the login screen, the first thing anyone sees.

THE CITIES CLASS IS NOW CLOSED STRUCTURALLY. Four tab bodies (bugs, fleshbook, galactic, mining) are shown as flex by core.js and carry `flex:1; min-height:0; overflow:hidden`. That pattern needs an ancestor to hand down a definite height, which inside the shell happens only in fill mode, and fill mode is galactic and chat. So fleshbook and bugs are almost certainly fine today. "Almost certainly" is what Cities was before it wasn't, and the invariant is invisible: the bug arms itself the moment a surface is added to fill mode. A non-fill tab body is now declared auto height in CSS, so the class cannot come back panel by panel.

Other fixes: `#sdk-board` released from `width:369px` (its grid is `repeat(9,1fr)` so it scales cleanly); `#casinoContent` gets `overflow-x:auto` as a net so no game is unreachable even where it is still ugly; the lore book stacks instead of splitting, since `#loreLeft` was taking 270px of a 300px book; `#godModeBtn` lifted clear of the nav, where its z-index 9998 was sitting on the More slot.

THREE THINGS THE AUDIT GOT WRONG FIRST, all recorded in the tool: it reported `#pnl-root .row` as a live overflow when that selector exists only in pnl-simple.css and nothing renders it; it reported five casino games as hard pinned because `/width:\d+px/` also matches `max-width:520px`, when only the sudoku board is actually pinned; and it used a 340px phone floor, which is why `#fm-auth-card{min-width:340px}` slipped past for not being greater than 340. The floor is 320. All three are fixed and commented, because a hazard report full of ghosts gets skimmed.

`tools/mobile-check.mjs` 94 to 105. Four of the new assertions guard the upstream declarations each override depends on, so if a file is ever fixed properly the stale override is flagged rather than left to fight the new code. Regression tested by deleting the audit block, which fails seven.

Changed files: client/assets/mobile.css, client/version.json, tools/mobile-audit.mjs (new), tools/mobile-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.3.3 (2026-07-30) - Galaxy > Cities on mobile (CLIENT)

Client only. Hard refresh. No restart needed. CSS only, scoped to `body.fm-mobile`. No change to city.js, index.html or any city logic.

Cities is the only galaxy pane that does not scroll. The other four (Factions, Smuggling, Markets, Contracts) are `overflow-y:auto; flex:1; min-height:0` and survive the shell's fill mode without help. `#gCitiesPane` is `overflow:hidden`, `#citiesTabInner` is `height:100%`, and city.js sizes `.cywrap` at `height:calc(100% - 42px)`. On desktop that is correct: Cities is a fixed height three column layout, rail and map and side, each scrolling itself.

At `max-width:1100px` city.js collapses `.cywrap` to a single column, so those three stack vertically. The height cap and the `overflow:hidden` do not collapse with it. Everything below the district map is clipped and unreachable, and because the overflow is hidden rather than auto there is no scrollbar to say anything is missing.

This is not shell specific. A 1000px desktop window reproduces it. The shell only guarantees it, because a phone is always under the breakpoint.

On mobile the pane now scrolls as one column, `.cywrap` loses the height cap, and the two inner scrollers on `.cyside` and the colony rail are released, because a nested scroll region inside a page scroll cannot be driven with a thumb. The colony rail is the one thing left bounded, at 140px, or it pushes the map off the first screen entirely.

The district map needed its own handling. `#cityCv` is 1180x720 intrinsic and stretched by `canvas{width:100%;height:100%}`. Once `.cywrap` is no longer height constrained, `.cymid` has no definite height, so `.cvwrap{flex:1}` collapses to its 220px minimum and the districts squash. It now carries `aspect-ratio:1180/720` instead. Hit testing already scales per axis so taps were never at risk; this is purely about not distorting the Voronoi. `#cityCv` also gets `touch-action:none`, since it binds one finger pan and pinch zoom on a non-passive touchmove and would otherwise race the pane scroll.

Ten new assertions. Four of them check facts about code the shell does not own: that `#gCitiesPane` still has `overflow:hidden`, that the other four panes still scroll themselves, and that city.js still both collapses and height-caps `.cywrap`. If any of those change, the `!important` overrides here are stale and the suite says so rather than leaving dead CSS behind.

`tools/mobile-check.mjs` 84 to 94. Regression tested by deleting the Cities block, which fails six.

Changed files: client/assets/mobile.css, client/version.json, tools/mobile-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.3.2 (2026-07-30) - Sound toggle hidden (CLIENT)

Client only. Hard refresh. No restart needed.

The sound button sat `position:fixed` in a corner on every screen at every size. `_soundOn` defaults to false in sound.js, so the control's only job was turning ON a feature nobody had asked for, in exchange for a permanent piece of a phone screen.

It is hidden, not removed. One rule in `assets/toast.css`. The markup, `toggleSound()`, `playSound()` and every call site are untouched, `window.toggleSound()` still works from the console, and the mobile placement rule in mobile.css is left in place for whenever it comes back. Deleting the single rule restores it exactly as it was.

Also added, no behaviour change: assertions covering the viewport meta and the two layout primitives the shell rests on. `width=device-width` is the one line that makes a phone map CSS pixels to its real logical width instead of rendering at a faked 980px and zooming out. If it is ever edited, every proportional rule in the shell is measured against the wrong viewport and the whole layout is silently wrong. It now fails loudly instead.

`tools/mobile-check.mjs` 76 to 84. Regression tested by stripping the viewport meta and the hide rule, which fails three.

Changed files: client/assets/toast.css, client/assets/mobile.css (comment only), client/version.json, tools/mobile-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.3.1 (2026-07-30) - drawChart retry loop while hidden (CLIENT)

Client only. Hard refresh. No restart needed. Found while verifying an open question from 1.3.0 rather than reported by a player, and it predates the mobile shell by a long way.

`drawChart()` measured its own canvas and, if the result was under 10px in either axis, called `setTimeout(drawChart, 100)` and returned. The intent was to wait out a layout that had not happened yet. But a canvas inside a `display:none` tab also measures zero, and `_pushWave()` schedules `drawChart` through requestAnimationFrame on every price tick with no check on which tab is open. So with the market tab hidden, every tick arrived at that line and started its own 100ms self rescheduling chain, and not one of them terminated until the chart became visible again.

The chains accumulate for as long as the player is on another tab. Worse, requestAnimationFrame stops firing when the page is backgrounded but setTimeout does not, so every chain already started keeps running with the phone screen off.

This was always true on desktop. It matters more now, because the shell means a phone player is off Market by default and spends most of a session somewhere else.

The retry now happens only when `canvas.offsetParent !== null`, which is false exactly when an ancestor is `display:none`. When the canvas comes back, the existing ResizeObserver redraws it and the next tick redraws it again.

That ResizeObserver was the only thing covering the come-back case, which was the open question left at the end of 1.3.0: the chart canvas is sized in JS from its own clientWidth, so switching views changes the width it should be drawn at. Rather than depend on a single observer firing for a display change, `render()` in the shell now nudges `drawChart` on the next frame when Market or Heat becomes the visible view.

Five new assertions in `tools/mobile-check.mjs`, 71 to 76. Regression tested by restoring the unguarded retry and removing the nudge, which fails three of them including the live one that counts redraws on entering Market.

Changed files: client/assets/core.js, client/assets/mobile.js, client/version.json, tools/mobile-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.3.0 (2026-07-30) - Mobile shell (CLIENT)

Client only. Hard refresh. No restart needed. Desktop layout is byte for byte unchanged; every rule added is scoped to `body.fm-mobile`, which only exists at 900px and under.

The phone layout was three desktop panels stacked into one document scroll with a six button bar underneath. That is the source of the clutter, and of the formatting drift. `html` and `body` were released to `overflow:auto` and `.wrap` to `height:auto`, so every fixed and absolutely positioned child in the client was measuring itself against a viewport that no longer matched its container. Chart canvas, galaxy map, chat log, modals and the god panel all drift under that arrangement, and no amount of per element patching fixes it because the container is the thing that is wrong.

The shell inverts it. `.wrap` is fixed and inset, and `.grid` is the only element in the client that scrolls. Above it sits a 46px top bar carrying portrait, name, cash and the End of Day clock, and below it a 56px nav with five destinations. A 34px context bar appears between them only on views that have segments.

Five destinations. MARKET is the chart and the order ticket. BOARD is Companies, News and Heat, which puts the three read only market surfaces in one place instead of two panels and a top level tab. CHAT is the whole region with the input pinned above the nav, which it has never had; on a game whose social core is chat, a 280px box buried in a long scroll was the worst allocation on the page. WALLET is P&L, Wire and Ranks. MORE is a grid of the remaining twelve destinations, one tap deep.

Casino opens on a lobby grid rather than an eleven item horizontal scroller. Galaxy fills the region and the map opts out of scroll gestures so panning does not fight the page.

THE BUG UNDER THE OLD NAV. There are two independent tab systems in this client. `core.js` binds a click listener to `.tab` that does the real work: lazy loading dev-comms, fleshbook and tcg, calling `loadGuildDirectory`, `drawEquity` and `__devlogsSync`. `market-state.js` separately defines `window.showTab()`, which knows nine of the twelve tab ids and performs none of that. The 1.2.5 bottom nav called `showTab()`. Reaching P&L from a phone therefore never drew the equity line, and Bugs, Fleshbook and Corpo-Cards were not in the nav at all because routing to them through that function does nothing. The shell dispatches a real click on the `.tab` node, which runs both listeners, which is the path a desktop player triggers.

A margin call must not be reachable only from one view. `#margin-call-banner` and `#dunce-banner` live inside the right panel, so hiding that panel to show a different view would bury them. Panels are therefore never set to `display:none`; they get `.fm-off`, which hides their children with those two ids excluded, and the banners are pinned under the top bar. This is checked against all five root views.

Also removed: the `touchend` handler that called `preventDefault()` and then `e.target.click()` on every button. It double fired in some paths and killed any scroll that began on a button. `touch-action: manipulation` does the job in CSS.

NO DOM IS MOVED. Every view is an existing panel or tab body shown in place. The drawer is `#fm-header-user` repositioned by CSS rather than relocated, so its listeners, ids and `data-i18n` attributes survive untouched. The top bar reads cash, name, portrait and the clock from the existing nodes on a one second mirror rather than duplicating their wiring.

Twenty eight new i18n keys, en and zh. The More grid is built from a JS array, which is exactly the shape that silently stays English in Jade mode, so every label in it carries a key and the check suite verifies each one resolves to a Han string.

`tools/mobile-check.mjs` is new: 71 assertions, most of them driving the real markup in jsdom. Both of the assertions that matter were regression tested by breaking the code and confirming they fail.

Changed files: client/assets/mobile.css, client/assets/mobile.js, client/assets/core.js, client/version.json, tools/mobile-check.mjs (new), docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.2.5 (2026-07-26) - Hotfix: NEW PAGE did nothing on an empty book (CLIENT)

Client only. Hard refresh. No restart needed.

render() tested pages.length before it tested whether the editor was open, so the empty-book branch wrote "Nothing has been written down yet" into the right-hand page and returned without ever reaching the editor. Clicking NEW PAGE set the editor state, called render, and had its own editor painted over by the empty message.

The bug existed only on an empty book, which is the state every fresh install is in and the only state where NEW PAGE is the sole button that can do anything. The one path that was broken was the one path a new install takes.

THIRTY EIGHT CHECKS PASSED ON THAT BUILD. They were all regex over source: they proved a gate existed, a field was escaped, a key had a translation. Not one of them clicked a button, so none of them could see that the button did nothing. Static assertions describe a file; they cannot describe a sequence.

tools/lore-check.mjs 38 to 48, and ten of the new ones drive the real module in a real DOM. Mount the button, open the book on an empty page list, click NEW PAGE, assert the editor exists and the empty message is gone. Then the same with a page present, typing a title and body and asserting the save posts to the server with the token and the typed text. Then a non-dev, asserting the controls are not rendered at all.

AND ONE OF THE ORIGINAL CHECKS WAS LYING. The assertion that no innerHTML is fed a raw page field looked for esc AFTER the field, while escaping happens BEFORE it, so it was testing an expression it had not understood and reporting clean either way. It now checks the characters immediately preceding every use of a page field, and it was verified by unescaping one title and confirming it fails. A check that passes for the wrong reason is worse than no check, because it is counted.

Changed files: client/assets/lore-book.js, client/version.json, tools/lore-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.2.4 (2026-07-26) - Lore Events (SERVER + CLIENT)

Server change. `pm2 restart fleshmarket` required. One additive table, no migration.

A book sits beside the End of Day clock. Dev accounts write pages into it recording what has happened in the world, and everyone else reads them. It is not a changelog. Everything else in the client shows the present tick; this is the only place that says what any of it meant, which is why it reads as a physical object rather than another panel.

It opens with the pixel book animation, fifteen frames stepped across one sprite sheet by background position so the whole thing is a single request. Left page is the index, right page is the entry. Set in the supplied pixel serif throughout.

WRITING IS DEV ONLY, READING IS NOT. All three write routes refuse an unauthenticated caller and refuse a non-dev, checked separately per route so a gate on one can never be counted for another. Unpublished pages are withheld from everyone who cannot write them, so an entry can be started and finished later without the world reading it half written. Pages carry an order value, so a dev can pin something above the chronology without renumbering everything under it. A page written while somebody has the book open appears in it without a reload.

A DEV ACCOUNT IS STILL AN ACCOUNT. This is the only place in the game where a human types prose that lands in the DOM of every other client, so the body is escaped and only line breaks are honoured, titles are stripped of control characters and capped, bodies go through the same three pass text filter as every other player visible string, and the update path takes a column allowlist. Posting an onerror image tag as a title stores it and renders it as text, which is the correct layer for that to be handled at.

THE FONT DOES NOT COVER CHINESE. Anti kvak is a sixteen unit per em pixel serif with Latin and Cyrillic and no Han block at all: the characters in this game's own name are not in it. A stack of just that font would have rendered the entire book as tofu boxes the moment anyone opened it in Chinese, which is the one thing a lore book cannot do. The stack falls through to a Han serif, and the checks assert that it does rather than trusting anybody to remember.

TWO THINGS THAT DID NOT WORK FIRST TIME, both mine, both caught by testing against a running server rather than by reading. The token global was a guess and was wrong: the rest of the client uses window.__fmToken and this module invented three names that do not exist, so every write would have gone out unauthenticated. And the title sanitiser was borrowed from the city handlers, where it is declared inside the websocket message closure and is not reachable from an express route, so every create and every edit answered five hundred.

CHECKS. tools/lore-check.mjs, new, 38 checks. Per route auth, the column allowlist, escaping at every point a page field reaches innerHTML, the font stack leading with the pixel serif and falling through to a Han face, the assets existing, the mount point, and every string the book can show having a key and a Chinese translation.

Changed files: server/server.js, server/db_city.js, client/index.html, client/assets/lore-book.js (new), client/assets/lore-book.css (new), client/assets/core.js, client/assets/fonts/Anti_kvak.ttf (new), client/assets/ui/book/ (new), client/version.json, tools/lore-check.mjs (new), docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.2.3 (2026-07-26) - Circuit freight works its own gate (SERVER)

Server change. `pm2 restart fleshmarket` required. No schema change.

1.2.2 built the lane. Nothing used it.

CHANGZHENG HULLS RUN THE PASSAGE. Hull selection asked whether BOTH ends of a run were in the Circuit, which is true of an internal Circuit lane and false of the passage, so the one route the Circuit actually cares about was being flown by Coalition freighters. A run with EITHER end inside the Circuit is Circuit freight now, so what comes through the gate and docks at Cascade Station is a Changzheng hull, which is the point of having given them their own family.

A crossing belongs to both sides. The sector tag used to file a run under one view or the other, and a run through the passage has one end in each, so it was being hidden from whichever side you happened to be standing on. It is tagged to both now and drawn anchor-to-gate: each side renders the half it can see, since the two colonies live in different views and a straight line between their coordinates would have the ship fly out of empty space. Crossing the gate is the cut between the two halves, which is also how it reads in fiction.

AND THE GATE IS ACTUALLY BUSY. The passage was one lane in sixty four at ordinary weight. Watching the live fleet for a hundred and thirteen samples produced zero crossings, which for the single most interesting route in the game is the same as not having built it. It is weighted as the trunk route it is: everything moving between two galaxies funnels through one door. Roughly one spawn in nine, frequent enough that a player watching Cascade Station sees Circuit hulls arrive, rare enough that it stays an event.

Measured on a running server: crossings appear while the passage is open and none is spawned while it is sealed. A crossing already in flight when the gate closes finishes its run rather than vanishing, which is the same courtesy in-transit cargo has always been given, and the checks distinguish that from a new spawn so the two can never be confused.

THE SCAN IS A SENSOR, NOT A JURISDICTION. This is the part I had wrong in fiction as well as in code. The refusal used to read as the Circuit declining to file its manifests, which made a Changzheng hull unreadable anywhere, including parked in Coalition space. Flesh Station sits in the Coalition cluster and its sensors reach as far as the gate. It reads a Circuit freighter that has come through the passage exactly like anything else in range. What it cannot do is see past the gate, and that is a fact about where the sensor is rather than about what the ship is carrying. The refusal now says so, in both languages, and only a run wholly inside the Circuit gets it.

THE PASSAGE STAYS WHERE YOU PUT IT. Sealed as a story beat, the gate used to reopen on the next deploy because the state lived in a variable and nothing wrote it down. It is persisted to city_kv on every dev command and restored at boot. Absent means never set, which is open: the passage starts open and closes only on the Circuit's word.

CHECKS. tools/lane-check.mjs 38 to 52. Traffic weight sits in a band, busy enough to be seen and not so busy it becomes a conveyor belt, computed against the real lane table rather than asserted. Hull family, both-sector tagging, anchor-to-gate geometry, the scan keying on the run rather than the hull, the refusal wording, and all four halves of persistence.

tools/fleet-check.mjs 55 to 56, and one assertion CORRECTED rather than added: it required the refusal to name the Circuit registry, which was the old fiction. It now requires the refusal to give sensor range as the reason and to name the passage as the limit. That check failing on this build is what caught the wording drift, which is what it is for.

Changed files: server/server.js, client/assets/galaxy.js, client/assets/tutorial.js, client/assets/core.js, client/version.json, tools/lane-check.mjs, tools/fleet-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.2.2 (2026-07-26) - The passage is a lane (SERVER)

Server change. `pm2 restart fleshmarket` required. No schema change.

I had the model backwards. 1.2.1 sealed the Circuit off correctly and left the far more basic problem in place: there was no way to trade across the border at all, ever, open or sealed. The two sectors were separate graph components, so the Circuit was a place you could look at, fly around inside, and never carry a single unit into or out of. That is not what a passage is for.

ONE LANE CROSSES THE BORDER NOW. Cascade Station to Mozi Array through the FTL gate. It is drawn as a dotted line running from its anchor colony to the gate on whichever side you are standing, animated so an open passage reads as live rather than painted on, and it is simply absent when the passage is sealed. Not greyed out: a dimmed line reads as a route that is temporarily busy, and nothing at all reads as a border.

The gate is checked in one place, findLane, which is the choke point every consumer already goes through. Routing, freight, smuggling, contracts and the share market are therefore all gated by construction rather than by each of them remembering to ask. The routing graph and the NPC spawn table drop the edge separately, since both build their own adjacency.

IT IS NOT PROPERTY. The passage cannot be bought into as a lane share and cannot be blockaded. A share in it would be a holding the seller can delete on a whim, and nobody should be able to buy a toll booth on the only door between two galaxies. Refused in all three handlers, buy, swap and blockade.

Verified against a running server across the full cycle. With the passage open, New Anchor to Yujing routes in three hops through the gate and Cascade Station to Mozi Array in one. Sealed, both refuse with no_lane while New Anchor to Cascade Station and Yujing to Tiangong keep routing normally, so the border closes without either sector losing its own internal trade. Circuit colonies on the arbitrage board go sixteen, zero, sixteen across the same cycle.

Defaults open, and awaits the dev command to close.

THE TUTORIAL HAS NOW BEEN WRONG TWICE, BOTH TIMES MINE. In 1.2.0 it did not mention the Circuit at all. In 1.2.1 I corrected it to say that no cargo is ever hauled between the galaxies, which was me writing my own misreading into the game's own explanation of itself and is the worse of the two errors: an omission leaves a player uninformed, a false rule teaches them something they will act on. It now says what is true. One lane, named at both ends, opening and closing on the Circuit's word, not for sale and not blockadeable. Rewritten in both languages.

CHECKS. tools/lane-check.mjs 22 to 38, and the border assertion INVERTED: it used to assert that no lane crosses and that the Circuit is its own component, which was correct for the old model and is exactly wrong for this one. It now asserts that exactly one lane crosses, that it is the passage, that it runs between the two named anchors, that no other lane crosses, that the Circuit is reachable when open, and that removing the passage parts the graph again while leaving the Circuit whole on its own side. Plus eleven assertions that the gate reaches findLane, routing, NPC spawning, shares, swaps, blockades and all four client render paths, counted rather than merely found, because gating two of three handlers would be worse than gating none.

tools/tutorial-check.mjs 19 to 22, and it now cross checks the slide against the lane table: if the table has a passage, the tutorial may not claim cargo cannot cross. That assertion would have caught both previous versions of this slide.

Changed files: server/server.js, client/assets/galaxy.js, client/assets/tutorial.js, client/assets/core.js, client/version.json, tools/lane-check.mjs, tools/tutorial-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.2.1 (2026-07-26) - The passage seals the whole Circuit (SERVER)

Server change. `pm2 restart fleshmarket` required. No schema change.

The dev panel switch that seals the Jade passage did nothing to the commodity market, because nothing in the commodity market ever asked. WORMHOLE_OPEN was read in exactly two places since the Circuit shipped: the ticker list sent at connect, and the stock order handler. Sealing the passage therefore hid the Jade Exchange and left the Circuit's sixteen commodity markets fully open, listed on the arbitrage board, priced every tick, and tradeable. The switch looked broken because it was only ever half a switch.

One predicate now, jadeSealed, consulted by every path that can reach a Circuit market: the arbitrage grid, the per colony price board, buy, sell, smuggling departures and freight departures. Sealed means gone from the board rather than greyed out, because a price a player cannot act on reads as an arbitrage being withheld rather than a market that is closed.

Cargo already parked on the far side is not destroyed, only frozen. It stays where it is and becomes sellable the moment the passage reopens. Runs already in flight are left to finish, which is how the commodity halt has always treated in transit cargo.

Verified against a running server across the full cycle, driving the real dev endpoint: sixteen Circuit colonies listed with the passage open, zero while sealed, sixteen again on reopen, with Coalition markets answering normally throughout and a buy at Yujing going from filled to refused to filled.

The client rebuilds on the broadcast too. An open Markets or Shipping tab used to keep showing a board the server had started refusing, which was the other half of why the switch looked dead.

THE TUTORIAL SAID SO WITHOUT SAYING WHY. It stated that no lane crosses the border, which is true and was the wrong emphasis: what a player needs to know is that no cargo is ever hauled between the galaxies, that Circuit goods are bought and sold inside the Circuit, and that the passage can be sealed, at which point the whole Circuit closes to them. Corrected in both languages.

CHECKS. tools/lane-check.mjs 13 to 22. It asserts a single sealed predicate exists, that the grid filters on it, that the price board and both trade handlers refuse on it, that both smuggling and shipping refuse on it, that the predicate recognises all sixteen Circuit worlds, and that toggling the passage rebuilds the two client views. Counting the guards rather than just finding one is deliberate: the failure this release fixes was a gate applied in some paths and not others.

Changed files: server/server.js, client/assets/galaxy.js, client/assets/tutorial.js, client/version.json, tools/lane-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.2.0 (2026-07-26) - FleshMarket 1.2 (SERVER + CLIENT)

The public release. 1.1.9.13 is what has been running; this is everything since.

Server change. `pm2 restart fleshmarket` required. Every schema change in here is additive, so a rollback to 1.1.9.13 leaves the new columns and tables in place, unread, and needs no down migration. The migration itself was rehearsed against a copy of a real database on the old schema: 275 districts and 25,236 storefronts preserved, every added column present with its defaults, and a forced settlement completing clean.

THE JADE CIRCUIT. A second galaxy, reached through a sealed passage, with its own exchange, its own sixteen worlds, its own lane network and its own shipbuilding. The Circuit trades with itself: no lane crosses the border, Circuit freight flies Changzheng hulls built at Changzheng Yards and nothing else, and the Flesh Station deep scan stops at the passage, so a Circuit manifest cannot be read from this side. It has its own map, its own palette and its own news.

CHINESE. The client speaks it. Not a menu pass: the trading chrome, the order form, the galaxy and colony data, every casino game, the P&L tab, the chat panel, the tax office, the news engine down to the individual generated headline, and the faction and ticker names. Where the server generates prose it now sends structured data and the client builds the sentence, which is the only way a headline written at runtime can be read in two languages.

CITIES. The largest single addition. Nineteen colonies carry a city; a city carries districts; a player buys mayoral office over a district and runs it. Four policy levers drive six simulated conditions. Development and civic works build a skyline that is legible from orbit. Anyone, mayor or not, can lease a storefront or buy out one of the twenty five thousand established businesses, and the mayor taxes what they earn. Seats are contestable, offices default on unpaid debt, and conquest vacates the lot.

AND CITIES ARE NO LONGER A CLOSED SYSTEM. What a city cannot grow, it buys, and that shows up in that colony's own commodity prices. A world that zones its districts for food is where food is cheap; a world that zones for nothing pays for it on its own board; a blockaded world that never zoned pays through the nose. That coupling was simulated across two hundred runs before it was written, because it is a permanent directional pressure on a market that was tuned without it.

WHAT THE LAST WEEK OF IT WAS ACTUALLY SPENT ON. Cities shipped, and then a long pass looking for what a player could turn. The tick paid a fixed hour of income on every restart regardless of elapsed time. NPC business buyouts were priced off live income, two inputs of which the sitting mayor could move and move back inside a second. The websocket had no rate limit of any kind. Every one of those is closed, and the checks that would have caught them exist now.

THE TUTORIAL DESCRIBES THE GAME AGAIN. UNIT-7 was walking new players through a game that had moved on: nothing in it mentioned the Circuit, and nothing in it mentioned cities. Three slides added, in both languages. The Jade Circuit, what it is and why a Coalition hull is never seen there. Cities, which you can earn from without ever holding office, by leasing a storefront or buying out one of the businesses already trading. Holding office, the levers, the development, the rate you set and the bill you pay. And a fourth on what it costs to govern badly, because a seat priced on legitimacy is the part a new mayor most needs to know before they buy one. The commodity slide now says that a colony with a city on it presses on its own prices, and the closing slide names both galaxies.

The tutorial keeps its content in two arrays matched by index, and the renderer falls back to English per field when a Chinese entry is missing. That is a kind failure mode and a useless warning system: a slide added to one array and not the other does not throw, it shifts every slide after it so headings and bodies belong to different topics. tools/tutorial-check.mjs, new, 19 checks. Both arrays the same length, every Chinese heading, body and callout actually in Chinese, known slides anchored at matching indices in both, every tab and galaxy sub-tab the tutorial drives present in the markup, the content covering what this release shipped, and no em dashes. Verified by deleting a Chinese slide and confirming it fails three ways.

The development series below, 1.2.0.0 through 1.6.3.0, is the full record of how this was built, including the parts that were wrong on the way. Those version numbers were never public and never will be. They are kept as written because two hundred and twenty four references between those entries depend on them, and renumbering would quietly break every one.

---

# ── Development series for 1.2.0 ─────────────────────────────────────────────
# Internal builds. None of these shipped. Read downward for how 1.2.0 was made,
# or skip to v1.1.9.13 for the last thing that was actually live.

## v1.6.3.0 (2026-07-26) - Corruption, stores, and firms that fold (SERVER)

Server change. `pm2 restart fleshmarket` required. Three additive columns, no data migration.

CORRUPTION COSTS MONEY. It was in exactly the position legitimacy was in before 1.6.2.0: simulated every tick, shown to the player, and read by nothing except its own feed into crime and output. It now skims the civic bill. A clean district pays what its services cost; a rotten one pays up to 45% more for the same services. Graft below 20 is ordinary friction and free, so there is no cliff to fall off. The panel breaks the bill into what the services cost and what is being taken, because a number that goes up for invisible reasons is just a bug with extra steps. lv_politics is now a spending decision rather than a slider feeding a scalar nobody could act on.

SIEGE STORES. A blockade used to leave a mayor with nothing to do but rezone, which is a decision measured in weeks against a siege measured in days. Cover can now be bought ahead of the lane closing. It counts as local supply while it lasts, it spoils at 14% a week whether or not it is needed, and a world that is not short only pays the spoilage, which is what makes laying it in early cost something.

FIRMS FOLD AND FIRMS OPEN. Twenty five thousand businesses that never failed and never started were scenery. Churn is small on purpose, half a firm a week out of forty in a calm district and two and a half where unrest and crime are at 95. It exists so a district run into the ground visibly loses its trade and so the buyout market is not the same rows forever. The oldest go first, nothing below four firms is touched, and no single settlement can take more than a quarter of a district however bad it gets.

THE MIGRATION HAS NOW ACTUALLY BEEN RUN. Everything since 1.6.1.0 has added columns and tables to the city schema and none of it had ever been executed against a database that predates it. Building one on the 1.6.0.1 schema, playing mayors and arrears and player shops into it, and then booting this build against it: 275 districts and 25,236 storefronts preserved, all five added columns present with their defaults, all three new tables created, the charter computed and written for the first time, and a forced three hour settlement completing without error. Eight simulated days of settlement left the shop table oscillating in a twenty row band rather than drifting, which is the churn reaching equilibrium against the refounding rather than draining the largest table in the database.

COST ON REAL DATA, since this adds work to two hot paths. The commodity coupling is 13ms per five minute tick across 35 colonies. A full city tick, every district stepped plus churn plus stores, is 413ms hourly. Resolving every storefront in every city, which is the worst thing a client can ask for, is 319ms for 42,000 rows, and the rate limiter caps a single socket at three of those a second.

TWO THINGS THE CHECKS CAUGHT THAT I HAD WRONG. Stores were added to local supply as a raw quantity, but demand and local are RATES, so six weeks of cover read as six weeks of production every week and flipped a besieged world from maximum scarcity straight to maximum surplus. Cover now fills the gap it exists to fill and stops. And the panel reported cover in colony weeks while purchases were sized in a district's share of them, which would have claimed eighty four weeks of cover for what was really six.

The churn check also failed first time and was wrong rather than the code: it drained a district without refounding, so the WORSE district hit the four firm floor sooner and appeared to lose less trade. It refounds between weeks now, exactly as the tick does.

CHECKS. tools/city-check.mjs 64 to 84.

Changed files: server/server.js, server/city.js, server/db_city.js, server/ratelimit.js, client/assets/city.js, client/assets/core.js, client/version.json, tools/city-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.2.4 (2026-07-26) - The district record speaks Chinese (CLIENT)

Client, plus one additive column. No data migration.

1.6.2.1 and 1.6.2.3 both fixed the same shape of fault: strings built in JS that were never wired to the language layer. The district record shipped in 1.6.2.0 is another one, and a worse one, because it does not just render English, it WRITES English into the database. Every seat taken, every development, every petition went into city_history as a finished sentence and came back out through `esc(String(r.detail))`. In CN the whole record read in English, and because the prose is persisted rather than generated at render time, no later translation pass could ever reach it.

Rows now carry structured parameters alongside the sentence. The client builds the line through tf() from a template keyed on the event kind, and falls back to the stored English when there are no parameters, which is what keeps the rows already written in the live database readable instead of blank. Seven templates, en and zh.

The charter headline had the same problem in the other direction. Every other event headline in server.js passes a meta object so the news layer can re-render it in Chinese, fifty two of them, and the one added in 1.6.2.0 passed none. It does now, and the client news switch learned the two charter cases.

AND A TERMINOLOGY COLLISION, MINE. 1.6.2.0 introduced a colony level charter while the district seat history line already said "takes the charter of". A district has a seat. A colony has a charter. The history line said charter for both, which made the new colony office unreadable the moment it shipped. The seat line now says seat.

NEW CHECK. tools/city-check.mjs 57 to 64. It parses every kind the server can write out of the pushCityHistory call sites, including the ones chosen by a ternary, and asserts each has an i18n key, an English fallback in the renderer, a zh that is not just the English copied across, and the same token set on both sides so a template cannot render a sentence with a hole in it. Then it checks a paramless row still carries its English and a new row round-trips its parameters. Verified by deleting city.hist.works and confirming it fails, before being accepted.

That check is the point of this release more than the seven templates are. Six kinds shipped untranslatable and nothing caught it; a seventh would have done the same.

Changed files: server/server.js, server/db_city.js, client/assets/city.js, client/assets/core.js, client/version.json, tools/city-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.2.3 (2026-07-26) - The FRS panel speaks Chinese (CLIENT)

Client only. No server restart.

THE TAX PANEL WAS NEVER WIRED TO THE LANGUAGE LAYER AT ALL. Same shape as the transit log in 1.6.2.1: `tax-panel.js` builds its entire body as a template string in JS, so there was no `data-i18n` surface for `applyI18n` to reach and nothing in the modal had ever been translated. In CN a player opened it and read an English tax bill. 24 new `tax.*` keys, every player-visible string in the file now routed through a local `T(key, fallback)` shim over `window.t`.

THE ASSESSMENT DATE WAS ALSO ENGLISH, and less obviously so, because it was not a literal: `fmtPT` hardcodes `toLocaleString('en-US', ...)`, so "Sun, Jul 26, 12:00 PM PT" was generated rather than written and would have survived a string sweep. Now `zh-CN` when the language is CN, with the timezone suffix as its own key. The timezone itself stays America/Los_Angeles, because the assessment really does run at noon Pacific and localising the clock would be a lie.

"CAPITAL HOUSE" IS TRANSLATED TWO WAYS IN THIS CODEBASE, four uses each. `tab.guild` and `sec.capitalHouses` say one thing; `fnd.capitalHouse`, `fnd.patreonPerk` and `mt.capitalHouseNav` say another. The withdrawal-tax line uses the finance-side term, because that is the surface it belongs to and because the other term is already carrying the city storefront and Jade House senses elsewhere. This is a tie that wants an author's decision, not a majority vote, so nothing else was touched.

The price-alert button read as a bare "settings" next to a bell. Now names what it sets. EN unchanged.

---

## v1.6.2.2 (2026-07-26) - Hotfix: the manifest modal stopped opening (CLIENT)

Client only. No server restart. This fixes a regression shipped in 1.6.2.1.

WHAT BROKE. Clicking any Coalition NPC ship logged `ReferenceError: comZ is not defined` and opened nothing. 1.6.2.1 routed the real NPC cargo lines through `comZ`, the commodity name resolver already used elsewhere in galaxy.js. `comZ` is declared at galaxy.js:1620, inside the FIRST of that file's three sibling IIFEs. The ship manifest panel lives in the THIRD. A bare identifier in one is invisible in the others, so the reference threw, the throw landed in `openShipManifest`'s own try/catch, and the modal never reached `classList.add('open')`. Non-NPC ships took the other branch and were unaffected, which is why it looked like only some ships were dead.

THIS FILE HAS FALLEN INTO THIS EXACT TRAP BEFORE. The comment at galaxy.js:2209 documents it for `FLEET_HULLS` and is the reason `window._fmFleet` exists at all: "The manifest panel lives in a different IIFE in this file and cannot see any of the above." That comment was in the search output when 1.6.2.1 was written and was not acted on. A brace-depth count was used instead, which reported both sites at depth 1 because each IIFE body IS depth 1. Wrong tool, confident answer.

THE FIX. New `window.commodityNameZh(n)` in core.js, beside the other cross-scope resolvers (`tickerNameZh`, `hullNameZh`, `colonyNameZh`), and the manifest calls that. The local `comZ` in the first IIFE is untouched and its four existing call sites still work; deduplicating them is a separate change and this one keeps its blast radius at one line.

NEW CHECK, tools/scopecheck.py. Diffs galaxy.js against the previous release, finds the top-level IIFE ranges, and for every changed line resolves each called identifier against the declarations of its OWN IIFE plus globals. It was verified to fail on the exact regression above before being accepted, then run clean on all 27 changed lines across the 3 IIFEs. `node --check` cannot see this class of bug and neither can a data-coverage test, which is what 1.6.2.1 shipped with.

---

## v1.6.2.1 (2026-07-26) - The parts of Jade mode that were still English (CLIENT)

Client only. No server restart. Three reported gaps, one unreported one found while reading the code for them.

CIRCUIT TICKERS RENDERED IN ENGLISH IN TWO PANELS. Coalition company names live in `CO_NAME_ZH`, Circuit company names live in `JADE_I18N.ticker`, and the two key spaces are disjoint. `cycle-history.js` and `market-tools.js` only ever checked the first map, so `Wukong Deepscan` and its nineteen siblings fell straight through to English while every Coalition name beside them translated. The main ticker list did it correctly by branching on `t.jade`, and `newsZhText` did it correctly by checking both maps, which is three call sites and two different right answers. Replaced with one resolver, `window.tickerNameZh(name)`, that strips the trailing spawn digit and checks both maps in turn. All four call sites now use it. The next panel that renders a company name cannot reintroduce this.

THE TAXES BUTTON HAD NO `data-i18n` ATTRIBUTE AT ALL. Every other header button has one. Added `hdr.taxes`, and with it `data-i18n-title` support in `applyI18n` plus `hdr.taxesTitle`, because the tooltip was English for the same reason and would have been reported next.

THE INTERCEPTED TRANSIT LOG WAS NEVER WIRED TO i18n. Not partially: the modal was built before the language layer existed and nothing in it was ever connected. Now translated end to end. Static labels (close, Route, Cargo Manifest) carry `data-i18n` and the modal runs through `applyI18n` once on injection. The header, crew line and redacted line item go through `tf()` with `{id}` and `{n}` interpolation. Route endpoints resolve through `colonyNameZh`, which meant threading `fromId`/`toId` through `generateManifest` rather than translating the display strings back into ids. Real NPC cargo goes through the existing `comZ` commodity map. Hull name and hull class resolve through two new maps covering all 21 fleet hulls plus the three `SHIP_CLASS` fallbacks, so `Titan's Fist / Class-3 Pocket Carrier` reads as a ship and not as a leak. The Circuit deep-scan refusal toast names the hull it refused, so that name localizes now too.

188 CARGO MANIFEST LINES TRANSLATED. The flavour pool is keyed per colony and the lines carry `{N}`/`{M}` tokens, so the lookup happens on the raw template inside `pickCargo`, before substitution, and the numbers fill into the translated string. Embedded company names are pinned to their existing `CO_NAME_ZH` values rather than retranslated, so a manifest cannot contradict the ticker list. This is first-pass CN prose, same status as the colony lore block: terms are checked, voice wants a native read.

COLONY_ZH AND COLONY_NAME_ZH DISAGREED ON 13 OF 21 COLONIES. Not reported, found while reading. The galaxy renderer resolves colony names through `COLONY_ZH[id].name` and the news feed resolves them through `COLONY_NAME_ZH[id]`, and the two carried different Chinese for The Hollow, Null Point, Limbosis, Margin Call and nine others. In ZH a player read one name on the map and a different name for the same place in the ticker, every session. `COLONY_NAME_ZH` is the better prose and is now the single source; `COLONY_ZH` was realigned to it by reading the canonical map at build time rather than by transcription, so the two cannot drift apart through a typo again.

One em dash was reaching the DOM: the market-card symbol placeholder fell back to U+2014 when a symbol was missing. Now `--`, matching the EOD timer. The other 24 in `core.js` are in code comments.

Coverage is checked rather than asserted: 188/188 cargo templates, 23/23 hull names, 21/21 hull classes, 21/21 colony names in agreement, and EN mode verified as a pass-through on every new resolver.

STILL OPEN: `window.FACTION_ZH.jade.desc` is still placeholder CN awaiting a hand-written faction description. Coalition is translated two ways across the codebase, 39 uses of the first form and 18 of the second; new strings in this release use the majority form but the stragglers need a decision before a blind replace.

---

## v1.6.2.0 (2026-07-25) - Cities join the rest of the game (SERVER)

Server change. `pm2 restart fleshmarket` required. Two new tables, both additive.

The last pass hardened cities against being turned. This one is about the thing that was actually wrong with them: a trader could play the entire game without cities existing, and a mayor governed an economy nobody else could see.

THE CITY LAYER AND THE COMMODITY GRID HAVE NEVER TOUCHED. server/city.js imports nothing from the market. It invented its own food, med and tech supply against its own demand and stopped there, while the commodity grid priced 120 goods per colony a few hundred lines away. Those 120 goods are 40 agri, 40 med and 40 tech. City trades are food, med, tech and export. That is a one to one mapping sitting unused, with export left over as exactly what export should be: goods moving through rather than eaten.

Unmet civic demand now presses on the colony's own commodity prices. A world that zones districts for food is where agri is cheap. A world that zones for nothing buys its food in and pays for it on its own board. A blockade multiplies whatever is already unmet, so a self sufficient world shrugs a siege off and an import dependent one does not, which is the whole reason zoning is a decision rather than a preference. A besieged surplus world cannot ship the surplus out either, so it gluts and softens, which is correct and was not designed, it fell out.

THIS WAS SIMULATED BEFORE IT WAS WRITTEN, because it is a persistent directional pressure on a model that was tuned without it. tools/city-commodity-sim.mjs, 200 runs of two weeks of five minute ticks. The model cannot run away, supplyMod clamps at +/-0.4 and price at half to 1.8x target, so the real risk was never instability, it was flattening: every colony pinned to the clamp, no spread, no trade. At a draw of 0.020 three of six test colonies sat on the clamp 98% of the time. At 0.008 nothing clamps in peacetime, the cheapest to dearest spread across colonies is 47%, and a siege still reaches the clamp, which is the one time the map is supposed to go extreme. Shipped at 0.008.

Six of fourteen districts on a capital have to zone for a trade before that world feeds itself. That number is generated by the checks rather than asserted here.

LEGITIMACY PRICES THE SEAT. It was simulated, displayed, and read by nothing except its own contribution to unrest. Governing badly already cost occupancy through tax flight, which is slow and private. Now it is public: a district that has turned on its mayor is cheap to take, 0.4x base at the floor and 1.6x at the ceiling. Applied to the baseline term only, never to the invested passthrough, because that passthrough is the property that stops seat trading printing money and the checks assert compensation can never exceed what was spent at any legitimacy.

AND TENANTS CAN PUSH IT DOWN. An established shopholder may file a petition against the sitting mayor. Three guards against the obvious abuse, which is to lease in, petition, and buy the seat you just devalued: the frontage has to predate the filing by half a ramp so it cannot be bought for the purpose, one filing per player per district per day, and the hit is weighted by how much of the district's trade is actually yours. The effect is deliberately not permanent. Every scalar relaxes 35% of the way to its target each week, so one filing washes out and only sustained discontent moves a district. One angry afternoon does not.

REAL TRADERS BRING REAL TRADE. A player storefront and one of the twenty five thousand established firms counted identically toward how busy a district read, so nothing improved when real people moved in and a mayor had no reason to court anybody. A district's commercial pool now grows with the number of DISTINCT players trading in it, saturating at +35%. Distinct, not shop count, or one player leasing twenty units collects the whole bonus and the incentive inverts into the monopoly it exists to discourage. Four separate traders are worth measurably more than one holding four units.

THE CHARTER IS WRITTEN FOR THE FIRST TIME. charter_owner has been in the schema since cities shipped and was read in exactly one place, the conquest path, where a city held by one of the capturing faction's own is spared. Nothing ever wrote it, so it was always null, so that branch has never once been able to fire and every capture has always seized everything. It now belongs to whoever has the most capital standing on the world, recomputed every tick, with the previous holder recorded and a headline when it changes hands.

AND THE COLONY REMEMBERS. Districts had no memory at all. city_history logs seats taken and lost, development, works, petitions and charter changes, trimmed per district so a busy capital cannot bury a quiet frontier one, and the panel shows it.

CHECKS. tools/city-check.mjs 29 to 57, still driving the real persistence layer in memory with nothing mocked that is under test. Three of the new ones failed on the first run and all three were worth having: two caught a fixture that seeded two districts on a colony whose population implies fourteen, which made every per district supply figure wrong by seven times, and the third was measuring pool growth from adding shops and calling it the player bonus. The saturation check now holds shop count fixed and only reassigns owners.

Changed files: server/server.js, server/city.js, server/db_city.js, server/ratelimit.js, client/assets/city.js, client/assets/core.js, client/version.json, tools/city-check.mjs, tools/city-commodity-sim.mjs (new), docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.1.0 (2026-07-25) - City audit (SERVER)

Server change. `pm2 restart fleshmarket` required. Two additive columns, no data migration.

A pass over the whole city system looking for anything a player could turn. Three things were real.

THE TICK PAID BY THE CLOCK ON THE WALL, NOT THE ONE THAT PASSED. dtWeeks was CITY_TICK_MS / WEEK_MS, a constant, and runCityTick() also ran unconditionally at module load. So every deploy credited a full hour of tenant net and mayoral take to every player in the galaxy regardless of when the last tick actually ran, and a six hour outage credited one hour. Five restarts in an afternoon was five free hours. Nothing else in the file works this way; cargo shipments and contracts have stepped off real timestamps since they shipped.

Elapsed time now comes off a persisted clock in city_kv. A restart moments after a tick settles nothing at all. An outage settles what it owes, bounded per tick and carried forward, so a long one catches up over the next few ticks rather than dumping the backlog into one payout. A clock in the future, which is what a restored older database or a system time change looks like, resyncs and pays nothing, because a tick that cannot measure its own elapsed time must not guess.

A MAYOR COULD MARK DOWN THEIR OWN BUYOUTS. NPC businesses were priced at a lease plus twenty weeks of live net income, and live net income has two inputs the sitting mayor moves in one message each: the commerce rate, a band from 5% to 25%, and the favoured trade, worth +35% to the trade named and -12% to everything else. Drop both, buy the business, put them back. Measured against the real pricing code: 25% off an ordinary storefront and 44.4% off one in the favoured trade, free, instant, reversible, and available only to the player who could also read the books.

A going concern is now quoted off a NEUTRAL resolution, default rate and no zoning, so the price is what the business earns under ordinary governance. The panel and the handler both quote it the same way, or the button would lie about what it is about to charge. The rate and the zoning also got an hour's cooldown each, not because the pricing still reads them but because a lever that moves every tenant's income should not be movable twice in a second for any reason.

THE WEBSOCKET HAD NO RATE LIMIT. None, of any kind, on any message type. Most handlers are cheap enough that it never showed, but city_data_request resolves every storefront in every district of a colony through an eight pass spill loop and this database is carrying twenty five thousand established businesses. One socket in a loop was a real CPU sink and nothing stopped it. Two token buckets per connection now: a wide one for ordinary traffic and a much tighter one for the handlers that walk the shop tables or rebuild a snapshot. Keepalives are exempt. A connection that outruns its budget loses the frame and not the socket, because a client that trips this is bursting rather than attacking, and it is told once every few seconds rather than flooded.

Three smaller things, each a decision rather than a fault.

ARREARS. The civic bill can only reach cash, so a mayor holding wealth in stocks or a fund paid nothing on a shortfall and coasted to the four week lapse, which wrote the debt off. They still can. They cannot also buy seats, develop, commission works or take frontage while doing it. Settle the district or lose it.

CONTESTED WORLDS. cityFullData has reported a contested flag since cities shipped and nothing ever enforced it, so charters changed hands freely on a world with a live conquest timer. Commerce carries on under fire; the charter does not.

OCCUPATION. Leasing and buying were closed during an occupation and renaming and closing were not, so a storefront could be shut down in a city that was supposedly trading with nobody. Consistent now.

And one latent hazard closed on the way past: updateDistrict built its SET clause by concatenating the keys of whatever object it was handed. No call site passes an untrusted key, which is the kind of thing that stays true right up until it does not. It takes a column allowlist.

CHECKS. tools/city-check.mjs, new, 29 checks. It boots the real persistence layer against an in-memory database and drives the real economy functions, no mocks of anything under test. It asserts a restart settles nothing, that half an hour settles half an hour, that a long outage caps and carries and that walking the carry forward converges exactly on the elapsed time without overshooting; that manipulating the rate and the zoning moves live income and does not move the quote by a single credit, and it measures what the old pricing would have allowed so the number in this entry is generated rather than asserted; that settlement scales linearly with the slice it is given; that the buckets cap, refill, spend across both tiers and never touch a keepalive; and that updateDistrict drops a key it does not recognise instead of concatenating it into the SET.

Verified on a real boot: first start initialises the clock and pays nothing, an immediate restart settles nothing, and a database backdated three hours settles three hours and advances the clock by exactly that.

Changed files: server/server.js, server/city.js, server/db_city.js, server/ratelimit.js (new), client/assets/city.js, client/assets/core.js, client/version.json, tools/city-check.mjs (new), docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.0.5 (2026-07-25) - The deep-scan stops at the border (CLIENT)

Client only. Hard refresh.

Flesh Station cannot read Circuit freight. Clicking any hull flying a Circuit lane now returns a refusal instead of a transit log: Circuit registry, nothing filed outside the passage. The manifest still exists, the cargo is still real, the prices still move at both ends of the run. The station simply has no copy of it on this side.

Jurisdiction, not stealth. The Circuit files with the Circuit. That reads as a border rather than as a trick, which is the difference between the player learning a rule and the player learning a list.

KEYED OFF THE LANE, NOT THE HULL. Anything in Circuit space refuses, including a scoundrel that wandered in. Nothing in Coalition space refuses on account of what it looks like. Same rule as the sector tag from 1.6.0.4, and for the same reason: a player should learn one border, not nine silhouettes.

THIS REVERSES SOMETHING I ARGUED FOR. In 1.6.0.2 I said Circuit hulls should open the transit log like anything else, on the grounds that two identical looking ships must not behave differently on click. That objection does not survive contact with this rule and it cost me nothing to drop, because the rule is not per hull. Changzheng hulls only ever fly Circuit lanes, so no two identical silhouettes diverge; what diverges is which side of the passage you are looking at. The concern was real and this design does not trip it.

Text goes through tf() with {id} and {cls} tokens, English and Chinese, new key galx.scanCircuit. The refusal names the vessel and the class, so a click still tells you what you are looking at, just not what it carries.

NOT GATED ON WORMHOLE_OPEN, deliberately, because that was not asked for. If the passage opening is supposed to hand the station scan rights along with everything else it unseals, that is one condition on the branch and worth a decision rather than an assumption.

CHECKS. tools/fleet-check.mjs 52 to 55, and one existing check inverted: the Circuit end to end block asserted that clicking a Circuit freighter opens the log, which is now exactly the wrong behaviour. It now asserts the click is refused, that the refusal names the Circuit rather than an unregistered hull, that it names the hull actually being drawn, and that the panel stays shut. The harness also got a real tf() that interpolates rather than a passthrough that returns the raw fallback, because the passthrough would have let a string ship with {id} and {cls} still in it and passed every check that only greps for a keyword. It caught exactly that on the first run.

Changed files: client/assets/galaxy.js, client/assets/core.js, client/version.json, tools/fleet-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.0.4 (2026-07-25) - One ship layer, two sectors (CLIENT)

Client only. Hard refresh.

The map draws both sectors into the SAME coordinate space and swaps between them. Yujing is at (500,300); so is a patch of Coalition space. Every ship in the game, both sectors' worth, is rendered into one gShips layer. swapGalaxy handled that with a single line: hide the whole layer whenever the Circuit is on screen.

That line was correct for exactly as long as no ship on the map belonged to the Circuit. The moment Circuit freight existed it did both halves of the wrong thing at once. In Circuit view it hid every hull, including the Circuit's own, which is why the Circuit looked like it had no traffic even after 1.6.0.3 put freighters on those lanes. In Coalition view it showed everything, including Circuit freighters, whose coordinates land squarely on top of Coalition space. Same line, both complaints.

Hulls now carry the sector they fly in and only the active sector's traffic is displayed. The layer itself is never hidden.

WHAT I HAD WRONG. I said the shipped code could not be doing this and offered 1,200 clean spawns as proof. The spawns were clean. They were also beside the point: the pool logic picks the right hull and always did, and the fault was never in hull selection. I tested the thing I had changed and read the absence of a fault there as the absence of a fault, which is how a whole subsystem stays unexamined. What the console dump settled was not which build was live, it was that the build was live and the ships existed, which is the fact that pointed at rendering.

CHECKS. tools/fleet-check.mjs 43 to 52. Every hull carries a data-gx tag; the tag is derived from the LANE and not from the hull art, so a Coalition hull on a Circuit lane would still be filed under the Circuit; the ship layer is never hidden wholesale in either view; each view shows some traffic; and each view shows nothing from the other sector. window._fmGalaxyView is exported so a harness can swap sectors without clicking the portal.

Changed files: client/assets/galaxy.js, client/version.json, tools/fleet-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.0.3 (2026-07-25) - The Circuit had no lanes (SERVER)

Server change. `pm2 restart fleshmarket` required. No migration.

1.6.0.2 painted the Circuit correctly and it changed nothing, because there was no Circuit freight to paint. The 26 Jade Circuit lanes exist in the client LANES array, where they were added in 1.5.0.0, and were never copied into LANES_SERVER. Everything on the server that moves cargo walks LANES_SERVER: npcPickLane, findLane, the findRoute BFS, the shipping contract board, the blockade hooks. With no Circuit edges in that table, the Circuit had sixteen colonies with real colony state, real commodity markets that have been ticking prices for two minor versions, a full city layer, and no way to move a single unit of anything into or out of any of it.

Nothing threw. There was no error to find. npcSpawn simply never drew a Circuit lane because none was in the weighted list; smuggling_start answered "No lane exists" for any Circuit endpoint, which reads like a rule rather than a bug; findRoute could not reach a Circuit world from anywhere, including from another Circuit world; and the contract board never wrote a contract against a Circuit spread because it looks lanes up the same way. Sixteen markets sat there pricing goods nobody could ever carry.

The 26 lanes are copied in verbatim. Verified against the client table: 26 added, 0 lanes on the server side the client does not have, 0 vol or type drift on the 37 that were already shared. Circuit lanes now take 42.5% of npcPickLane's spawn weight, which is what the client geometry always implied and the server never delivered.

WHAT THIS TURNS ON, ALL AT ONCE. NPC freighters fly Circuit lanes under Changzheng hulls with real manifests and real price impact at both ends. Players can run cargo to and from Circuit worlds and be intercepted doing it. Multi-hop routing can path across the Circuit. The contract board can write against Circuit spreads. That is four systems switching on together on a sixteen colony region whose prices have been drifting untouched since 1.5.0.0, so the first hours will be volatile while NPC flow drags them toward equilibrium. Nothing is retroactive and nothing needs a migration; it is just that the arbitrage that has been sitting there is now reachable.

A CORRECTION TO 1.6.0.2. That entry claims 42.5% of server freighter traffic flies Circuit lanes. It did not. It flew none. The figure was computed off the CLIENT lane array and stated as a fact about server behaviour, which is exactly the kind of claim that is supposed to come from the thing being described and not from something that resembles it. The number is right for the table it was measured on and was never true of the server. 1.6.0.2's routing claim of "zero server change" is likewise wrong: the change it described could not work without this one.

tools/lane-check.mjs, new, 13 checks, no dependencies. It parses both lane tables out of the two source files and asserts they are the same table: every client lane exists server side, no server-only lanes, vol and type agree on every shared lane, no lane duplicates itself under either direction. Then it asserts what the drift actually broke: every lane endpoint has a colony row, no Circuit world sits in NO_MARKET_COLONIES (which would kill freight on every lane it touches without erroring), every Circuit world is reachable from Yujing over server lanes, no lane crosses the Circuit border, the Circuit is still its own graph component, and Circuit lanes can win an NPC spawn roll at all. Removing the 26 lanes again fails it three ways.

Changed files: server/server.js, client/version.json, tools/lane-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.0.2 (2026-07-25) - The Circuit flies its own hulls (CLIENT)

Client only. Hard refresh.

THE CIRCUIT WAS BEING FLOWN BY COALITION FREIGHTERS. Not routed wrong, painted wrong. There is not, and never was, a single lane with a Circuit world at one end and a Coalition world at the other: 63 lanes, 26 with Circuit worlds at both ends, 37 with none, 0 mixed. The lane graph has always been two separate components. What was actually happening is that 42.5% of server freighter traffic flies Circuit lanes and every one of those ships was drawn out of MERCHANT_POOL, which has no idea factions exist. A Coalition hull over Yujing was a paint job, not a border violation.

THE NINE VERBATTAN DESIGNS ARE NOW THE CHANGZHENG FAMILY. They are built at Changzheng Yards, they are numbered on the yard's marks rather than named per design, and they are freighters. CZ-1 Sanban, CZ-2 Shachuan, CZ-3 Fuchuan, CZ-4 Guangchuan, CZ-5 Caochuan, CZ-6 Xingcha, CZ-7 Louchuan, CZ-8 Changfeng, CZ-9 Baochuan. A Circuit lane draws from these and nothing else; a Coalition lane draws from the old pool and nothing else.

AND THEY TRADE. They are server fleet ships now, not decoration. They carry real manifests, they move real prices at both ends of the run, they can be intercepted, and clicking one opens the transit log the same as clicking anything else. The server contract did not change at all: it still only knows v1, v2 and v3, and the Circuit pool is split into the same three buckets by hull size.

WHAT THIS COSTS. The Circuit no longer has a navy. The ambient patrol is gone, and with it the rare stray sighting over Coalition space and the deep-scan refusal that named the fleet hull. Ambient traffic is scoundrels and only scoundrels. If the Circuit is supposed to keep warships, that is a separate hull set and separate art; it cannot be the same nine designs doing both jobs, because then two identical silhouettes behave differently on click and the player has no way to tell which is which before they try.

A VENTRAL PLUME NOBODY ORDERED. Every Class-3 hauler was drawing a second engine flame that had nothing to do with its hull. The v3 variant def carries thrustBot geometry tuned for the old 36x18 sprite, an 18x14 flame pinned at local (9,14), and defWithHull overwrote the main plume's numbers but never touched those. Fixed values against variable hulls: on the 40x14 Heavy Transport it hung fourteen pixels below the belly, and on the 38x9 Pocket Carrier it started five pixels below the hull entirely and floated there, unattached, under mid ship. Dropped rather than repositioned. There is nothing on the new art for it to come out of.

PLUME LENGTH WAS THE SAME MISTAKE IN THE OTHER DIRECTION. 1.6.0.1 moved plume scaling from hull width to hull height, which put it in the right place and the wrong size. Height alone means a short fat hull gets an enormous flame: the 26x17 Survey Trader wore a plume 54% of its own length and the Scoundrel Corvette wore one at 65%, while the 46x9 Carrier sat at 17%. It is bounded off both dimensions now and the whole fleet lands between 17% and 36%.

A YELLOW SQUARE ON THE POCKET CARRIER. Baked into titans_fist_detail.png, not a render bug: 36 pixels of #DCBE0A forming a dashed 18x18 outline around a raised pod. It is deliberate in the source pack, it traces a real seam in the art, and it is the only sprite in forty that has one. It read as a selection marquee, and gold is the dev and Patreon tone. Cleared to transparent so the pod is outlined by the same seam as its sides. No invented pixels. The map sprite never had it; at nine pixels tall the box is sub-pixel, which is why it only ever showed in the inspection panel.

A HOOK FOR THE NEXT ONE. Every sprite is rotated the same -90 at build time, so if a pack ever ships a hull nose down there is no code fix, only a re-cut. FLEET_HULLS entries now honour a flip flag and the whole group is mirrored, plume included, so a wrong-way hull is a one word change instead of an art job.

CHECKS. tools/fleet-check.mjs 31 to 43. The ones that matter: a Circuit lane must draw only Changzheng hulls and a Coalition lane must draw none, asserted per variant; a Circuit freighter must render from Circuit art, open the transit log rather than refuse, and carry real cargo; nothing may render outside the hull band, which is the assertion that would have caught the ventral plume; and no hull may wear a plume over 40% of its own length. Sprite lookups resolve through the registry's f field now that the class name and the filename have diverged.

Not changed: ship.sh. The divergence guard added after the merge -s ours incident already fetches, classifies and hard-stops before committing, which is stronger than the plain pull that was on the list, and a plain pull would abort anyway because apply.sh leaves the tree dirty by design.

Changed files: client/assets/galaxy.js, client/assets/core.js, client/assets/space/ships/fleet/titans_fist_detail.png, client/version.json, tools/fleet-check.mjs, tools/build-fleet-sprites.py, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.0.1 (2026-07-24) - Plumes, clicks, and a toast that never fired (CLIENT)

Client only. Hard refresh.

THE PLUME WAS PLACED OFF THE WRONG DIMENSION. positionShip puts the thrust sprite at an absolute local x, not an offset from the ship's centre, because the group origin is the hull's top left corner and the stern is therefore x=0. The new hull code scaled that offset off hull WIDTH, so a 42 wide hauler put an 8 wide plume at x=-17.6 and it burned four pixels behind the ship in open space. The wider the hull, the further it drifted, which is why it looked fine on the small ones and wrong on everything else. The plume now ends at the stern with a pixel of overlap, and its size scales off hull height instead of sitting at a fixed 8 by 8, which was taller than several of the Verbattan hulls.

CLICKING A SHIP DID NOTHING because galaxy.js is three separate IIFEs and the hull registry is in a different one from the manifest panel. Every reference to it from the panel threw a ReferenceError directly into openShipManifest's try/catch, which logged to console and swallowed it. The registry is now exported through window like the other cross scope handles in that file already are.

ONLY MERCHANTS OPEN THE TRANSIT LOG. Verbattan and scoundrel hulls now refuse the scan instead: a short line saying the deep-scan was refused, naming the hull, and why. No panel, no zoom. This replaces the personnel roster from 1.6.0.0.

AND A THIRD ONE FOUND ON THE WAY. gToast is declared inside this file's first IIFE and was never exported, so nothing outside it could see the identifier. city.js probes `typeof gToast === 'function'` before calling it, which has always evaluated false from a separate file, which means every city notification since City Charters shipped has been silently discarded: seat acquired, storefront opened, policy applied, all of it. Nothing threw, nothing logged, the toast simply never appeared. Exported and routed through the exported handle.

CHECKS. tools/fleet-check.mjs grew from 20 to 31. It now asserts the plume reaches the stern rather than trailing behind it, sits vertically centred, and is scaled to the hull; that clicking a merchant opens the log and names the hull actually being drawn and lists its real cargo; and that Verbattan and scoundrel clicks produce a refusal and leave the panel closed. Two small test entry points are exported from galaxy.js so a harness can build one ship and step it without starting the animation loop.

The refusal text interpolates through tf() with named tokens rather than string concatenation, so it translates; both lines have Chinese.

Changed files: client/assets/galaxy.js, client/assets/city.js, client/assets/core.js, client/version.json, tools/fleet-check.mjs, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.6.0.0 (2026-07-24) - New fleet art, scoundrels, and the Verbattan Defense Fleet (CLIENT)

Client only. Hard refresh. No server restart, no migration, and no change to the server fleet contract.

THE YELLOW HAULERS ARE GONE. Nine merchant hulls replace them: Star Traveller, Aureole, Astral Pioneer, Phoebe, Nomad, Canyonback, Cicada, Titan's Burden and Titan's Fist. The server still only knows the three variants it always knew, v1, v2 and v3, and still decides the fleet. Each variant now paints from a pool of three hulls, chosen from the NPC id so a ship keeps the same silhouette across the eight second fleet reconcile instead of changing shape while you watch it. The inspection panel names the hull it is actually showing rather than a generic class line.

SCOUNDRELS AND THE VERBATTAN DEFENSE FLEET, and both are decoration. They are client side only. They are not in the server fleet, they carry nothing, and they cannot be intercepted, smuggled against or interacted with in any way that touches the economy. They live in their own list precisely so nothing downstream can mistake one for a real hauler.

The Verbattan patrol the Circuit. Roughly nine sightings in ten are on a lane with Circuit worlds at both ends; the rest are outside it, which is the point of the rarity. A Circuit warship over Coalition space should read as an event, not as background, and the panel says so when it happens: OBSERVED OUTSIDE CIRCUIT SPACE rather than ON PATROL. Nine classes fly, from the Envoy corvette up to the Consular carrier.

Scoundrels work anywhere but favour the routes nobody files paperwork on. Just over half of them turn up around The Hollow, Null Point, The Ledger, The Escrow and Dust Basin.

CLICKING A VERBATTAN HULL RETURNS PERSONNEL, NOT CARGO. There is no manifest to extract, so the panel does not show an empty hold and pretend that means something. It lists the complement by post, gunnery, damage control, flight deck, marine detachment and the rest, and states plainly that a fleet hull files no manifest because it moves no freight. Clicking a scoundrel returns less than that: no registry entry, no filed route, hold sealed. An unregistered hull does not hand over a crew list either.

THE ART. The source packs draw every ship nose up. The map orients along atan2(dy,dx), where zero is right, so every hull is rotated ninety degrees at build time rather than at runtime. Two sizes are cut per hull, a tiny map sprite for lane traffic and a larger one for the inspection panel. The build script is committed at tools/build-fleet-sprites.py so the art can be recut if the source pack grows.

CHECKS. tools/fleet-check.mjs verifies every sprite the registry references exists on disk, that declared sizes match the actual files so nothing draws stretched, that no sprite is still portrait after rotation, and then exercises the traffic rules themselves: patrol distribution, scoundrel route weighting, hull determinism and pool coverage, and the separation that matters most, that no ambient ship ever enters the server fleet list or carries an npc payload. 20 checks. Needs jsdom, which is not a project dependency.

ATTRIBUTION: both packs ship their licence alongside the art. The licence permits commercial use and modification and forbids redistributing the pack itself. Neither readme names the artist, so the credit line still needs your input; the Corpo-Cards art is credited in game and this should be too.

Changed files: client/assets/galaxy.js, client/assets/core.js, client/version.json, client/assets/space/ships/fleet/ (new, 40 sprites and two licences), tools/build-fleet-sprites.py (new), tools/fleet-check.mjs (new), docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.5.1.1 (2026-07-24) - The OPEN CITY shortcut was pointed at a tab that does not exist (CLIENT)

Client only. Hard refresh. No server restart, no migration.

THE BUTTON DID NOTHING, and it looked healthy from every angle. cityOpen() checked whether the cities host was off screen and, if it was, clicked [data-tab="cities"] to bring it up. There has never been a [data-tab="cities"] in the markup. The main tab list is galactic, market, casino, mining and so on; cities is not a main tab at all, it is a galaxy SUB tab, [data-gstab="cities"], switching the #gCitiesPane that #citiesTabInner lives inside.

querySelector returned null, nothing was clicked, the pane stayed display:none, and renderCity painted the whole city into a hidden container. Nothing threw. Nothing logged. The city_data_request still went out and the server still answered it correctly, so anyone checking the socket would have concluded the feature worked. The player just saw a button that did nothing.

The shortcut now clicks the sub tab that actually exists, which is also what enters the fullscreen city view and loads the colony, so it lands on the city the card was showing. It also reopens the galaxy tab first if that is closed: #galacticTab is display:none when another tab is selected, and display:none on an ancestor removes the subtree no matter that the city pane is position:fixed.

TWO GUARDS, because this failure mode is silent by construction and I would not have found it by reading.

tools/selector-check.js sweeps every literal [data-tab] and [data-gstab] selector in the client against the markup and fails on any that match nothing. It strips comments first, or the comment explaining this very bug trips it. 24 selectors checked against 26 in the markup, all resolve.

tools/city-shortcut-check.mjs drives the real index.html through jsdom and asserts the pane becomes VISIBLE, not merely that a request went out. That distinction is the whole point: the broken version passes any test that only watches the websocket. Confirmed by running it against the old implementation, where it fails four checks and the two traffic checks still pass. Needs jsdom, which is not a project dependency: npm i jsdom, then run from the repo root. 20 checks.

Everything else re-run unchanged: i18n-check 6 of 6, i18n-scope-check, the offline server suites at 76 and the live WebSocket suite at 30.

Changed files: client/assets/city.js, client/version.json, tools/selector-check.js (new), tools/city-shortcut-check.mjs (new), docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.5.1.0 (2026-07-24) - Chinese for the city, and the Circuit states its bonus (CLIENT)

Client only. Hard refresh. No server restart, no migration.

THE CITY PANEL HAD NO TRANSLATION AT ALL. Not a partial pass, not a stale one: zero keys, so every label, hint, button and toast in City Charters rendered through its English fallback no matter what language was selected. 157 keys now cover it. Every English value in the catalog is byte identical to the fallback still written at the call site, verified mechanically across all 177 call sites, so English output is unchanged to the character.

Six strings were built by concatenation and could never have been translated in that form. They now interpolate through tf() with named tokens, so the Chinese can put the price, the district and the name wherever the sentence needs them rather than wherever English happened to put them.

Three keys were quietly serving two different English strings at different call sites, which meant adopting them into the catalog would have silently changed English text in two places. Caught by the parity check rather than by eye. Split into their own keys.

CONTENT NOUNS TOO, not just chrome. Stage names and their descriptions (VACANT through ARCOLOGY), all twenty landmark names including the two civic works tiers, the four trade labels and the faction labels are mirrored and fall through to English when a key is missing. The Jade Circuit was missing from the faction label table entirely, so a Circuit world printed the raw id in the wrong faction notice and fell through to the default tint on the district map. It now has both a label and a colour.

THE CIRCUIT CARD NOW STATES ITS BONUS. The five percent on export trade was live in the economy but was not written anywhere a player would look before joining. It leads the Circuit summary in both languages.

THE PASSAGE BADGE AND THE JOIN BUTTON WERE DRAWN ON TOP OF EACH OTHER. The OPEN / SEALED badge was positioned absolutely at the top right of the card while the JOIN control sat at the right of the header row, so on the Jade card the two overlapped into an unreadable stack. Both now share one right hand group in the same flex row and the badge label is translated.

Also added the missing Cities sub tab key, which was referenced in the markup and undefined in the catalog since the tab shipped.

VERIFIED: i18n-check passes all six checks (rendered em dashes, undefined keys, missing zh values, unsupplied interpolation tokens, dollar interpolation in single quotes, leading glyph loss), i18n-scope-check passes, English parity is exact across 177 call sites, no key in the catalog is unused, and the localized content tables were exercised in both languages. Server suites re-run unchanged at 76 offline and 30 live.

NOT TOUCHED: the Chinese Jade Circuit faction description itself. That string is still the first pass placeholder and is waiting on your text.

Changed files: client/assets/core.js, client/assets/city.js, client/assets/galaxy.js, client/version.json, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.5.0.0 (2026-07-24) - The Jade Circuit takes ground, and civic works (SERVER + CLIENT)

Server and client. pm2 restart and hard refresh. One additive column on city_districts, applied automatically.

THE CIRCUIT OWNS SOMETHING NOW. Until this release the sixteen Jade worlds existed only as client map data. The Circuit could be joined as an allegiance, and that was all it was: no ground, no market, no city, and funding it was blocked in the code with a comment saying so honestly. All sixteen are now seeded into colony_state.

Three things fall out of that seed rather than being built. The commodity grid iterates every colony in the state table, so the Circuit came online with 120 goods on each of sixteen worlds the moment they existed, 4,200 colony and commodity prices against 2,280 before. Cities attach to colonies, so all sixteen host one, with districts, established firms, frontage and mayoral seats generated the same way every other world's are. And the seat gate reads the colony's owning faction, so Circuit worlds are Circuit offices: a Coalition trader cannot hold one.

The Circuit reads as its own market rather than a reskin. State directed pricing runs tech and grain cheap and medical near par, and volatility sits at 0.7, between the Guild's efficient 0.4 and the Coalition's 0.6, because a planned economy is calm but not frictionless. Yujing is the Circuit capital at 760 million citizens, Chiyou Marches is a war frontier at 70 million that nobody wants to live on.

Circuit worlds sit OUTSIDE the conquest layer for now, and this is deliberate rather than an oversight. colony_state has control columns for four factions and none for the Circuit, so there is nothing for funding to flip a Circuit world to. Adding that column means touching conquest, blockades and the dividend bonus, and that is its own release with a migration in it, not something to smuggle into a content drop.

DISTRICT NAMES WERE ONE POOL OF FOURTEEN FOR THE WHOLE GALAXY, and districtCount tops out at fourteen, so every city ever generated had a Harbor Gate and a Cinder Rows. There are now two pools drawn by culture, twenty two names each, with a deterministic per colony rotation into them, so two cities of the same culture do not open with the same list in the same order. Circuit districts read as Circuit districts: Cinnabar Gate, Vermilion Quay, Grain Tribute Row, Iron Ox Crossing.

CIVIC WORKS. Development is capped at four levels because past that a level cannot repay, and that cap stays. Civic works is the other instrument and it is uncapped by income logic for the simple reason that it returns no income at all. The first monument in a district costs F2B and each one after multiplies by 1.55, so finishing a district takes F46.8B. What it buys is unrest down, prosperity up, local supply, and a skyline.

It also buys defence, which is the part that matters. Every point of faction control on a colony is already priced at a base rate plus warRate of the city book. Works count into that book, so a monumented capital costs several times more per control point to take. Works are NOT lootable: salvage and stripping both read development only, so an occupier dismantles what was built for profit and leaves the monuments standing. Dear to take, worth nothing to loot. Measured on Xuanwu Bastion: nine districts at full development cost F68.1M a control point, the same city with three works in every district costs F912.8M.

THE SKYLINE RESPONDS TO IT. Every visual property of a district keyed off one number, development, which saturates at 14 and is mostly set by population. A mayor's entire contribution to the look of a city cost F344M and then the button greyed out. Development still fills the ground; works go up. Massing lifts with works and the tall structures lift most, staging counts works at half weight so a monumented district decks out where population alone would leave it low rise, and two landmark tiers exist above anything development can reach: the fourth at three works and the fifth at five. The Oracle Spire, The Ten Thousand Docks, The Waking Mind. Nothing a merely large population can do reaches them. Tower headroom raised from 46 to 78 world units to fit the result.

THE CIRCUIT EXPORT BONUS IS LOCAL, AND THAT IS THE DESIGN. Circuit members take five percent more on export trade in Circuit cities. It does not travel. The version that would have travelled, a global bonus unlocked by owning any storefront anywhere in Jade space, was a checkbox: a frontage lease costs single digit millions, so a permanent galaxy wide buff would have gone for the price of one cheap shop, with no ongoing decision and no way for anyone to contest it. Both existing faction perks in the game, the Syndicate smuggling payout and the dividend sector bonus, are conditional on territory that can be lost. This one is conditional on being somewhere, which is the reason the sector exists.

A ROUNDING BUG IN LEVEL COUNTING, found while testing works and present in development the whole time. Level counts are derived by logarithm, and a district that has paid exactly for level two reads as 1.99926. It floors to one, so the next level is quoted at a token amount and the district is charged repeatedly for a level it already owns. Both level counters now snap to the integer when within a rounding error of it.

TESTS. 76 offline checks across structure, economics, governance, simulation, and a new Circuit and works suite, plus 30 live checks over a real WebSocket against a booted server. 106 of 106. The live suite confirms Circuit worlds serve city data with Circuit names and trading frontage, that a non member is refused office on Circuit ground, that works advance exactly one level per commission and quote a strictly rising price, and that a non mayor cannot commission them.

Performance with the galaxy at 35 worlds and 26,271 storefronts: income tick 169ms, simulation tick 73ms, both far inside the two second budget.

KNOWN AND NOT ADDRESSED: the city panel still has no Chinese keys and renders through English fallbacks, which now matters more because Circuit cities are the first cities a Chinese reading player will open.

Changed files: server/city.js, server/db_city.js, server/db.js, server/server.js, client/assets/city.js, client/version.json, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.4.4.0 (2026-07-24) - One city per mayor, and five things that did not work (SERVER + CLIENT, TEST BUILD)

Server and client. pm2 restart and hard refresh. No migration; a one time boot pass reconciles seats and refunds at cost.

This release is a test-and-remove pass rather than a feature. Every claim in the last three releases was re-measured against a rebuilt harness, and most of them held. Five did not, and one of them was quietly fatal.

ONE CITY PER MAYOR. A player may hold as many district seats as they can afford inside a single city, and none anywhere else. Office is residency: you govern where you live. Without it the map is a portfolio for whoever has the most cash, and local politics cannot exist because the same handful of names sit on every world. Anyone already holding seats on more than one world keeps the city where they have the most capital committed and is refunded, at face value, the seat price and the development of every outside seat, so the rule costs nobody anything on the day it lands. The panel now names the city that is blocking a purchase rather than only refusing it.

THE GALAXY DECAYED WITHOUT ANYONE TOUCHING IT. This is the one that mattered. The NPC administration floor sat at 18 on every lever, and 18 is a failed state: solved for its own fixed point it lands on crime 95, prosperity 5, output 5. Every district is stepped every tick whether or not it has a mayor, so within twelve weeks all 148 districts on all 19 worlds sat at prosperity 5, output 7, unrest 72, and city commerce fell from F5.7B to F265M. Ninety five percent of the city economy disappeared with no player ever logging in, and every payback figure quoted in 1.4.1.0 through 1.4.3.0 was measured on freshly seeded scalars that do not survive the first quarter. The floor is now 50, which is the lowest value whose equilibrium is a working, dull city: crime 45, unrest 45, prosperity 44, output 60. Colonial administration is competent and boring. A governed district still clears it by roughly three times on commerce, which is the entire reason to buy the seat.

THE SHOP CEILING DESTROYED TRADE INSTEAD OF CAPPING IT. Each storefront's gross was clamped independently against a flat per shop ceiling and the excess was simply dropped. Measured: 22 percent of all commerce in the galaxy, and 60 percent in a well governed capital, where 117 firms could physically absorb F47M of a F97M pool. It got worse the better a district was governed, which is the exact opposite of the intent. Overflow now spills to the shops still under the cap, and the cap itself is a share of the trade the shop sits in, 35 percent, with the old flat number kept as a floor so a thin frontier district still has headroom. A capital district now absorbs its full pool.

DEVELOPMENT PAST THE FOURTH LEVEL WAS A TRAP. A level costs 2.4 times the last one while the commercial return per level is roughly flat, so level five repaid in 256 weeks and level six in 782. The absolute ceiling of 14 advertised up to ten purchasable levels on a frontier district, six of which could never repay. A mayor may now build four levels above the district's population baseline and no more. Every purchasable level repays inside three years, the last one at 121 weeks.

CIVIC SUBSIDY WAS NOT WIRED TO ANYTHING. It was stored, persisted, shipped on every city payload and rendered as a slider the player could move. No part of the simulation, the civic bill or the commerce model ever read it. Removed from the writer, the payload and the panel. The column stays in the schema so no migration is needed.

CIVIC ARREARS CLEARED THEMSELVES FOR FREE. A mayor in debt was paid their full weekly surplus AND had the debt reduced by that same surplus, so running a district into arrears and then governing it well for one week wiped the balance at no cost. Repayment now comes out of the surplus first and only the remainder reaches the player.

NPC COMMERCE WAS SEEDED BEFORE THE V3 MIGRATION RAN. The migration counted the 13,517 firms it had just created as v2 tenancies and wiped all of them on the one boot where it fires, so a fresh deployment and any world upgrading from v2 both came up with bare cities until the next hourly tick refilled them. No money was ever printed by this, since npc: ids never resolve to a player. The seeder now runs after the migration.

EFFECT ON THE ECONOMY. Best case payback, measured under real policy at a tuned rate: Frontier Outpost 66 weeks, Eyejog 59, New Anchor 110. The capital stays the slowest to repay and runs roughly fifty times the absolute throughput, F12.0M a week against F0.25M, so starting small is correct and working up is worth doing. A seat left on default policy still does not repay anywhere, which is the intended shape: the return exists only if you govern.

ALSO REMOVED. mySeats and myShops were computed and shipped on every city_data and read by nothing. Three query helpers in db_city.js had no callers. getMayorDistricts was imported and never used.

WHAT HELD UP, RE-VERIFIED. Geometry and seeding: all 19 colonies seed districts matching their geometry, layouts are deterministic, out of range and unknown ids are refused, native trade spans three or more trades per city, NPC top up is idempotent and never exceeds frontage. Economics: gross splits into tax and net with no leakage, no district pays out more than its pool, an ousted mayor never recovers more than they invested at any level, the commerce rate has a real interior optimum that differs by district (18 percent on New Anchor, 20 on Frontier Outpost). Handlers: malformed indices are refused across the set, unknown colony ids are refused, the rate stays inside its band under hostile values. Simulation: a mayor is never driven negative, an unpayable seat lapses, capture locks the city and vacates every seat and pays nobody, liberation reopens it. Performance: income tick 97ms, simulation tick 53ms, both well inside the two second budget.

TESTS. 55 offline checks across structure, economics, governance and simulation, plus 17 live checks driven over a real WebSocket against a booted server with registered accounts. 72 of 72.

KNOWN AND NOT ADDRESSED: the city panel has no Chinese keys at all and renders through English fallbacks, which is the largest untranslated surface left in the client.

Changed files: server/city.js, server/db_city.js, server/server.js, client/assets/city.js, client/version.json, docs/CHANGELOG.md, docs/MANIFEST.txt.

---

## v1.4.3.0 (2026-07-24) - Adversarial pass: a fake lever and a coercion hole (SERVER + CLIENT, TEST BUILD)

Server and client. pm2 restart and hard refresh. No migration.

This release is the result of deliberately attacking the city system rather than adding to it. Two real faults came out of it, one economic and one input handling. Everything else held.

THE COMMERCE RATE WAS A FAKE CHOICE. A mayor sets their share of storefront trade anywhere from five to twenty five percent. Testing whether the take was monotone in the rate showed that it was: the maximum was always correct, so there was nothing to decide, and the description promising that undercutting a neighbour would pull their tenants across was a promise the code did not keep.

The cause was that the consumer pool was a fixed pie. Taxing hard drove firms out, but the survivors simply took larger slices, so total trade barely moved and the mayor's cut of it rose with the rate every time. Two changes fix it. Businesses now respond to what a district charges them, so a district at the maximum rate supports about sixty percent fewer firms than one at the minimum, and the shift happens over ticks rather than instantly. And trade now scales with how much of the frontage is actually open, so driving firms out costs the district real commerce rather than redistributing it.

The result is a genuine curve with an interior maximum that differs by district: about fifteen percent on New Anchor, about twenty on Frontier Outpost. Setting the rate is now a decision with a wrong answer at both ends.

INDEX COERCION. Every district-scoped handler parsed its index with Number(), which converts null, an empty string, an empty array, true and the string zero all to zero, and rounds a fractional value to the nearest whole one. Sixty one malformed messages were accepted across the handler set, each acting on a real district. Nothing could be obtained for free, but a crafted or simply buggy message could buy a seat or lease frontage in a district the player never selected, and seats cost billions. Indices now arrive as integers or are refused. Negative zero is normalised rather than rejected, since it is a valid zero.

WHAT HELD UP. Storefronts never collectively out-earn their district's pool. Gross splits into tax and net with no leakage or creation. An ousted mayor is always paid less than they put in, at every investment level tested. A business bought during a blockade is only four percent cheaper than in an open city, so there is no siege arbitrage. Five simultaneous buyouts of the same business grant exactly once and charge once. The commerce rate stays inside its band under hostile values, no unknown or injected colony id is accepted, and no malformed message goes unanswered.

Removed the hint line under the map.

Changed files: server/city.js, server/server.js, client/assets/city.js, client/version.json.

---

## v1.4.2.0 (2026-07-24) - District colour, and a full screen city (SERVER + CLIENT, TEST BUILD)

Server and client. pm2 restart and hard refresh. No migration; existing NPC firms are re-dealt on the next tick.

WHY EVERY CITY WAS GREEN. The architectural vocabulary shipped in 1.4.0.0 colours a district by what it trades, and in the look harness that produced amber, green, cyan and violet quarters side by side. In the game it produced one colour everywhere, and the cause was the release after it. Establishing NPC firms drew their trade from the city-wide demand split, which weights food at 0.40, so food became the most common trade in all 148 districts on all 19 worlds. The vocabulary was working exactly as designed and being fed a uniform input.

Districts now have a NATIVE TRADE: the thing that quarter has always mostly done. It is dealt from a bag proportional to the colony's demand and shuffled deterministically, so a twelve district capital comes out with roughly three freight quarters, five agricultural, two medical and two data, rather than twelve identical ones. NPC firms are then seeded predominantly in their district's native trade. New Anchor now reads as export, food, med and tech quarters in four distinct colours, and Eyejog likewise at its smaller scale.

FULL SCREEN. Selecting Cities from the galaxy sub navigation now takes the whole viewport rather than sharing the centre panel. The map was the smallest thing on screen in a layout that also had to hold a colony rail, a detail column and the rest of the galaxy chrome; giving it the window solves the clutter and the scale problem together. There is an EXIT control beside the colony switcher, and leaving the sub tab restores the normal layout.

This is done with position fixed rather than by moving anything in the document, so no element is reparented and the page structure is identical to stock. That is deliberate: markup surgery on this page has broken the layout twice, and the structural guard still passes unchanged.

VERIFIED: a new harness asserts districts span at least three trades, that no single trade dominates all of them, and that the canvas actually paints at least three colour families in a frame, which is the thing that was silently wrong. Plus fullscreen enters without reparenting, uses fixed positioning, and exits cleanly. 9 of 9.

The CSS scope guard was tightened rather than relaxed. It previously required every selector to contain the scope class, which the new fullscreen rule legitimately does not. It now encodes the real invariant, that no rule may target a bare host id, and was checked against the original leak to confirm it still catches it.

Changed files: server/city.js, client/assets/city.js, client/assets/galaxy.js, client/version.json.

---

## v1.4.1.0 (2026-07-24) - Established commerce, and a tick that does not stall (SERVER + CLIENT, TEST BUILD)

Server and client. pm2 restart and hard refresh. No migration; NPC firms are seeded on first boot.

CITIES ARE NO LONGER EMPTY. Every district now arrives with independent businesses already trading, roughly seventeen thousand across the colonies. Numbers are set by the economy of the world: New Anchor runs about 152 firms per district against Frontier Outpost's 33, driven by citizens served, capital status and development. This fixes a real hole rather than adding decoration. Before it, a player could buy a mayoral seat and earn nothing at all until other players happened to open shops there, which made every seat payback figure in the previous release theoretical. A seat now returns from the day it is bought.

BUYING A GOING CONCERN. Independent firms can be bought outright and renamed on purchase. The price is the frontage lease plus twenty weeks of what the business currently earns, so a firm in a thriving district costs more than the same frontage in a dead one.

What makes that worth doing is a new ramp: a newly leased storefront opens on eighteen percent of full trade and climbs to full over twelve weeks. An established firm is already at full trade and stays there when it changes hands, because the buyout deliberately does not reset its clock. On New Anchor that is 5.6 times the income today for 1.3 times the price. Leasing an empty frontage remains cheaper and is still available everywhere, since even the capital keeps a third of its frontage vacant. The choice is capital against patience.

A TICK THAT TOOK FOURTEEN SECONDS. Paying every storefront wrote one row per shop per tick. With seventeen thousand businesses that was 14.7 seconds of blocking work every hour, which would have frozen the entire game on each city tick. Independent firms keep their own takings and are never written to; only their tax reaches the mayor. The remaining writes are batched into a single transaction. Measured on a fully populated world the tick went from 14,722ms to 56ms. A performance guard now asserts the whole tick budget stays under two seconds, so this cannot come back quietly.

Worth being precise about how this was found: the lapse test began timing out, which looked like a test problem. It was the symptom.

A DEVELOPED DISTRICT CAN NOW PAY ITS OWN WAY. A consequence worth knowing: with established commerce present, a district that has been developed generates enough to cover its civic bill, so it will not lapse to arrears simply because its mayor is broke. Losing a seat to unpaid debt now requires actually running an undeveloped district into the ground on a low commerce rate.

COPY. Panel descriptions rewritten as plain statements of what a control does and what a number means, in place of the previous prose.

MAP. Removed a faint disc that sat in the sky. It was meant to read as a moon and read as an unexplained empty circle.

VERIFIED: 17 checks on established commerce and the buyout path, including that a seat earns with no player shops present, that a bought firm out-earns a fresh lease, that player-owned businesses are not for sale, and that buyout names are filtered. Performance guard 5 of 5. All existing suites unchanged.

Changed files: server/city.js, server/db_city.js, server/server.js, client/assets/city.js, client/version.json.

---

## v1.4.0.0 (2026-07-23) - Cities get an architecture (CLIENT, TEST BUILD)

Client only. Hard refresh. No server change, no migration.

WHAT WAS WRONG. Every building in a district was the same building at a different height. That reads as texture, not architecture, and no amount of extra detail fixes it because the problem is vocabulary rather than fidelity.

WHAT A DISTRICT BUILDS IN. Trade now decides FORM. Freight districts build a working plant: tank farms on shared pads, sawtooth foundries lit from inside so the molten glow bleeds through the roof lights, waisted cooling towers, flare stacks that burn at the tip, and pipe runs on trestles threaded between the blocks so it reads as one works rather than unrelated buildings standing near each other. Food builds stepped growing terraces with lit planting decks, faceted glasshouses and banded drums. Med builds sealed pale towers and blocks with a lit cross on the face. Tech goes for scale rather than detail, because that is the actual mechanism: near black tiered masses with horizontal light bands, one structure per district spanning well past its own footprint at nearly triple height with everything around it existing to make it look big, vast lit advertising panels down a tower face, and spinner lanes strung between the tall structures with craft moving along them.

Each district builds mostly in its own trade with a minority of the others mixed in, the way a real quarter does.

LANDMARKS. Investment raises one structure at the district centre at development 6, 10 and 13, and its form comes from the trade: a Cathedral of Grain is a stepped dome, a Cathedral Array is a pyramid that dwarfs its district, a Grand Terminus is a sawtooth hall with a rank of flare stacks and a gantry over the top. The landmark clears its own ground so it is never buried, and the district panel names both the trade and the landmark so the skyline is readable rather than decorative.

WHERE THE TRADE COMES FROM, which is the part that makes this a readout rather than a decoration. Three sources in priority order: the mayor's nominated favoured trade, the explicit political choice; failing that, whatever the district's storefronts actually trade in most; failing that, a stable per district default so a city under colonial administration still reads as a varied place on day one. So a district arrives with a character, and then visibly changes shape as players specialise it.

HOW IT WAS SIGNED OFF. Built first in a standalone harness rendering real server geometry, with six directions and live dials, because the one thing that cannot be verified in a headless test is whether something looks good. The direction was chosen there and ported here at the settings it was approved at.

VERIFIED: every colony at every development level with every trade forced, plus the shop derived path and the no data path, 6 of 6. The paint volume is asserted, not just the absence of throws, which is what caught the port initially drawing almost nothing: the forms call a two ended box primitive the game did not have, so they were failing silently inside a catch. Ops went from 87 thousand to 3.8 million once fixed. All existing suites unchanged: structure 12, layout 14, css scope 7, frame 11, render 14, ui 18, server 28.

Changed files: client/assets/city.js, client/version.json.

---

## v1.3.3.1 (2026-07-23) - Repair the page layout (CLIENT, TEST BUILD)

Client only. Hard refresh. No server change, no migration.

WHAT BROKE. The chat column left the three column grid and became a full width block across the bottom of the page, dragging the whole shell out of shape. Nothing about the layout was intentionally changed; the markup was simply invalid. Moving the Cities pane between builds removed the old container by searching forward for the next closing div tag, which matched the INNER div's closer rather than the outer one, leaving the outer closer orphaned. That happened twice, in the 1.3.1.2 move and again in the 1.3.3.0 move, so the document carried two extra closing tags. Each one closes an ancestor early, and the browser's error recovery then reparents everything that follows. The centre panel closed before it should have, so the chat panel that belongs in the grid's third column ended up as a sibling of the grid instead.

FIXED. Both orphans removed. The document balances at 724 open and 724 close, matching stock, and the grid shell is byte identical in shape to the untouched build.

GUARDED, and this is the check that should have existed from the first markup edit. A new test parses the current index.html and the pristine one side by side and asserts the div tags balance, the layout grid still has the same number of columns, and that the chat panel and every tab pane sit at the same nesting depth they do in stock. Verified by reintroducing one orphan: it reports the grid growing from three columns to six and the chat panel dropping a level, which is exactly the symptom on screen.

NOTHING ELSE CHANGED. The Cities sub tab, the map sizing and the collapsible panels from 1.3.3.0 are untouched and still pass their own suites.

Changed files: client/index.html, client/version.json.

---

## v1.3.3.0 (2026-07-23) - Cities becomes a Galaxy sub tab, and the map gets the room (CLIENT, TEST BUILD)

Client only. Hard refresh. No server change, no migration.

WHERE IT LIVES. Cities is no longer a top level tab in the main row. It is a sub tab inside Galaxy, beside Factions, rendering as a proper pane alongside Sector Map, Markets, Smuggling and Contracts. The previous build had it in both places at once, which was the wrong answer twice: a duplicate entry point, and the duplicate sitting in the row reserved for whole sections of the game rather than for views of the galaxy. Cities are a galaxy concern and they now sit with the rest of the galaxy.

THE MAP IS THE LARGEST THING. It was the smallest. A permanent 210 pixel colony rail on the left and a 320 pixel detail column on the right left the map with about a third of the width, and the canvas was locked to a fixed 1180 by 720 frame that then had to be letterboxed into that column, so the city was drawn small inside a small box. Three changes. The colony rail now collapses to zero width and is opened on demand by a SWITCH COLONY control in the header, so by default the map has the rail's space; picking a colony closes it again automatically. The detail column is trimmed to 300 pixels. And the canvas now fills its container in both dimensions, with the isometric projection solved at fit time to place the world plate and its building headroom inside whatever box it is given.

That last part is the one that matters most. Previously the scale, origin and height factor were four hard coded constants tuned for one canvas size. They are now derived: the projection measures the plate's extent in projection space, works out the largest scale that fits both axes with room for the tallest towers, and centres it. Measured across four box shapes the plate now spans 81 to 96 percent of the available width and covers over half the total canvas area, against roughly 74 percent of a canvas that was itself a third of the screen before.

VERIFIED: a new frame harness drives the fit routine at four container shapes against live server geometry and asserts the plate stays inside the canvas and fills most of it at each. A new layout harness asserts Cities is absent from the top row, present in the sub tab row, that its pane is a sibling of the other sub panes, and that the grid gives the rail zero width by default. 11 and 14 checks. Existing suites: UI 18 of 18, css scope 7 of 7, server 28 of 28.

Changed files: client/index.html, client/assets/city.js, client/assets/galaxy.js, client/assets/core.js, client/version.json.

---

## v1.3.2.0 (2026-07-23) - Zoom, scroll and collapse on the Cities tab (CLIENT, TEST BUILD)

Client only. Hard refresh. No server change, no migration.

ZOOM AND PAN. The city map now behaves like the galaxy map, because that is the interaction already in the game and there is no reason for a second one. The wheel zooms toward the cursor rather than the centre, dragging pans, and one finger pans with two to pinch on touch. There are also plus, minus and reset buttons for anyone not using a wheel. Zoom is clamped between roughly half and six times. The star backdrop is deliberately left out of the transform so it reads as sky rather than sliding around with the plate, and a drag that moves more than a couple of pixels no longer also counts as a click, so panning across a district does not select it.

SCROLLING. The tab pane sits inside a grid whose ancestors are height 100vh with overflow hidden, so anything taller than the column was simply clipped at the fold with no way to reach it. The pane now has its own scroll region, and the colony rail and the detail column each scroll independently, so a twelve district capital with a long detail column no longer runs off the bottom of the page.

COLLAPSIBLE PANELS. Every panel in the detail column now folds, using the same chevron, the same markup and the same class names as Wire Credits and Leaderboard in the right sidebar. Folded state persists in localStorage and, importantly, survives a panel rebuild: the detail column is regenerated on every selection change and data update, so the global initialiser in index.html never sees these elements and the state is driven from the city module instead. Fold everything you are not using and the map gets the space.

VERIFIED: 17 checks covering all three, including that the fold survives a rebuild, that zoom actually changes the canvas transform, that it clamps at the ceiling, and that reset returns exactly to the base scale. Existing suites unchanged: render 14 of 14, css scope 7 of 7, placement 8 of 8, server 28 of 28.

Changed files: client/assets/city.js, client/index.html, client/version.json.

---

## v1.3.1.2 (2026-07-23) - The Cities tab rendered a blank page (CLIENT, TEST BUILD)

Client only. Hard refresh. No server change, no migration.

WHAT HAPPENED. Selecting the Cities tab showed an empty panel. The module was fine and the renderer was fine; the container was in the wrong place in the document. When the pane was added in 1.3.1.0 the insert was anchored on the end of a script block, which put it at body level near the god panel rather than inside the centre column that holds marketTab, galacticTab, miningTab and the rest. Clicking the tab therefore did exactly what it was told: it hid every other pane, leaving the centre column empty, and displayed the Cities pane at the bottom of the document outside the layout. The city was rendering the whole time, below everything, off screen.

WHY IT SHIPPED. It was verified with a grep for the container id and a jsdom render that injected its own markup. Both passed. Neither one looked at where the element actually sat in the real page, which is the only thing that was wrong.

FIXED. The pane is now a sibling of miningTab inside the centre column, at the same nesting depth as every other tab pane.

GUARDED. A new test parses the real index.html, finds the existing tab panes, asserts they share a single parent, and asserts the Cities pane shares it too, is not a direct child of body, and sits at the same depth. Verified both ways: it fails on the layout that shipped and passes on the fix. Structural placement is now checked rather than assumed from the presence of an id.

Changed files: client/index.html, client/version.json.

---

## v1.3.1.1 (2026-07-23) - The line across the page (CLIENT, TEST BUILD)

Client only. Hard refresh. No server change, no migration.

WHAT HAPPENED. Opening a city drew a thin green line across the whole page instead of a city. The cause is a CSS scoping mistake with a sharp edge. The city stylesheet was written with a SCOPE token substituted at injection time, and because the UI had two homes, the tab and the planet card overlay, the token expanded to a selector list: '#cityOverlay, #citiesTab'. A rule written as 'SCOPE .obar' therefore became '#cityOverlay, #citiesTab .obar'. Selector lists do not distribute a prefix, so that parses as two separate selectors: '#cityOverlay' on its own, and '#citiesTab .obar'. Every one of roughly fifty rules was applying its declarations directly to the overlay element. One of them was the owner share bar, height 3px. The overlay is position fixed with inset 0, so a 3px height collapsed it into a full width bar across the viewport. That was the line.

THE FIX, AND THE SIMPLIFICATION. Scoping now uses a single class, .fmcity, carried by the host, which has nothing to distribute and cannot mis-parse. More to the point, the second home is gone. The modal overlay is deleted: the Cities tab is the only place the city UI lives, OPEN CITY on a planet card switches to that tab and selects the colony rather than throwing a modal over the galaxy map, and the stylesheet is injected into head once rather than into a container. Two chromes sharing one renderer is what created the need for a two host selector in the first place.

NAVIGATION. A Cities entry now sits beside Factions in the Galaxy sub navigation. It is a jump-off rather than a pane, since cities have their own top level tab, but it is where somebody looking at colonies reaches for it.

GUARDED. A new test parses the generated stylesheet and asserts that every selector is scoped to .fmcity and that no rule targets a host element on its own, which is the specific shape of this bug. It also asserts the overlay element is never created. Seven checks, and it would have caught this before it shipped. The full tab render remains 14 of 14.

Changed files: client/assets/city.js, client/index.html, client/version.json.

---

## v1.3.1.0 (2026-07-23) - Cities get their own tab, a navigable UI, and a real skyline (CLIENT + SERVER, TEST BUILD)

TEST BUILD, continuing on 1.3.0.0. Server and client, pm2 restart and hard refresh. No migration.

ITS OWN TAB. Cities no longer live only behind a planet card. There is a Cities tab beside Galaxy, and it is now the primary way in. The overlay from the planet detail card still works and shares every renderer, so the two are the same screen in different chrome rather than two implementations.

NAVIGATION. The nineteen colony buttons that ate two rows and could not be scanned are gone, replaced by a colony rail down the left: sorted by population, each row carrying the class, how many seats are still open, and how many storefronts trade there. Open seats are the number a player is actually shopping for, so it is the one called out in gold. Districts moved from a scrolling column into a chip strip under the map, which puts a twelve district capital on one line. The right column now holds only what pertains to the selected district, and every panel is conditional: a section with nothing to say is not rendered at all, which fixes the empty bordered box that used to sit in the middle of the column whenever you were looking at a district you did not govern.

THE FRONTAGE. The storefront view stopped being a canvas grid and became a list, because the whole point of letting players name their shops is reading the names. Sorted by earnings, each entry showing the trade, the owner and the weekly net, with the description on hover.

A REAL SKYLINE. Buildings were flat boxes. Now every structure steps back as it rises, in one, two or three setbacks depending on height, which is most of what makes a skyline read as a skyline. Tall towers carry a lit mast; mid rise buildings get roof tanks. Windows light on a proper grid up the two visible faces instead of scattering at random, and the lit fraction tracks how many storefronts are actually trading in that district, so a busy quarter glows and an empty one is dark. Each building casts a contact shadow so it sits on the ground rather than floating. The gaps between blocks are drawn as streets. One block per district is promoted to a landmark at nearly double height, so districts have a focal point instead of an even carpet. All of it derives from a deterministic per block seed, so a district looks identical every frame and on every client.

FIXES. Five of the nineteen colonies carry faction 'contested', which is a state rather than a party. The seat handler compared it as if it were a faction, so those five worlds had permanently unbuyable offices and reported "Only contested members may hold office on this world." Contested worlds are now open to anyone, which makes them the natural ground for unaligned or outnumbered players. Stale copy describing lots and tier thresholds, left over from the model two rebuilds ago, is gone.

VERIFIED: the tab renders in a real DOM against live server payloads, 14 of 14, checking that the rail lists all nineteen colonies, the strip matches the district count, no panel renders blank, and no stale or undefined text reaches the screen. Server suites unchanged at 28 of 28, 7 of 7 and 10 of 10.

Changed files: client/index.html, client/assets/core.js, client/assets/city.js, server/server.js, client/version.json.

---

## v1.3.0.0 (2026-07-23) - Cities are permanent, office is what players buy (SERVER + CLIENT, TEST BUILD)

TEST BUILD. Server and client, pm2 restart and hard refresh. ONE-WAY MIGRATION on first boot.

ALSO IN THIS BUILD, three things caught during the rebuild and fixed before you touch it. CONTENT FILTERING now gates every piece of player authored text: shop names and descriptions, district names, fund names and descriptions, and player names at registration and rename. It runs three passes because each alone had a hole. The banned word list matches substrings but not digit substitution; containsSlur in chat filter handles digits and separators but anchors on word boundaries, so padding a slur with a suffix walked straight past both. Normalising leet and re-running the substring list closes it. A companion tool, server/audit_names.mjs, walks every authored field already in the database and REPORTS what fails, deliberately renaming nothing, because false positives on real names are common and silently renaming somebody's fund would be worse than the problem. It exits non zero when anything is flagged, so it can gate a deploy.

THE LIMIT ORDER ERROR ON EVERY BOOT is gone, and the diagnosis was wrong. A duplicate restore block sat above the declarations of limitOrders and ORDER_EXPIRY_MS and threw a temporal dead zone ReferenceError every single start. The throw was caught and swallowed, and the real restore ran correctly a few hundred lines further down. Open orders were never being lost; the only symptom was an alarming log line. Verified by seeding an order, restarting, and watching it come back. Dead block removed.

SHIP.SH gains a server side guard. The local divergence check was already there and already better than a plain pull, since apply.sh leaves the tree dirty. What was missing was the other end: a file edited on the VPS aborts the pull halfway and leaves a confusing failure. The deploy line now checks for local modifications first, reports them with the fix, and uses ff only so production can never grow a merge commit.

WHAT WAS WRONG. Two releases sold ground: 1.2.6.0 let players claim lots, 1.2.7.0 let them lease floor space inside those lots. Both inherited the same defect, which is that a planet has a fixed number of parcels. Four thousand seven hundred and eighty eight lots existed across the whole galaxy against a concurrency target of eight thousand, so the mechanic sold out permanently rather than getting expensive, and every fix piled another layer on a foundation that could not hold weight. Worse, player owned ground could be razed into rubble that nobody could ever use again, which meant a busy war would silt a planet up with dead parcels.

WHAT REPLACES IT. Cities are permanent world objects and they arrive already built. Every colony carries between three and fourteen DISTRICTS depending on how many citizens it has, so New Anchor reads as a twelve district metropolis and Frontier Outpost as a five district settlement, and each of those districts is developed on arrival to a level its population justifies. One hundred and forty eight districts exist galaxy wide and none of them are empty, because the citizens built the place long before any player drew a wage there. What players buy is the MAYORAL SEAT, the way the Presidency is bought rather than homesteaded. Nothing about a city depends on a player existing.

THE LADDER. A seat is priced exponentially against the district's population development, which is the whole progression: Frontier Outpost costs F16.6M and pays back in about twenty one weeks, Dust Basin F39.8M, Vein Cluster F229M, and a New Anchor borough F1.32B against a two hundred week hold at baseline. You start somewhere cheap, you govern it well, you work up. Opting straight into a built out metropolis costs eighty times what the frontier costs, and that gap is the point.

CONTESTED, BUT NOT SEIZED. Any seat can be taken, which is the President mechanic and it carries over. Three things had to break from that model, all for the same reason: the Presidency is one office nobody has invested in, and a district is one hundred and forty eight offices someone has been building for months. Flat pricing is gone, since a seat costs what it governs. Uncompensated ousting is gone, because being able to take a district somebody developed for a flat fee would mean nobody ever develops anything; the buyer pays the full price and the sitting mayor recovers a share of what they INVESTED, never of the base price, so an ousted mayor can never walk away with more than they spent. An earlier pass priced the seat off total development instead, which meant a F2.2B investment on a high baseline district pushed the seat past a trillion and paid out compensation to match. That was a money printer and the harness caught it before the client existed. And ousting is not the only turnover: a mayor who cannot pay their civic bill accrues arrears, and four weeks of them vacates the seat back to colonial administration. That is the valve that keeps the political map moving on planets no war ever reaches.

NOTHING TURNS TO RUBBLE. A lapsed or conquered district reverts to NPC administration and drifts back toward its population baseline. Occupation salvage now strips only what mayors built; the citizens and their baseline city are not strippable, because they did not evaporate. A sacked city is poor, not erased, and there is always something left to govern.

MAYORAL PERKS. Policy levers are per district now rather than per colony, so twelve mayors on one planet can pull in twelve directions and a well governed borough visibly diverges from the neglected one beside it. A mayor also sets their COMMERCE RATE inside a five to twenty five percent band, which makes districts compete: undercut your neighbour to pull their tenants across, or tax hard and live off fewer, wealthier shops. They nominate a FAVOURED TRADE that earns thirty five percent more in their district while everything else takes twelve percent less, which turns a quarter that organically filled with grocers into a deliberate market quarter. And they can RENAME the district.

STOREFRONTS. Uncapped per player, opened by anyone in anyone's district, and now PLAYER NAMED with a description alongside the category the economy actually reads. A Turkish player opens a Kebab Shop, classifies it as food, and the name is what everyone else sees on the frontage strip. Category is mechanical, name is flavour, so nobody names their way into an advantage. Each further storefront one player holds in a district earns less than the last, so a handful is the natural holding and a newcomer's first always out earns a veteran's twelfth.

DEVELOPMENT ACTUALLY PAYS NOW. A first pass had development add storefront capacity without adding customers, so building only diluted the tenants already there and F2.2B of investment moved the commercial pool by F2.9M a week. The pool now scales against the district's baseline rather than by a flat per level bonus, so a district developed well past its natural size genuinely is a bigger market. On New Anchor a single development level costs F15M and pays back in seven weeks; five levels cost F842M and pay back in seventy four.

VERIFIED: 28 of 28 over live WebSocket on seats, perks, development, named storefronts and bounds checking, plus 10 of 10 on the ouster and lapse paths including confirmation that compensation is always less than what was invested and that a lapsed district keeps its buildings.

NOT INCLUDED: landmarks. Mayor authored district notices. Storefront specialisation.

Changed files: server/server.js, server/city.js, server/db_city.js, client/assets/city.js, client/version.json.

---

## v1.2.7.0 (2026-07-23) - Storefronts: the city stops being a closed system (SERVER + CLIENT)

Server and client. Requires a pm2 restart and a hard refresh. Additive schema (city_shops), no migration.

THE PROBLEM THIS SOLVES. There are 4,788 lots in the entire game, 253 of them in New Anchor, against a concurrency target of 8,000. One holding per player per city meant the mechanic sold out permanently: the 254th person who wanted the capital was not priced out, they were locked out, and no amount of money would ever change that. Cities were a closed system with a fixed number of seats.

GROUND IS FINITE, FLOOR SPACE IS NOT. Every built holding now rents STOREFRONTS. Slots scale with tier (one at T1, nine at T5, twenty five at T11), so a developed New Anchor exposes over two thousand of them where it had 253 lots. Anyone can lease space in any building, including one they do not own and including their own. Leasing transfers no title, so the one-lot cap and the community-arcology principle both survive intact: a whale can fund every storefront in a sector and still not own an inch of it.

THE NPC MARKET IS ALWAYS A BUYER. There is no counterparty risk and no timing game. You never open a shop and find nobody selling, and you never lose because you picked the wrong week. What is scarce is the city's APPETITE. Total consumer spend is a fraction of the city's built value modulated by prosperity and output, so developing the city expands the pie rather than splitting a fixed one, and the mayor's levers now set the size of every tenant's market. Demand splits across the four trades and tilts toward whatever the city is short of, which makes "city needs over time" literal: it moves over weeks, readable as a trend, never as a tick to time.

WHY IT DOES NOT RUN AWAY. Three forces, all verified in the harness. A per-shop ceiling scaled by the host building's tier stops an empty city handing one shopkeeper the entire consumer economy: without it the first storefronts paid back in three weeks, which would have been the best investment in FleshMarket by a factor of fifty. Above roughly 200 storefronts the pool binds instead and per-shop income falls with occupancy, so the market finds its own equilibrium around 400 to 800 in a developed capital. And each additional storefront one player holds in one city earns less than the last, implemented as a weight inside the pool rather than a multiplier after it, so the pool always conserves. In a city at 400 storefronts a player's first earns F269k a week and their twelfth earns F47k, which means a newcomer's first storefront out-earns a veteran's twelfth by nearly six to one. Nobody needs a rule to stop hoarding; the curve does it, and it leaves the tail open for whoever arrives next.

LANDLORDS AND TENANTS. A quarter of every storefront's gross goes to whoever owns the building. A fully let tier 5 holding earns roughly F800k a week in rent on top of its own F1.37M yield, which is the first mechanic that pays a builder for building TALL rather than merely building. Landlords want tenants, tenants want a well run city, and both now depend on the mayor. Rent on an unowned or seized holding is simply not paid.

SIEGE. Blockade does not remove the buyer, it starves them. Verified over a six week full blockade of a developed capital: consumer spend collapses from F149M to F23.5M a week, general retail falls 93 percent, and grocers fall 81 percent because scarcity tilts demand toward the trade the city is desperate for. Everyone loses, essentials lose least, and the NPC market stays open the whole way down. Shops die with the floors they sit in when an occupier strips a building, and the entire commercial layer is cleared when a city is sacked.

NOT INCLUDED: landlord-set rent rates, which want a real tenancy market to be interesting and would arrive with vacancy competition; shop specialisation or upgrades, so a storefront is currently a flat instrument; storefronts rendered on the sector plan view; a city index fund, which is the passive-exposure version of this and can reuse the Capital House NAV machinery including its shared-pool anti-rug structure.

FLAGGED: this is a new money faucet. A developed city prints up to F139M a week in consumer spend that did not exist before, roughly 67 percent on top of its landlord layer. Cities will not all develop at once, but the aggregate wants watching against mining and trading income before many cities mature.

Changed files: server/server.js, server/city.js, server/db_city.js, client/assets/city.js, client/version.json.

---

## v1.2.6.0 (2026-07-23) - Cities rebuilt on polygonal sectors (SERVER + CLIENT)

Server and client. Requires a pm2 restart and a hard refresh. ONE-WAY MIGRATION on first boot, see the last section.

WHY A MINOR BUMP. The 1.2.5.25 city was a 14x10 grid of squares. Rectangles read as machine output; the model the design work actually settled on was districts. Every colony now generates eleven VORONOI SECTORS by half-plane clipping, and the layout is no longer a box packing but a question of where the seeds sit, so cell shapes differ structurally between worlds. Six seed distributions (radial, spine, grid, archipelago, terraced, organic) across six terrains (orbital tether, station deck, ice channel, rift, ore veins, dust basin). New Anchor runs radial on a tether, Frontier Outpost is an archipelago on ice, The Hollow is terraced over a rift. Lots sit on a grid rotated per sector, which kills the last of the squareness, and ice worlds refuse to build in the melt channel. Verified: all 19 colonies produce exactly 11 sectors, 158 to 276 lots each, median 21 lots per sector.

THE STAGE LADDER. A sector is no longer a container, it is a thing that grows. Five stages above vacant: SETTLEMENT (scattered low structures), DISTRICT (blocks fill, towers rise), PLATFORM (the sector is decked and the towers share one raised podium), CONURBATION (footprints swell and fuse, a central mass takes over), ARCOLOGY (one sealed superstructure, stepped to a spire, every owner holding a floor band). Stage is DERIVED from the lots, and the gates are fractions rather than averages: PLATFORM needs 60 percent of the sector's lots at tier 5 or above, ARCOLOGY needs 80 percent at tier 9. One whale maxing a single lot cannot move the stage. Combined with the cap below, this means no individual ever builds an arcology: the superstructure is a monument to a community.

ONE HOLDING PER PLAYER PER CITY. A sector holds twenty to fifty lots and reaches its top stage only when a dozen owners develop in parallel, which gives the sector a natural political unit, the people who own inside it. Consequence worth stating plainly: there is no lot resale or transfer yet, so a badly chosen lot is a stuck position until the tier ladder or a war moves it. That is a real gap, not an oversight.

COSTS AND INCOME. The build curve runs F1.8M x 2.4^tier, so tier 1 is cheap enough to enter on a first payday and a maxed tier 11 holding is F19.6B cumulative before the colony multiplier. Income is now a straight fraction of built value, about 0.1 percent per day in a well run city, which is deliberately slow and is the number the whole salvage economy below is balanced against. Payback is roughly flat across tiers at 172 weeks at output 84, so tier choice is a question of how much capital you want working rather than a rate arbitrage.

WAR MATH, CORRECTED. The prototype stripped 10 percent of book, and the harness showed that was profitable vandalism: above roughly F193B of book a raider could take a city, strip it, and walk away ahead, having destroyed several times that in other players' work. Salvage is now 1/20, gated behind a SEVEN day hold rather than fourteen, still one tier per day. Taking a colony that carries a city now also costs a WAR FUNDING SURCHARGE of 4.42 x book^0.75 per control point on top of the flat rate, so the price of conquest scales with what is standing. Verified across the range: a F25B city costs F4.2B to take and yields F1.3B stripped, a F1.84T hive costs F104.7B and yields F92B. Raider net is negative at every book value tested. Occupiers who hold and operate still profit, raiders who raze do not, which is the fork the design wanted.

RENDERED FROM SERVER TRUTH. The old client mirrored the layout generator verbatim, the solitaire pattern. That is now retired for cities: the server generates the geometry once per colony, caches it, and SENDS the polygons in city_data (about 17KB). The client draws what it is given and never regenerates, so there is no cross-engine float divergence to keep in sync. Lots are addressed (sector, lot index) and stored in the existing city_lots q and r columns, so no schema change. The client draws an isometric prism city with per-zone arcology forms, owner colour bands up the superstructure, skyways between close sectors, faction tint and contested dashes, plus an interior view: a plan of individual holdings below PLATFORM, and at CONURBATION and above a vertical section showing the same owners stacked as floor bands. Nothing is merged in the data, only in the render.

MIGRATION, ONE WAY. Grid coordinates have no meaning on the new map, so on first boot every lot claimed under the old layout is REFUNDED AT FULL INVESTED VALUE to whoever built it and the table is cleared. Charters are colony-level and survive untouched. The refund is generous on purpose: nobody loses money on a change they did not choose. It is flagged in a new city_kv table so it cannot run twice, verified idempotent across two boots, and it credits the original builder even for lots that had been seized. This cannot be rolled back by reverting the build.

NOT INCLUDED: Jade colonies (still outside colony_state); a conqueror-side path to buy a seized charter instead of stripping it; lot resale or transfer, which the one-holding cap makes more pressing than it was; NPC street gangs and emergent political events. Sector zones (commercial, residential, industrial) currently drive the arcology's shape and nothing economic; coupling them to lot use is the obvious next pass. The supply constant was retuned for the new book scale and is a first pass: a blockaded unfarmed city loses 59 percent of output in three weeks, a farmed and subsidised one 15 percent.

Changed files: server/server.js, server/city.js, server/db_city.js, client/assets/city.js, client/version.json.

---

## v1.2.5.25 (2026-07-23) - City Charters prototype: player-owned cities on colony planets (SERVER + CLIENT)

Server and client. Requires a pm2 restart and a hard refresh. Additive schema (city_state, city_lots), no migration against existing tables.

THE LOOP. Every seeded colony except Flesh Station and Abaddon carries a city. One player holds the CHARTER (the mayor): they set five policy levers, collect 12 percent of export GDP, and pay the civic bill, which scales with population. Anyone can CLAIM lots on the district map and upgrade them tier by tier at exponential cost, roughly a billion Social Credits cumulative to tier 10 on a mid-size world. Lots run one of four uses: Export pays the owner, Agri, Medical and Tech feed the city itself. Switching use costs 48 hours of downtime, which is deliberate: when a blockade lands, farms cannot appear overnight, and that lag is the crisis window.

THE MODEL. Six coupled scalars (crime, unrest, corruption, prosperity, legitimacy, output) relax toward targets driven by the levers, with an NPC administration floor so an untended city degrades rather than zeroing. The coefficient set was solved against three verified endpoints from the design harness: a police state crushes crime to about 10 but drives unrest past 90 and stalls output near 40; total neglect lets crime hit the 90s and collapses output to single digits; heavy services runs unrest around 20, output in the mid 80s, prosperity above 90 and pays the mayor the most. Every lever helps one thing and hurts another. Supply is population-scaled demand for food, med and tech; imports cover the local shortfall unless the colony's lanes are blockaded, in which case an unfarmed city loses roughly two thirds of its output inside three weeks while a properly farmed and subsidised one barely moves. The subsidy lever is the mayor's answer: it raises what civic lots are paid, at the mayor's expense.

MONEY. All flows are weekly figures paid in hourly slices by the city tick. A mayor is never driven negative: they pay what they have and the unfunded remainder degrades the city instead, floored so one bad cycle cannot zero a four year build. Charter and lot purchases are pure money sinks, priced off population (a frontier charter runs about F130M, the New Anchor capital past F500M), and investment raises population over time, which raises every subsequent cost and the standing civic bill. This is the end-game sink from the original design brief: cash buys the buildings, only attention produces the exports that pay for them.

WAR. Conquest is upheaval. When a colony flips faction, the city is seized unless the charter owner belongs to the conquering side: lots lose their owners, the charter suspends, and a 14 day clock starts. Retake the colony before it matures and everything restores to the original builders. Fail, and occupation forces strip one tier off every lot per day, paying 10 percent of the demolished book into the colony war chest until the city is levelled and the charter reopens. A city in sustained revolt (unrest above 70) also nudges colony tension upward a few times a day, so a badly run city literally invites the war that destroys it.

SERVER-AUTHORITATIVE THROUGHOUT. Same trust model as casino_play: the server owns every price, validates every claim against the deterministic district layout, and the client only sends intent. The layout generator (seeded mulberry32 per colony, the solitaire pattern) lives in server/city.js and is mirrored verbatim in client/assets/city.js between MIRROR markers; cross-checked identical across all 19 colonies. Wrong-faction charter purchase, double-claims, non-owner upgrades and non-mayor lever changes all verified rejected over a live WebSocket.

BALANCE IS A FIRST PASS, by design. Known open knobs, all constants in CITY_TUNE: heavy services currently pays the mayor the most, so the whale reflex partly survives (the civic cost curve should bite harder at the top); tier 5 lots pay back in roughly 16 weeks against 66 at tier 10, so wide beats tall until a city's finite 60 to 93 lots run out; and nothing caps one player buying an entire district, on the theory that capture risk is the counterweight. Retune from the live ledger.

NOT INCLUDED: Jade colonies (still outside colony_state, per the 1.2.5.24 note, cities attach to colonies); a conqueror-side mechanism to buy a seized charter instead of stripping it; NPC street gangs and emergent political events from the original brief; city visuals beyond the district grid (the parallax city art remains a separate pass).

Changed files: server/server.js, server/db.js, client/index.html, client/assets/galaxy.js. New files: server/city.js, server/db_city.js, client/assets/city.js.

---

## v1.2.5.24 (2026-07-22) - God Panel world gates: Jade passage and commodity trading (SERVER + CLIENT)

Server and client. Requires a pm2 restart, not just a hard-refresh.

WORLD GATES, in the Control tab. Control is the world-state tab (market freeze, volatility, transfer tax), so the two new switches sit with the rest of the GM levers rather than in News, which is headline authoring.

JADE PASSAGE. The endpoint already existed at /api/dev/wormhole and had simply never been given a control, so sealing the passage was a curl command. It now has a button. Sealing delists the Jade tickers from the tape for every connected player and blocks Jade trades; open positions are left intact rather than liquidated, so a seal is a market closure, not a confiscation. The seal is behind a confirm because it fires at every connected client at once.

COMMODITY TRADING HALT, new. COMMODITIES_OPEN gates the buy and sell endpoints, which reject with 423 while halted.

Two deliberate limits on its scope. It does NOT touch cargo in transit or runs already launched: halting those mid-flight would destroy player cargo, which is not what a market halt means. And the flag is in-memory, so it resets to open on restart. A halt is a live GM intervention; the world should not silently boot into a halted market after a crash at 3am. If it ever needs to survive a restart it belongs in a settings table, not a module-level let.

The panel reads both switch positions from a new /api/dev/gates on tab open rather than tracking what it last clicked, because the server is authoritative and a second dev, or a restart, can move them underneath the panel.

PLAYER-FACING: a halted buy or sell previously surfaced as a generic Buy failed, which reads as a bug rather than a closure. It now says trading is halted, in both languages.

Also fixed while in that code: the sell error chain still had a raw English no_ship string that an earlier localization pass missed. It was only reachable when selling without a ship, which is why no screenshot caught it.

NOT INCLUDED, and it is the prerequisite for cities on Jade planets: the Jade colonies are still client-side map data. They are not in colony_state, there is no control_jade column, and the passive-income colony bonus iterates the four seeded factions. Cities attach to colonies, so seeding them is the first move of the city pass rather than something to tack onto a UI release, since it is a schema migration against a live database with player data.

Changed files: server/server.js, client/index.html, client/assets/god-panel.js, client/assets/core.js, client/assets/galaxy.js.

---

## v1.2.5.23 (2026-07-22) - Jade Circuit: faction rewrite, joinable, colony and exchange copy (SERVER + CLIENT)

Server and client. Hard-refresh after deploy.

FACTION DESCRIPTION replaced with the authored text. The old bonusSummary promised that Jade Exchange listings and Circuit allegiance activate when the wormhole is unsealed, which was never true of the code, and is now gone. It reads as what the Circuit actually holds: the Exchange listings and the passage.

One correction to the supplied text: "the houses runs directly" is now "the houses run directly".

THE CIRCUIT IS JOINABLE. The Jade card had no join control and the server allowlist did not include jade, so the faction was scenery. Both fixed.

Read this before shipping it, because joinable is not the same as competitive. The Jade colonies are client-side map data. They are NOT seeded into colony_state, there is no control_jade column, and the passive-income colony bonus iterates the four seeded factions. So a Jade member earns base passive income and no colony bonus, because the Circuit holds no colonies the server knows about. Allegiance works. Territory does not. Jade was deliberately NOT added to the faction-funding allowlist for the same reason: funding the Circuit would take the money and change nothing, which is worse than not offering it.

That gap is coherent with the lore while the passage is sealed, but it does mean Jade is currently a flat choice rather than a competitive one. Making it real is four pieces of server work: seed the 16 colonies into colony_state, add a control_jade column with a migration, include jade in the leading-faction reduce and the colony-count bonus, then add jade to the funding allowlist. That is its own release.

COLONY LORE, all 16, English and Chinese. The previous entries mentioned hereditary lineage in every single one: hereditary accounts, ancestral accounts, family registers, cadet branches, family shrines, portraits along the assembly floor, billing to the bloodline, berth priority by lineage. Repeated sixteen times it stops reading as a culture and starts reading as a tic. Lineage now appears only where it carries weight: the faction description and Yujing, the capital. Everything else is what the place is, what it produces, and the trade-relevant control fact, which is the register the Coalition colonies already use.

JADE EXCHANGE COMPANY DESCRIPTIONS, all 20, English and Chinese. Same problem and same fix. The Coalition entries are direct and formal, a line of operational fact with a dry close. The Jade entries were prose-heavy and lineage-obsessed. Rewritten to match the Coalition register.

Audited rather than eyeballed: no lineage vocabulary remains in any non-capital Jade colony entry in either language, and every rewritten Chinese string was checked to contain Chinese rather than a silently untranslated fallback.

Changed files: server/server.js, client/assets/galaxy.js, client/assets/core.js.

---

## v1.2.5.22 (2026-07-22) - Language selection on login, and switching now reloads (CLIENT)

Client only. Hard-refresh after deploy.

LOGIN MODAL LOCALIZED. The Flesh Market and Create Account titles and the Name and Password field labels. The buttons were already wired in 1.2.5.18, which is why they read Chinese while everything above them did not.

LANGUAGE SELECTOR ON THE LOGIN MODAL. An English / 中文 pair above the title, showing which is currently active. Both labels stay in their own language rather than being translated, because someone who cannot read the current interface still has to be able to find the one they want. This modal is the only place where switching is free: nothing has rendered and there is no session to lose, so it switches without asking.

SWITCHING LANGUAGE NOW RELOADS. The old toggle patched the live page: applyI18n over data-i18n elements, plus whatever re-render hooks existed. That was always going to be partial. Any panel already built by a lazily loaded module keeps the strings it was built with until something rebuilds it, so the result was a screen that was half translated in a way that depended on which tabs the player happened to have opened first. Reloading makes language a boot-time fact rather than a runtime patch, and index.html already reads the stored value before first paint, so the new language is in place before anything renders.

The cost is real and is not hidden. A reload drops in-flight client state. Unbanked mining cargo is client-held, so setLanguage checks _fmRunInProgress first (mining fullscreen host visible, or an active smuggling or shipping run) and asks before reloading. Declining aborts cleanly: nothing is written to storage and no reload happens, so there is no half-applied state. The login-modal path passes skipConfirm, since there is nothing to lose there.

The old live-patch path is still available as setLanguage(lang, {noReload:true}) for anything that needs it later.

Runtime-tested rather than assumed: with no run in progress the call stores fm_jade_theme and reloads; with a run in progress it prompts, and declining leaves storage untouched and does not reload; with skipConfirm it reloads directly.

Verifier state: all seven checks zero.

Changed files: client/assets/core.js, client/assets/fm-auth.js.

---

## v1.2.5.21 (2026-07-22) - Localization: company detail, market upgrades, cycle history, chat badge (CLIENT)

Client only. Hard-refresh after deploy.

Company detail card (market-tools.js). Company name now routes through CO_NAME_ZH, the sector badge through sectorNameZh, the HQ label and colony, the dividend-eligible and no-base-dividend tags, and the Position and Short labels.

The HQ field needed a new hop. It carries the colony DISPLAY name, not the colony id, so colonyNameZh could not resolve it. Added COLONY_ID_BY_NAME, a name-to-id map generated from COLONY_META covering all 37 colonies, and colonyNameByEn on top of it. Generated from the source data rather than hand-typed, so it cannot drift from COLONY_META.

Market upgrades (market-upgrades.js). Panel title, the three upgrade names and descriptions, the Auto-Accumulate sub-panel heading, the OWNED tag and the loading state. The catalogue lives on the SERVER in db.js, so the client keys translations by upgrade id, which is the identity used by market_upgrade_buy. Only name and desc are display strings; nothing that crosses the wire changed.

Cycle price history modal (cycle-history.js). Title and subtitle, the Range label, From and To, the search placeholder, the select-a-ticker empty state, and company names in the ticker list through CO_NAME_ZH.

Chat channel badge (index.html). Both the initial render and the per-channel update, with channel names keyed so global, trade, faction and dunce all translate rather than only the word room.

Day-trade counter (trade-limit.js) and the no-open-orders state (sound.js).

DEV LOGS SUBTITLE, and the reason it survived the last pass: 1.2.5.19 wired the JS that sets that text when a sub-tab is clicked, but the static markup carried the English with no data-i18n attribute. So it translated only after the player interacted with the tab, and read English on first paint. Both the subtitle and the Open channel link now carry data-i18n. Worth noting as a pattern: text that is both present in markup AND assigned from JS needs wiring in both places, and testing it means looking at first paint, not at the state after a click.

Verifier state: all seven checks zero.

Remaining: codec-data.js, the Corpo-Cards rules encyclopedia, the standalone drone-mining game, and the dev-only god-panel.js and dev-comms.js. Company names outside CO_NAME_ZH's coverage will still read English wherever that map has no entry.

First-pass CN throughout. Native review advised.

Changed files: client/index.html, client/assets/core.js, client/assets/market-tools.js, client/assets/market-upgrades.js, client/assets/cycle-history.js, client/assets/trade-limit.js, client/assets/sound.js.

---

## v1.2.5.20 (2026-07-22) - Localization: mining help, price alerts, market controls, faction names (CLIENT)

Client only. Hard-refresh after deploy.

Second round of gaps found by playing rather than grepping.

Drone mining help panel (index.html). The How Mining Works heading, the leaderboard caption, and all twelve rows: Movement, Mining, Combat, Heat, Factions, Scrap, Depth, Docking, Dying, Refineries, Escorts and Ships, label and body. Mining and Heat already had labels wired from an earlier pass, which is why those two read Chinese while the rest did not.

Price alerts (market-tools.js). Panel heading, the Symbol and Price inputs, the Above and Below conditions, the Set button and the empty state.

Market panel controls. Watchlist (market-tools.js), History and its tooltip (cycle-history.js), and Index Funds with its tooltip, subtitle and empty state (index-browser.js).

FACTION NAMES, which were the largest visible gap. Faction display strings were still English in four places: the system-view control bars, the colony-panel control bars, the Fund a Faction buttons and the funding toast. All now route through a single facZ resolver reading FACTION_ZH, and short names were added to that map. One resolver rather than four call-site fixes, so the galaxy map, the system view, the funding panel and the TCG cannot drift apart on what a faction is called.

Blockade panel empty state.

Passive-income chat line. The server assembles that sentence in English, but the same payload also carries base, bonus and total as numbers. Rather than translate the sentence or parse it, the client rebuilds it from the numbers when the language is Chinese. A server-side wording change cannot leave stale Chinese behind. Relative chat timestamps now translate too.

TWO PROCESS FAILURES THIS PASS, both mine, both worth recording:

A build script aborted on one bad anchor and wrote nothing, discarding the facZ resolver, while a later script successfully wrote three call sites that depended on it. facZ ended up called seven times and declared zero times. This is the second occurrence of that exact pattern, after renderFactionList in 1.2.5.16. The rule going forward: an aborted batch means re-run the whole batch, never the remainder.

The scope checker did not catch it, because facZ was not on its hand-maintained alias list. Widening that list to auto-discover helpers made the checker WORSE: with the fault present it reported four problems, with the fault removed it reported one. A checker that reports fewer faults after a fault is introduced is worse than no checker, so the brace-walking scope resolution was abandoned rather than patched further. It has been replaced with a coarser check that is correct: an identifier called but not declared anywhere in that file. It cannot catch a helper declared in the wrong function, which would need a real parser, and the file says so. Both false-positive rate and negative test are now clean: zero on the current tree, and deleting facZ names exactly that call site while node --check still passes the file.

Verifier state: six checks in i18n-check plus the rewritten scope check, all zero.

Remaining: codec-data.js, the Corpo-Cards rules encyclopedia, the standalone drone-mining game under client/assets/drone-mining/, and the dev-only god-panel.js and dev-comms.js.

First-pass CN throughout. Native review advised.

Changed files: client/index.html, client/assets/core.js, client/assets/galaxy.js, client/assets/market-tools.js, client/assets/cycle-history.js, client/assets/index-browser.js, tools/i18n-scope-check.js.

---

## v1.2.5.19 (2026-07-22) - Localization: mining splash, Fleshbook, Corpo-Cards, dev logs, header, heatmap (CLIENT)

Client only. Hard-refresh after deploy.

Seven surfaces that were still rendering English under the Jade toggle, found by playing the game rather than by grepping it.

Drone mining splash (index.html). The eyebrow line, title, tagline, both lore paragraphs, the four stat labels, the drone-refund line, the three faction names, the launch button and the footer note.

Fleshbook (fleshbook.js). Header and PUBLIC FEED label, the LIVE indicator, compose placeholder and BROADCAST button, the character-count hint, the NEW and TOP sort tabs, the empty state, PINNED and FLESH CORP tags, the boost tooltip, the reply placeholder, and the cooldown, failed and broadcast-failed messages.

Corpo-Cards (tcg/tcg-app.js). The Arena subtitle, all six tabs, the play-picker intro, starter deck names, the faction and card-count sub-line, the prebuilt tag and the Play button. Faction labels resolve through the existing FACTION_ZH map rather than a second table, so the TCG and the galaxy map cannot drift apart on a faction's name.

Dev Logs tab (index.html). Header, the subtitle and channel link (both set from JS, so wired at the assignment), and the Videos and Live on Kick sub-tabs.

Header buttons (index.html). Patreon, Discord, Bugs, Jade and Tutorial. Logout was already wired.

Heatmap sector lore (sound.js). All eight sector names and their sub-lines. Rebuilt per read through a HEAT_LORE accessor rather than translated in place, so the language toggle takes effect without a reload.

Contracts board (galaxy.js). Commodity names on the offer table now route through COMMODITY_ZH, and _colonyName routes through colonyNameZh, which also fixes the Route column on the lane shares table below it.

TWO DEFECTS FOUND AND FIXED IN THIS PASS, both mine:

A ${} interpolation was written into single-quoted strings in three places while wiring Fleshbook and the funds panel. node --check caught them because the injected text contained quotes.

More subtle: applyI18n overwrites textContent wholesale. English restores from the original captured out of the DOM and keeps any leading icon glyph, but Chinese renders the zh value verbatim. Seven keys (Patreon, Discord, Bugs, Jade, DEV LOGS, Videos, Live on Kick) were authored without their glyph, so every one of those icons would have vanished the moment a player hit the toggle, and only in Chinese. Fixed, and added as check 6 in tools/i18n-check.js: it compares the leading glyph in the markup against the zh value for every data-i18n element. Negative-tested by stripping the Jade glyph and confirming it names that key.

Verifier state: 966 catalog entries, 830 literal keys in use, and zero on all six checks.

Note: the drone mining game itself (client/assets/drone-mining/index.html) is a separate self-contained app and is NOT covered here. It is its own pass.

Remaining: codec-data.js, the Corpo-Cards rules encyclopedia, and the dev-only god-panel.js and dev-comms.js.

First-pass CN throughout. Native review advised.

Changed files: client/index.html, client/assets/core.js, client/assets/galaxy.js, client/assets/sound.js, client/assets/fleshbook.js, client/assets/tcg/tcg-app.js, tools/i18n-check.js.

---

## v1.2.5.18 (2026-07-22) - Localization: title store, Capital Houses, P&L, market tools, auth (CLIENT)

Client only. Hard-refresh after deploy.

The remaining player-facing modules. After this the only untranslated surfaces are the codec dialogue data and the two dev-only panels.

Title store (market-state.js). All 27 purchasable and Patreon titles, name and blurb, plus the President of The Coalition card with its holder line, seize and claim controls and perk strip. Store buttons: Equip, Equipped, Unequip, Buy, Locked, In Office.

IMPORTANT, and the reason titles are done as a map rather than a catalog: the English title name is the SERVER identity. It is what buy_title and set_title send and what the owned list is matched against. Only the rendered label is swapped; every lookup key stays English. Same rule already used for commodity and cargo names. Translating the stored name would have desynced ownership.

Capital Houses (funds.js). Empty-house canvas label, holdings and positions empty states, Join Fund and its hint, the Patreon join path and description, Fund Trade titles including the owner-override variant, governance labels, Veto (Golden) and Force Call, golden-share tag, and every prompt and hint on withdraw, member payout, invite, trade, golden transfer, officer assignment, account linking, fund rename, description edit and the delete confirmation.

P&L panel (pnl-panel.js). Ticker filter and minimum-position inputs, Export CSV, Close Winners, Close Losers, Close Green, the Unrealized P&L and Daily Income tiles, the Equity and Cash chart title and its footnote, Trade History with its empty and unavailable states, Sell All, and the failure alerts.

Market tools (market-tools.js). Watchlist star tooltips in both states, the watchlist-only filter, the news filter placeholder and its watchlist-only toggle, and the headquarters-colony tooltip.

Auth (fm-auth.js). Mode switch and submit buttons, and all eleven login and registration hints including the server error map.

NEW CHECK: tools/i18n-check.js now also flags a ${} interpolation sitting inside a single- or double-quoted string rather than a backtick template. Wiring a translator call into HTML built with single quotes yields '<span title="${window.t(...)}">'. When the injected text contains a quote, node --check catches it, and it did twice during this pass. When it does not, the file is syntactically valid and the player sees the literal characters on screen. Template state is tracked with a stack rather than a backtick count, because nested templates inside expressions flip a counter twice on one line and would report whole blocks as broken. Negative-tested against an injected fault, with zero false positives on the current tree.

Note on the currency glyph: this codebase uses BOTH U+0191 and U+0192 for it. The President perk strip and the Abaddon cluster bonus use U+0191, most other code uses U+0192. Keys match whichever the source uses. Worth normalising eventually, but that is an English-visible change and belongs in its own release.

Verifier state: 877 catalog entries, 804 literal keys in use, 0 undefined, 0 missing zh, 0 unsupplied tokens, 0 bad interpolations, 0 em dashes in rendered text, 0 unresolved aliases.

Remaining: codec-data.js (codec dialogue, a lore-authoring job rather than a wiring job) and the dev-only god-panel.js and dev-comms.js.

First-pass CN throughout. Native review advised.

Changed files: client/assets/core.js, client/assets/market-state.js, client/assets/funds.js, client/assets/pnl-panel.js, client/assets/market-tools.js, client/assets/fm-auth.js, tools/i18n-check.js.

---

## v1.2.5.17 (2026-07-22) - Localization: Galaxy colony and planet data (CLIENT)

Client only. Hard-refresh after deploy.

The colony data layer, which the previous five Galaxy passes deliberately deferred. This is what the map detail pages and planet cards actually read.

Colony names and lore. All 37 colonies. The 16 Jade colonies already had names and lore in JADE_I18N, so the new COLONY_ZH map covers the 21 non-Jade colonies only and the resolver checks JADE_I18N first. No duplication, and the Jade side is untouched. Applied to the detail-panel header and lore block, the faction-list system chips, lane and route labels, and shipping destination names.

Planet names. All 66, in PLANET_NAME_ZH, keyed by the English name as it appears in COLONY_META.

Planet bonus and contested lines are GENERATED, not stored. There are 135 of them and they are templated (Coalition: +1.2% Finance dividends / Contested: +0.6%). A table of 135 hand-translated strings would go stale silently the next time the economy is retuned, and the Chinese would keep showing old percentages with nothing to flag it. bonusZh and contestZh parse the English and rebuild it in Chinese, so the numbers are correct by construction. Nine strings that do not fit the pattern (the Abaddon cluster requirement, the Guild fee exemption, the dev multiplier, the S'weet monopoly, the Greed sovereignty line and the cannot-be-contested variants) are whole-string overrides. Verified at runtime against every string in COLONY_META: 67 bonus, 68 contested, 66 planet names, 37 colony names, 37 lore, zero falling through to English.

Sector display names on planet cards (16 values including Gray Bazaar, Iron Foundries, Flesh and Gene, Neural Networks, Power Cartels) now translate. These are distinct from the eight numeric sector keys, which cover the market side.

Commodity names on the markets board: cargo hold rows, arbitrage board rows and the commodity chips now render through COMMODITY_ZH. Sorting, filtering and the name-to-id maps still key off the English name, so only the visible label changes.

JADE FACTION CARD FIXED. The Jade card renders through jadeFactionCard, a separate path from the other five faction cards, so the FACTION_ZH wiring added in 1.2.5.16 never reached it and the card stayed English under the Jade toggle. Now wired for name, description and bonus summary.

Note on the Jade description specifically: the Chinese currently shown is first-pass and is a placeholder. Jacob is writing that one by hand. The socket is wired, so replacing it is a one-line data edit to FACTION_ZH.jade.desc in core.js with no code change. It is left populated rather than blank because falling back to English on the Chinese-native faction is the worse of the two failure modes.

One data correction: the Abaddon cluster bonus uses U+0191 for the currency glyph where the rest of the codebase uses U+0192. The override key matches the source exactly rather than normalising it, since changing the source glyph is an English-visible change and belongs in its own release if wanted.

Still untranslated, in rough priority order: market-state.js, funds.js, market-tools.js, pnl-panel.js, fm-auth.js, codec-data.js (large, lore content), and the dev-only god-panel.js and dev-comms.js.

First-pass CN throughout. Native review advised.

Changed files: client/assets/core.js, client/assets/galaxy.js.

---

## v1.2.5.16 (2026-07-22) - Localization: Galaxy tab pass 5, factions and remaining toasts (CLIENT)

Client only. Hard-refresh after deploy.

Fifth and final Galaxy pass over interactive surfaces. Everything the changelog for 1.2.5.14 and 1.2.5.15 listed as pending is now covered except the colony data layer.

Factions list (renderFactionList):
- All six cards. Faction names, one-line descriptions and bonus summaries resolve through a new FACTION_ZH map keyed by faction id, because those strings live in the FACTIONS data object rather than in the catalog. English data remains the fallback.
- DEV ONLY and PATREON corner banners, ALIGNED, JOIN, CONVERT, JOIN ON PATREON and LOCKED controls.
- ACTIVE BONUSES panel, the SYSTEMS, CONTESTED and WAR CHEST stat cells, the STATUS and PERMANENT CONTROL pair on the Flesh Station card, and the planets-in-systems line.
- The Void Collective permanent conversion warning, split into body, irreversibility and exit-route strings so the red emphasis span survives translation, plus the CYBORG AUGMENTS ACTIVE line for aligned players.

Faction join (gJoinFaction): the login prompt, the full confirm dialog including its bullet list, the aligned toast with the translated faction name, the conversion-complete suffix, and the generic error and network-error toasts. The colony_conquered broadcast toast now names the faction in Chinese.

Faction funding: both call sites, spDoFund on the system-view HUD and the colony-panel handler. Minimum amount, login prompt, the funded message with its control-gained, to-next-percent and banked variants, fund-failed and connection-error.

Commodity board (gMktBuy, gMktSell): login prompt, both quantity prompts, the hold-none guard, the bought and sold hint lines, and the no-ship, insufficient-funds, no-cargo-here, buy-failed and sell-failed error paths. Cargo delivered and cargo insured toasts route commodity names through the existing COMMODITY_ZH map. Ship commissioning toast.

Map run tooltip: the SHIPPING and SMUGGLING labels, stake, time-left and insured lines, with cargo names through SMUG_CARGO_ZH.

Also swept: 11 login-first toasts, 4 minimum-amount toasts and 2 minimum-stake toasts across the lane share and blockade actions, plus the share-error toast.

Verifier state after this pass: 794 catalog entries, 701 literal keys in use, 0 undefined, 0 missing zh, 0 unsupplied tokens, 0 em dashes in rendered text.

Still untranslated on the Galaxy tab, and deliberately so: COLONY_META colony names, lore paragraphs and per-planet bonus lines. That is a data pass rather than a wiring pass and it is sized differently from these five. The three dynamic namespaces the verifier reports as INFO (lane.*, sector.*, casino.bacc.*) resolve at runtime; lane.* is confirmed complete across all 63 lanes, the other two still want a manual check.

NEW: tools/i18n-scope-check.js. Run with node tools/i18n-scope-check.js. The translation aliases in this codebase are declared per function (var T = function(k,fb){...}), so a call site can ship without its declaration and produce a ReferenceError the moment that function runs. Nothing already in the toolchain catches that: node --check only validates syntax, and i18n-check.js only validates that the key exists in the catalog, not that the function calling it exists in scope. That exact combination broke renderFactionList during this pass, when a build script aborted before writing and rolled back the alias declarations while a later run wrote three call sites that depended on them. Syntax checking passed and the catalog check passed; the factions tab would have thrown on open. The new checker walks outward from every alias call to the enclosing function, accepts a declaration in any enclosing scope or at module level, and fails otherwise. It was negative-tested by deleting the FZ declaration and confirming it flags exactly the two dependent call sites while node --check still reports the file as valid.

First-pass CN throughout. Native review advised before any of it is treated as final.

Changed files: client/assets/core.js, client/assets/galaxy.js, tools/i18n-scope-check.js.

---

## v1.2.5.15 (2026-07-22) - Localization: Galaxy tab pass 4, Smuggling subtab (CLIENT + TOOLING)

Client and build tooling. Hard-refresh after deploy.

Fourth Galaxy pass, completing the Smuggling subtab (window.renderShippingTab), the last render surface listed as pending in 1.2.5.14.

Smuggling console (renderShippingTab):
- Header and the stake-and-guards explainer.
- Active run card: RUN IN PROGRESS, the origin to destination line, the stake and guard-fee line, and the EN ROUTE countdown.
- Select Route (lane type now routes through the existing lane.* keys), Contraband (cargo names plus the risk suffix), Stake and its placeholder.
- Guard Escort: the label, the risk-and-fee note, and all four tiers with names, descriptions, risk cut and fee.
- Syndicate turf notice, Estimated Risk, the risk-detail breakdown, and the four payout cells (Potential Payout, Guard Fee, Total At Risk, EV / Run).
- Launch button, the How Factions Affect Smuggling panel (six faction lines), and Run History with its CLEARED and SEIZED states and empty state.

Live strings and toasts:
- _smugTick countdown, both the timer and the status line.
- _gSmugCalcRisk risk-detail labels (bet-size, tension, faction, synd turf, guards) and the blockade and guard-cut suffixes.
- _gStartShipping and _gStartSmuggling2 login and minimum-stake errors.
- smuggling_result, smuggling_started and smuggling_error toasts, the delivered and intercepted status lines, and the three shipping_result toasts.

Cargo and guard names arrive from the server as English names rather than ids, so they resolve through two name-keyed maps, SMUG_CARGO_ZH and SMUG_GUARD_ZH. Guard descriptions come from the map rather than the server payload, so a server-side rewrite cannot strand a stale Chinese line.

FIXED, not localization: the Private Army button in the blockade sub-panel was hardcoded English while the identical button in the colony panel was correctly wired to galx.privateArmy. The key existed; that call site was never connected. It is now.

EM DASHES. The no-em-dash rule was being checked with a grep for the raw U+2014 byte. That grep cannot see the escape form, and 33 player-facing strings in galaxy.js were written as \u2014, which renders identically on screen. All 33 rewritten, plus two literal stragglers outside galaxy.js: the ticker-tape separator in core.js renderTicker (now a middle dot) and the round-history header in god-panel.js (now a comma). The client is now at zero em dashes in rendered text. Code comments are untouched and exempt; they never reach a player.

NEW: tools/i18n-check.js. Run from the repo root with node tools/i18n-check.js. It checks four things against what actually renders rather than against file encoding: em dashes in string literals including the escape form, keys passed to a translator call site with no catalog entry, catalog entries with no zh value, and {token} placeholders present in a string but not supplied by the tf() call site, which would render literal braces to the player. The token check extracts the vars object by brace matching rather than by pattern, because nested calls such as {cargo:_cz(d.cargo)} defeat a plain regex, and it was negative-tested against a deliberately broken key before this build was cut. The middle check is the one that matters most, because a typo'd key is invisible in English (the inline fallback renders) and silently English in Chinese. Current state: 734 catalog entries, 686 literal keys in use, 0 undefined, 0 missing zh, 0 unsupplied tokens, 0 rendered em dashes. Add --strict to gate on em dashes. Dynamic namespace lookups (lane.*, sector.*, casino.bacc.*) are reported as INFO and still need a manual check that every runtime value has a key.

SHIP.SH: added a divergence guard. It fetches origin/main and hard-stops before committing if local history is behind or diverged, printing the exact log commands and the merge -s ours recovery line. The previously noted fix was a plain git pull --ff-only before committing, which would abort every time, because apply.sh mirrors the zip over the whole tree and leaves it dirty by design. Classifying against merge-base works on a dirty tree and stops on the actual dangerous cases: committing on a stale base, or shipping a build that silently reverts commits already on origin.

Still pending on the Galaxy tab: the factions list (renderFactionList) and the commodity action toasts. Colony names, lore and planet bonus text remain untranslated data and are their own pass. First-pass CN throughout; native review advised before any of it is treated as final.

Changed files: client/assets/core.js, client/assets/galaxy.js, client/assets/god-panel.js, client/version.json, docs/CHANGELOG.md, docs/MANIFEST.txt, ship.sh, tools/i18n-check.js.

---

## v1.2.5.14 (2026-07-21) - Localization: Galaxy tab pass 3, Contracts subtab (CLIENT)

Client only. Hard-refresh after deploy.

Third Galaxy pass, completing the Contracts subtab. The filter dropdowns above the tables shipped in pass 1; this is everything below them.

Lane shares table (renderContractsTable):
- YOUR POSITION card: the header, the SELL button, the PAID / VALUE / GAIN / DIVIDENDS labels and the total return line.
- Column headers Route, Type, Slots, Div and Price.
- Row controls: BUY, SELL, SWAP and the FULL state, plus the sell-price sub-label.

Shipping contracts board (renderShippingContracts):
- The board title and its explanatory subtitle.
- Your open contracts section, including the strike and now labels and the EXERCISE button.
- Available contracts header with the reshuffle note, the offer table headers (Commodity, Lane, Strike, Premium, Expiry), the BUY button, the empty state and the unavailable state.

Contract actions (gBuyContract, gExerciseContract):
- Login prompt, insufficient-funds amount, the reshuffled-offer message, buy-failed hints, the contract-bought toast, the exercised toast, the closed-out-of-the-money toast and exercise-failed.

ENGLISH-VISIBLE CHANGE, not a pure localization: the lane Type column previously printed the raw lowercase enum (corporate, grey, dark, contested). It now routes through the existing lane.* keys, so in English it reads Corporate, Grey Market, Dark Net, Contested, matching the filter dropdown directly above it and the map legend. This was a deliberate consistency fix. Revert by restoring the raw r.type value in that cell if the lowercase form was intentional.

Three em dashes in this region were rewritten out of the English text. galaxy.js remains at zero non-comment U+2014.

All 4 lane types in the LANES table (grey, corporate, dark, contested, 63 lanes) have lane.* keys, verified, so the dynamic lookup cannot fall through to English. Edits were scoped to the renderContractsTable-to-_gBuyShare slice; the jade panel is verified free of galx references.

Still pending on the Galaxy tab: the Smuggling subtab (window.renderShippingTab), the factions list, and the commodity action toasts. Colony names, lore and planet bonus text remain untranslated data. First-pass CN; native review advised.

Changed files: client/assets/core.js, client/assets/galaxy.js.

---

## v1.2.5.13 (2026-07-21) - Localization: Galaxy tab pass 2, colony detail panel (CLIENT)

Client only. Hard-refresh after deploy.

Second Galaxy pass. This is the colony detail panel that opens in the right sidebar when a colony is clicked on the sector map, which is the coalition-planet surface. All UI chrome in renderDetail, plus the two sub-panels appended underneath it.

Colony panel:
- SYSTEM button, MEGASTRUCTURE label, the CONTESTED faction-war banner and the Flesh Station banner.
- POPULATION and TENSION labels.
- Planets grid header (both the Station Modules variant and the Planets count variant, the count stays live), and the ENTER affordance on each planet card.
- Faction bonus callout, including the per-sector dividend lines.
- WAR CHEST, Faction Control, Key Operators and the plus-N-more overflow line.
- Fund a Faction buttons, where the faction name and control percentage stay live.
- Core Systems list on Flesh Station.

Blockade sub-panel: the BLOCKADES header, the ACTIVE and FUNDING lane tags, the fund amount placeholder, FUND, COUNTER, the PRIVATE ARMY button and the activation note.

Lane shares sub-panel: the LANE SHARES header and the click-a-lane hint.

Two em dashes in this region (PRIVATE ARMY and the lane hint) were rewritten out of the English text, so galaxy.js now has zero non-comment U+2014.

Implementation note: every edit was scoped to the renderDetail function body rather than applied file-wide. renderJadeDetail mirrors several of these labels but binds T to the three-argument jadeT helper, so a file-wide replace would have silently produced untranslated output there. The jade panel is untouched and verified to contain no galx references.

Not covered, still English: colony names, colony lore, planet names and planet bonus text. Those live in the COLONY_META data table and have no zh entries for coalition colonies (JADE_I18N only covers the jade galaxy). That is a data-layer translation job of its own. Also still pending: commodity action toasts, the factions list, the contracts tables, and the smuggling and blockade action handlers. First-pass CN; native review advised.

Changed files: client/assets/core.js, client/assets/galaxy.js.

---

## v1.2.5.12 (2026-07-21) - Localization: Galaxy tab pass 1, shell + commodity market (CLIENT)

Client only. Hard-refresh after deploy.

First pass over the Galaxy tab. galaxy.js is 5451 lines, so this is deliberately one slice of several: the static tab shell and the whole Markets (commodity arbitrage) subtab. Colony names, lore and commodity names were already localized at the data layer in earlier work, so this pass is UI chrome only.

Static shell (index.html):
- SELECT A COLONY placeholder in the map sidebar, and the contested-colony note in the lane legend.
- Factions pane: the allegiance line and the full How Faction Wars Work paragraph, split around the inline 75% figure so the number stays live.
- Contracts pane: the Lane Shares header, the dividend note, all three filter dropdowns (type, status, sort) and the full How Lane Shares Work paragraph. The type dropdown reuses the existing lane.* keys rather than duplicating them.

Markets subtab (galaxy.js renderMarketsTab):
- Cargo hold summary, the empty state, and the average-cost note.
- In-transit shipment tracker and its empty state.
- Shipping console: the panel title and description, every field label (Commodity, From, To, Qty, Escort, Insurance), the search placeholder, all four escort options, the half-cover checkbox, the SHIP button and the route preview line.
- Arbitrage board: the title and subtitle, the ALL/TECH/MED/AGRI class filters, the name filter placeholder, all five table headers, the BUY/SELL/SHIP row buttons and the explanatory note underneath.
- Shipyard: the title and subtitle, ACTIVE badge, Capacity and Risk labels, the baseline value, In service, Commission and Starter ship.
- Loading, unavailable and load-failed states.

Where a string carried an em dash, the English text was rewritten without one (comma or middot), so the rule now holds on the rendered output of this subtab as well as in source.

Still to come on the Galaxy tab, each its own pass: the commodity action toasts (gMktBuy, gMktSell, gShipQuote, gShipConsoleGo), the colony detail panel (selectColony and renderDetail), the factions list, the contracts tables, and the smuggling and blockade panels. First-pass CN; native review advised.

Changed files: client/assets/core.js, client/index.html, client/assets/galaxy.js.

---

## v1.2.5.11 (2026-07-21) - Localization: core trading UI (sell/short/margin) + em-dash fix (CLIENT)

Client only. Hard-refresh after deploy.

Gap-cleanup pass over high-traffic trading surfaces that were still English. The main market tab chrome (Buy/Sell/Short, limit orders) was already localized in earlier work; this fills in the modals and always-visible bits around it.

- Sell-confirm modal: the title and every row label (Symbol, Owned, Avg Cost, Last Price, Qty to sell / max, Sale Value, Fee, Net proceeds, Unrealized P&L) plus the Cancel / Confirm Sell buttons.
- Short-sell modal (both Open and Cover modes): the header, the two mode tabs, all field labels (Symbol, Current Price, Qty, Collateral Locked, Liquidation, Borrow Fee, Short Position, Avg Entry, Cover Cost, Estimated P&L), the inline notes (held-not-cash, entry-multiple, per-30-min), the YOUR SHORT POSITIONS header, and the Cancel / Confirm Short / Cover Position actions.
- Margin-call banner: the Margin Call title, the full description, and the COVER NOW button.
- XP bar (core.js renderPositions): the level / XP readout, with and without a title, via tf().

Em-dash fix: the margin-call banner contained two player-facing U+2014 (the Margin Call separator and an em dash in the description) - both violated the game-facing no-em-dash rule and were cleared while localizing that block. index.html now has zero player-facing U+2014 (the six remaining are all HTML/JS comments).

Dynamic bits rendered by market-orders.js and shorts.js (live values, warning boxes, the short-position list) remain for their own pass, as does the sell-modal title if it proves to be JS-set. First-pass CN; native review advised.

Changed files: client/assets/core.js, client/index.html.

---

## v1.2.5.10 (2026-07-21) - Localization: P&L tab + sector names (CLIENT)

Client only. Hard-refresh after deploy.

The P&L tab now renders in Chinese when jade mode is on. The live P&L view is rendered by core.js (liveUpdatePnL); the tab's static shell lives in index.html.

- KPI bar: Net Worth, Equity, Cash, Unrealized P&L, Daily Income.
- Faction line: the "Faction:" label, the four faction names (Coalition/Syndicate/Void Collective/Flesh Station), and "colony bonuses active".
- Position table: the column headers (Symbol, Position, Last, Value, Unr. P&L, Gain%) and the three empty-state messages (no match / none in sector / no open positions), including the canvas bar-chart empty label.
- Sort/filter dropdown (static, index.html): "All positions", "Grouped by sector", and the eight sector names.

Sector names (Finance, Biotech, Insurance, Manufacturing, Energy, Logistics, Tech, Misc) are now centralized under a sector.* namespace: _sectorName() resolves through it, and every sector option across the app (the P&L sort, the Capital Houses holdings sort, and the god-panel sector picker) now carries the matching data-i18n, so sector names localize consistently everywhere. The Capital Houses holdings sort's "All holdings" option was localized at the same time (start of the guild.* namespace); the rest of the Capital Houses panel remains for its own pass.

Note: pnl-panel.js (window.initPnLPanel) was found to be unmounted dead code - it is not the live P&L renderer - and was deliberately left untouched. First-pass CN; native review advised.

Changed files: client/assets/core.js, client/index.html.

---

## v1.2.5.9 (2026-07-21) - Localization: Store tab + inventory (CLIENT)

Client only. Hard-refresh after deploy.

The Store tab now renders in Chinese when jade mode is on. The Store tab is a single inline panel in index.html with four sub-tabs (Titles, Inventory, Ƒbay, Slots), and the item/market rendering is driven by inventory.js.

Static panel (index.html, ~62 labels via data-i18n): the Patreon membership block (tier descriptions, email placeholder, Link Account, hint text), the four sub-tab buttons, all six title-tier headers (Common through Legendary and Patreon Exclusive), the inventory equip/bag headers, the Ƒbay filter dropdowns (all slot, rarity, and sort options), the list-item form, and the slot-machine labels and rarity-odds chips.

Dynamic (inventory.js, ~39 edits via t()/tf()): item rarity names and equipment slot names (resolved through invRarityName / invSlotName helpers that reuse the store.rar* and store.slot* keys), the equip/unequip/scrap flows with their confirms and toasts, the empty-bag and no-items messages, the Ƒbay market rows (Buy/Cancel buttons, seller labels, rarity tags), the buy/list/cancel toasts, the slot-machine spin states and result reveal, and the WebSocket spin-grant and guaranteed-drop toasts.

Item and title names themselves stay data-driven (server catalog) and are unchanged; the Ƒbay brand name is kept as-is. All remaining U+2014 in inventory.js are code comments. First-pass CN; native review advised.

Changed files: client/assets/core.js, client/index.html, client/assets/inventory.js.

---

## v1.2.5.8 (2026-07-21) - Localization: casino Roulette; casino complete (CLIENT)

Client only. Hard-refresh after deploy.

Roulette (European, single-zero) now renders in Chinese when jade mode is on, completing casino localization. Roulette lives in a large block inside core.js rather than its own casino-*.js file, so this was a single-file pass.

- The bet-type dropdown: all 13 wagers with their odds (Red/Black/Odd/Even/Low/High at 1:1, the three dozens and three columns at 2:1, Straight Up at 35:1).
- Bet-amount label and the Min/Max quick chips, the + Add Bet / Spin / Clear action buttons, and the Balance / Bets Total / Active Bets info labels.
- Runtime: the active-bets slip uses localized short labels per wager (betLabel rebuilt to resolve through t()); the result banner (win/lose with number, colour, and payout), the spin log lines, the Last-number readout, and the place-bet / insufficient-funds / spinning status messages. Colour names (red/black/green) resolve through a small rlColorName helper and are upper-cased for the banner exactly as before.

Wheel-face numbers (canvas) and the straight-bet number grid stay numeric - unchanged, and CJK on the canvas would not render cleanly anyway. A player-facing em dash in the spin bet-rejected notice was cleared via the shared casino.common.stale key; all remaining U+2014 in the block are code comments. First-pass CN; native review advised.

With roulette done, every casino game (Roulette, Blackjack, Poker, Horse Races, Baccarat, Sic Bo, Chess, Sudoku, Math Quiz, Minesweeper, Solitaire) plus the game-selector tabs now localize.

Changed files: client/assets/core.js.

---

## v1.2.5.7 (2026-07-21) - Localization: casino puzzle games + game tabs (CLIENT)

Client only. Hard-refresh after deploy.

Five more casino games now render in Chinese when jade mode is on: Chess, Solitaire (Klondike), Sudoku, Minesweeper, and Math Quiz. Each follows the established pattern - static template labels via data-i18n, all runtime strings through t()/tf(), and applyI18n(pane) after the pane is built:

- Chess: AI ELO / Start / Surrender / Payouts labels, entry-fee and payout lines, turn indicators (your move / AI thinking), and every result status (checkmate win, checkmated, draw refund, surrender, timeout, insufficient funds). ELO ratings kept as numbers.
- Solitaire: New Game / Cash Out / Auto / Balance controls, the Klondike idle briefing and buy-in instructions, the foundations/cash-out status line, and the win/push/lose cash-out banners.
- Sudoku: title, the five difficulty buttons, numpad Clear, New Puzzle / Submit / Hint controls, cooldown/cells-remaining/board-complete status, hint penalty notes, and correct/incorrect results.
- Minesweeper: title, the three mode buttons, left/right-click controls, the mines/timer HUD unit, and boom/cleared/earned messages.
- Math Quiz: MATH TEST header, score/earned row, the five difficulty names in the reward badge, cooldown timer, per-question payout preview, correct/wrong/time-up feedback, and the final-score line.

The casino game-selector subtabs (Roulette, Blackjack, Poker, Horse Races, Baccarat, Sic Bo, Chess, Sudoku, Math Quiz, Minesweeper, Solitaire) are now localized via data-i18n.

Difficulty and mode names resolve through small per-game helper maps (mqLvlName, msModeName, sdkDiffName). A player-facing em dash in chess's entry-rejected notice was cleared via the shared casino.common.stale key; all remaining U+2014 in these files are code comments. First-pass CN; native review advised.

This completes casino localization except for roulette, which lives in a large block inside core.js and gets its own focused pass next.

Changed files: client/assets/core.js, client/assets/casino-chess.js, client/assets/casino-solitaire.js, client/assets/casino-sudoku.js, client/assets/casino-minesweeper.js, client/assets/casino-mathgame.js, client/index.html.

---

## v1.2.5.6 (2026-07-21) - Localization: casino Poker / Texas Hold'em (CLIENT)

Client only. Hard-refresh after deploy.

Poker (Texas Hold'em, 6-max vs 5 AI) now renders in Chinese when jade mode is on. The inline table template (Stack/Blind/Pot, OPPONENTS, Community, Your Hand) and the Deal/Fold/Check/Call/Bet-Raise/All-in controls are wired via data-i18n; all runtime strings go through t()/tf(): the ten hand rankings (Royal Flush through High Card), the street names and street headers (flop/turn/river/showdown), every AI and player action line (folds/checks/calls/raises, blinds, hand headers), the seat status/bet chips, and the win/lose/push/split result banners.

AI opponent names (Vega, Oracle, Dread, Silk, Baron) are kept as proper nouns in both languages, consistent with the horse names. A player-facing em dash in the bet-rejected notice was cleared via the shared casino.common.stale key. Poker terminology follows standard Chinese usage.

The static template lives in index.html and is localized by the document-level applyI18n; the dynamic strings are localized at their render points in casino-poker.js. First-pass CN; native review advised.

Changed files: client/assets/core.js, client/assets/casino-poker.js, client/index.html.

---

## v1.2.5.5 (2026-07-21) - Localization: casino Baccarat + Sic Bo (CLIENT)

Client only. Hard-refresh after deploy.

Baccarat and Sic Bo now render in Chinese when jade mode is on. Baccarat: the felt (Balance, On table, Player/Banker hands), all five bet spots (Player, Banker, Tie, Player Pair, Banker Pair), the Deal/Clear/chip controls, the result banner (win/push/lose, natural, pair tags), the bead-road dots, and the log. Sic Bo: the dice board in full - Small/Big/Odd/Even, single numbers, specific doubles, triples, total-sum, and two-dice combos - plus Roll/Clear controls, the rolling/total status line, and the win/lose banner and log.

Shared casino chrome (Balance, On table, CHIP, Max, Clear, insufficient-funds, place-a-bet, net-not-ready, rejected, and the win/lose banner formats) was promoted to casino.common.* keys reused by both games. Static labels use data-i18n + applyI18n(pane); runtime strings use t()/tf().

Terminology follows standard Macau/Chinese usage. First-pass CN; native review advised. Neither file had em-dash issues (both used hyphens).

Changed files: client/assets/core.js, client/assets/casino-baccarat.js, client/assets/casino-sicbo.js.

---

## v1.2.5.4 (2026-07-21) - Localization: casino Blackjack + Horse Races (CLIENT)

Client only. Hard-refresh after deploy.

Blackjack and Horse Races (both live in casino-blackjack.js) now render in Chinese when jade mode is on: table labels (Dealer, Your hand, Stack, Bet), the Deal / Hit / Stand / Double and RACE controls, the rules and payout lines, shoe status, and every runtime result and log line - win, lose, push, bust, blackjack, payouts, insufficient-funds and stale-refresh notices, and bet-rejected errors. Static labels use data-i18n + applyI18n(pane); runtime strings use t()/tf().

New: window.tf(key, fallback, vars) in core.js - t() with {token} interpolation, reused by casino result strings that embed amounts, counts, and horse names.

Horse names (Comet, Nebula, Phantom, Vortex, Ember, Quicksilver) are kept as proper nouns in both languages to avoid canvas CJK rendering issues. Pre-existing em dashes in the affected player-facing strings (horse dropdown separators, race status) were cleared in both languages.

First-pass CN on casino terms; native review advised. Remaining casino games (baccarat, sic bo, poker, chess, solitaire, sudoku, minesweeper, mathgame, roulette) to follow using the same pattern.

Changed files: client/assets/core.js, client/assets/casino-blackjack.js.

---

## v1.2.5.3 (2026-07-21) - Localization: tutorial (CLIENT)

Client only. Hard-refresh after deploy.

The full onboarding tutorial (UNIT-7) now renders in Chinese when jade mode is on: all 17 slides (headings, body prose, callouts), the speaker title, and the Skip / Prev / Next / Begin Trading controls. Inline markup, game terms, and Ƒ figures are preserved. English falls back per field if a zh entry is missing.

First-pass CN on dense onboarding prose (dividends, shorting, factions, smuggling, index funds, the Flesh Revenue Service); native review advised.

Changed files: client/assets/tutorial.js.

---

## v1.2.5.2 (2026-07-20) - Localization: shipping headlines (news engine complete) (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

Translates the 5 remaining headline-variable shipping headlines: smuggling run intercepted and cleared, and shipping insured, lost, and delivered, with translated commodity, colony, and lane-type names.

**The news engine is now complete for normal play.** Every headline the feed generates or an event fires, the six genHeadline pools plus 33 event headline types, renders in Chinese, with English fallback where a value cannot resolve. Intentionally still English: the dev and god events and the rare presidency and conquest lines.

**Changed files.**
- server/server.js 5 shipping pushHeadline sites now carry event meta.
- client/assets/core.js the lane-type helper and the 5 shipping event templates.

---

## v1.2.5.1 (2026-07-20) - Localization: galaxy sub-tabs + commodities + cargo headlines (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

**Galaxy sub-tabs** now switch to Chinese: Sector Map, Markets, Smuggling, Contracts, Factions.

**Commodities:** all 120 commodity names now have Chinese translations (the COMMODITY_ZH map). Wired into the cargo and contract news headlines this pass; the commodity display in the smuggling and inventory UIs follows with those subsystems.

**Cargo and contract headlines:** the 4 direct cargo and contract event headlines (cargo insured, seized, delivered, and contract exercised) now render in Chinese with translated commodity and colony names. The 5 headline-variable shipping headlines (smuggling run intercepted and cleared, shipping insured, lost, and delivered) are the next news bit.

**Changed files.**
- server/server.js 4 cargo and contract pushHeadline sites now carry event meta.
- client/assets/core.js galaxy sub-tab catalog keys, the 120-entry COMMODITY_ZH map, and the cargo event templates.
- client/index.html data-i18n on the 5 galaxy sub-tabs.

---

## v1.2.5.0 (2026-07-20) - Localization: chat panel chrome (CLIENT)

Client only. Hard-refresh after deploy.

Starts on the rest of the game. Translates the chat panel's static chrome: the channel tabs (Global, Premium, Merchants Guild, Unmod, Dunce), the Wire Credits panel (header, Recipient name, Wire, the transfer-tax note), and the Leaderboard header (Leaderboard and NET WORTH). The chat input placeholder now stays translated when you switch channels; chat-ui.js had been overwriting it back to English.

**Deferred (the remaining sequence):** the galaxy sub-tabs (SECTOR MAP / MARKETS / and so on) are rendered somewhere non-obvious in galaxy.js and need a focused pass to locate; the dynamic chat internals (room labels, guild-only notices, the Sound toggle, system messages across the 8000-line chat-ui.js); commodities (120 names); the tutorial; and the subsystem interiors (Casino, Mining, Capital Houses, Store, Fleshbook, Corpo-Cards, Inventory, Funds).

**Changed files.** client/assets/core.js, client/index.html, client/assets/chat-ui.js.

---

## v1.2.4.4 (2026-07-20) - Localization: news world-event headlines (blockade / lane / tension / ship) (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

Translates 9 world-event headlines: tension alerts, blockade active, expired, counter, and private-army, lane-share acquire, sell, and swap, and ship commission. Colony names use the Chinese colony map; the tension bands (Critical, High, Elevated) translate; player names pass through unchanged.

**Deferred, not skipped:** the cargo and shipping headlines interpolate commodity names, of which there are 120, and those belong with the smuggling and cargo subsystem translation, to be done alongside the commodity map. **Left in English for now (edge or admin, to revisit later):** the dev and god events, and the rare presidency and conquest lines.

With this, the normal-play news feed, both the scrolling genHeadline pools and the common event headlines, renders in Chinese.

**Changed files.**
- server/server.js 9 world-event pushHeadline sites now carry event meta.
- client/assets/core.js 9 world-event templates plus colony and band helpers in the news renderer.

---

## v1.2.4.3 (2026-07-20) - Localization: news finance/fund/guild event headlines (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

Translates 15 finance event headlines, the ones players see most: earnings, fund buy/sell/vote/propose/execute, fund launch/disband/list/delist, guild acquire/sell/propose/rejected, and the Market rotation line. The server tags each with its type and parameters; the client rebuilds the headline in Chinese, resolving company names by symbol and translating buy/sell, while player and fund names (user strings) pass through unchanged. Earnings keeps its clickable ticker.

**Remaining news:** the world-event headlines, blockade, cargo, lane-share, contract, ship commission, presidency, conquest, and the dev/god events, roughly 25 sites that interpolate colony and player names. That is the last news batch. Some of them (dev/god events, the rare presidency and conquest lines) may be fine to leave in English given they are edge or admin cases; your call.

**Changed files.**
- server/server.js 15 finance, fund, and guild pushHeadline sites now carry event meta.
- client/assets/core.js the event branch of the news renderer, with 15 headline templates.

---

## v1.2.4.2 (2026-07-20) - Localization: news faction/flesh/void pools + colony-flavored (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

Translates the remaining genHeadline pools: faction (16), Mr. Flesh and house flavor (12), void and rare (14), and the 15 colony-flavored templates. Colony names get a 21-entry Chinese map, substituted into the colony templates by id. With this, the entire genHeadline feed - void, faction, flesh, market-wide, colony, and company/sector - now renders in Chinese under the Jade button.

**Remaining:** only the roughly 47 event headlines that fire on market events (earnings, fund buy/sell/vote, blockade, cargo, and so on) still render in English. Those are the final news batch.

**Changed files.**
- server/server.js the void, faction, flesh, and colony genHeadline branches now tag the headline meta (pool and index, or colony template index and colony id).
- client/assets/core.js the void, faction, flesh, and colony zh pools, the colony-name map, and the colony branch of the news renderer.

---

## v1.2.4.1 (2026-07-20) - Localization: news company/sector headlines + panel-title fix (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

**Company/sector headlines translated,** the roughly 57% of the feed carrying a ticker. The server now tags each company headline with which fragment pool it drew from (sector or generic) and the index; the client mirrors all 166 fragments (8 sectors of good/bad/weird plus the 30-item generic pool) in Chinese and rebuilds the headline as the zh company name, the ticker in parentheses, then the zh fragment. The company's Chinese name is resolved by symbol from CO_NAME_ZH, or from the Jade map for Jade tickers. The parenthesised ticker stays halfwidth so the clickable-ticker link still fires; if a name or fragment cannot resolve, the line falls back to English.

**Panel-title fix.** The market panel title (Companies / Jade Exchange) now reflects the persisted language on a fresh load, not only after a theme-toggle or a view-switch.

**Still English in the feed:** the colony-flavored headlines, the faction/flesh/rare pools, and the roughly 47 event headlines (earnings, fund trades, blockade, cargo, and so on). Those are the remaining news passes.

**Changed files.**
- server/server.js the company headline path tags sector or generic fragment identity in the headline meta.
- client/assets/core.js the sector and generic zh mirrors, a symbol-to-zh-name resolver, the company branch of the news renderer, and the panel-title-on-load fix.

---

## v1.2.4.0 (2026-07-20) - Localization Slice 4: news engine pipeline + market-wide; rotateHotStocks fix (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

**News localization pipeline.** The news feed is server-generated and broadcast to every player, so one headline cannot be two languages at once. Headlines now carry a compact structured meta identifying the source pool and index; the client re-renders the headline in Chinese from a matching zh mirror when the Jade button is on, and falls back to the English text otherwise. pushHeadline gained an optional meta argument and the headline item gained an optional meta field (broadcast and persisted).

**First category translated:** the market-wide headline pool (34 headlines, no ticker, no price impact). The company/sector headlines, colony-flavored headlines, and the roughly 47 event headlines land in following passes; until then they render in English.

**Limitation:** the client keeps no news store, so toggling language mid-session translates only new headlines as they arrive; the initial feed on load renders in the current language. Re-render-on-toggle can be added later.

**Also fixed (pre-existing, unrelated to localization).** rotateHotStocks crashed whenever a fund (id 20000 and up) or Jade (id 30000 and up) ticker was selected for the hot-stocks rotation, because the symbol lookup indexed the companies array by company id. The hot-stocks bias was already applied before the crash, so this was purely a broken Market rotation headline and log line; the lookup now finds the company by id. Zero market-sim behavior change. Funds and Jade tickers can still be selected into the rotation as before and now appear in the Market rotation headline; whether they should be excluded is a separate decision.

**Changed files.**
- server/server.js pushHeadline meta argument and item.meta; the market-wide headline tagged with meta; rotateHotStocks symbol lookup fixed.
- client/assets/core.js the NEWS_ZH market pool, newsZhText, and renderNews rendering zh from meta.

---

## v1.2.2.3 (2026-07-20) - Localization: Coalition descriptions complete (CLIENT)

Client only. Hard-refresh after deploy.

Final batch of Coalition ticker descriptions: the last 61 (Pixel Software through Zenith Media). All 181 Coalition descriptions are now translated, verified at 100% coverage against the company list. Combined with the names (1.2.2.0) and the Jade Exchange, the entire market ticker list now renders in Chinese under the Jade button: symbols stay, names and descriptions switch.

First-pass CN throughout; native review advised before final, especially the satirical descriptions.

**Remaining for the market:** the ticker detail panel (the selected company's name plus the Finance / HQ / Dividend eligible labels), JS-rendered in market-tools.js, is next and closes the list-versus-detail gap. Then the news engine.

**Changed files.** client/assets/core.js.

---

## v1.2.2.2 (2026-07-20) - Localization: Coalition descriptions batch 2 of 3 (CLIENT)

Client only. Hard-refresh after deploy.

Second batch of Coalition ticker descriptions: 60 more (Global Enterprises through Pixel Dynamics), for 120 of 181 total. First-pass CN with cross-references consistent with the ticker list. The remaining roughly 61 descriptions are the final batch; the ticker detail panel wiring and the news engine follow. Native review advised for the prose.

**Changed files.** client/assets/core.js.

---

## v1.2.2.1 (2026-07-20) - Localization: Coalition descriptions batch 1 of 3 (CLIENT)

Client only. Hard-refresh after deploy.

First batch of the 181 Coalition ticker descriptions: 60 translated (Anchor Biotech through GhostFoundry). First-pass CN authored by the model; cross-referenced company names reuse the same translations as the ticker list (North Biotech, WraithEnergy, Cascade Minerals, and so on) so references stay consistent. This is nuanced satirical prose and wants a native review before it is treated as final.

The remaining roughly 121 descriptions land in the next batches; the ticker detail panel wiring (name + Finance/HQ/Dividend labels) and the news engine follow.

**Changed files.** client/assets/core.js.

---

## v1.2.2.0 (2026-07-20) - Localization Slice 2, part 1: Coalition ticker names + Jade descriptions (CLIENT)

Client only. Hard-refresh after deploy.

**Coalition ticker names.** All 181 Coalition company names now render in Chinese in the market list when the Jade button is on. Names are composed from a prefix/suffix map (e.g. Vertex Aerospace becomes the fixed pairing of the Vertex and Aerospace terms, Anchor Retail the Anchor and Retail terms) with the roughly forty single-word syndicate houses translated individually; every name was verified to resolve to a translation. Ticker symbols and the underlying company data are unchanged; only the displayed name switches.

**Jade descriptions.** The 20 Jade Exchange ticker descriptions are now translated (the names were already done in the Jade release). The Jade Exchange list is now fully Chinese, names and descriptions both.

**Deferred (stays English until its pass):** the 181 Coalition ticker descriptions (unique prose, the native-review batch) come next; the ticker detail panel name and its labels (Finance / HQ / Dividend eligible) are JS-rendered in market-tools.js and land with the descriptions; the news ticker (Slice 4, server-side) is last.

**Changed files.** client/assets/core.js.

---

## v1.2.1.2 (2026-07-20) - Localization: trading order form (CLIENT)

Client only. Hard-refresh after deploy.

Continues Slice 1. Translates the market order-entry form, the most-used interactive surface.

**Translated.** The order row (Symbol placeholder, Buy, Sell, Short) and the Limit Orders panel (its header, the BUY/SELL side selector, the Symbol/Qty/Limit placeholders, Place), plus the Live Trades header. Only display text switches; order values, symbols, and the selector's underlying values are unchanged.

**Still deferred (untranslated stays English):** the Price Alerts panel, the Watchlist / History / Index Funds tabs, and the ticker detail (Finance / HQ / Dividend eligible / Position) are JS-rendered in market-tools.js (a later pass); plus the wire/chat panel, galaxy sub-tabs, and Coalition tickers (Slice 2).

**Changed files.** client/assets/core.js, client/index.html.

---

## v1.2.1.1 (2026-07-20) - Localization: main-screen chrome pass 2 (CLIENT)

Client only. Hard-refresh after deploy.

Continues Slice 1. Extends Chinese coverage to the persistent left/center chrome that 1.2.1.0 did not reach.

**Translated.** The market panel title (Companies / Jade Exchange, refreshed on the language switch), the live-feed header (LIVE NEWSFEED / REALTIME MARKET WIRE, and the BREAKING banner label), and the static section labels: Sector Exposure, Market Heatmap, Capital Houses, Mining, Heat, and the Shipping Lanes legend (Corporate, Grey Market, Dark Net, Contested). The legend colour swatches survive the switch.

**Mechanism.** JS render points (panel title, news header) route through t(); the news header re-translates itself on every feed update via applyI18n scoped to its own element. Static labels use data-i18n; each legend lane's text was wrapped in its own span so the swatch is not clobbered.

**Still deferred (untranslated stays English):** galaxy sub-tabs and the chat panel (each its own subsystem), every subsystem interior, Coalition ticker names/descriptions (Slice 2), the tutorial (Slice 3), and news feed content (Slice 4).

**Changed files.** client/assets/core.js, client/index.html.

---

## v1.2.1.0 (2026-07-20) - Localization framework + UI chrome (CLIENT)

Client only. Hard-refresh after deploy.

Slice 1 of the whole-game Chinese localization. Adds a general i18n layer so the Jade button switches the interface language, not only the Jade galaxy's content.

**Framework.** One language flag (window._lang, driven by the Jade theme button; absorbs the former _jadeLang) plus a string catalog (window.I18N) holding English and Chinese per key. Static markup carries data-i18n / data-i18n-ph attributes applied by applyI18n(), which captures each element's original English from the DOM once so the English restore is byte-identical. JS render points use t(key, fallback). The existing Jade content layer (jadeT / JADE_I18N) now reads the same flag.

**Chrome translated.** Main navigation tabs (Market, Heat, P&L, Casino, Capital Houses, Store, Galaxy, Mining, Fleshbook, Corpo-Cards, Dev Logs, Bugs), the Coalition / Jade Exchange market-view tabs, the ticker search and chat input placeholders, the chat Send button, and the Contacts control. The Fleshbook unread badge is preserved through the switch.

**Removed.** The separate 文/EN button; the Jade theme button drives language now.

**Deferred to later slices / passes (untranslated strings stay English):** JS-rendered chrome (news header, galaxy sub-tabs, chat room labels, market panel title), the subsystem interiors (Casino, Mining, Capital Houses, Store, Fleshbook, Corpo-Cards), Coalition ticker names and descriptions (Slice 2), the tutorial (Slice 3), and the news feed (Slice 4, server-side).

**Changed files.**
- client/assets/core.js Unified the language flag on _lang, removed the dead toggleJadeLang, added the I18N catalog, t(), and applyI18n(); wired applyI18n into the theme toggle and initial paint.
- client/index.html Head loader reads _lang; data-i18n / data-i18n-ph attributes on the primary chrome; Fleshbook label wrapped so its badge survives.

---

## v1.2.0.0 (2026-07-20) - Jade Circuit: second galaxy with its own exchange (SERVER + CLIENT)

Server and client. Restart required. Hard-refresh after deploy.

**New galaxy.** Added the Jade Circuit, a fifth joinable faction and the central power of a breakaway cluster reached through an FTL wormhole. The cluster has sixteen colonies (Yujing, Tiangong, Shennong Reach, Houji Fields, Mozi Array, Wukong Deep, Zheng He Anchorage, Haisi Waystation, Houtu Foundry, Changzheng Yards, Xuanwu Bastion, Lingtai Reach, Fuxi Observatory, Quanzhou Docks, Zhurong Foundry, Chiyou Marches) and four non-joinable sub-houses (Shennong, Mozi, Zheng He, Houtu), each with lore in a cold dynastic-capitalist register. Colonies carry a galaxy tag; render code filters colonies and lanes by the active galaxy so the two maps never bleed together.

**Portal and map swap.** A rotating spiral galaxy renders as a distant object on the right edge of each map: on the Coalition map it leads to the Jade cluster, on the Jade map it leads back. Clicking it swaps the active galaxy, the background, and ship visibility and re-renders. Viewing the far galaxy is free.

**Full colony parity.** Jade colonies use the same detail panel and system view as the main map: a SYSTEM button and per-planet ENTER open the real system view (a central star, orbiting animated planets, zone cards) and the surface HUD, and each colony shows a landscape banner. Nothing is stubbed. Planets use the game's own animated sprites for uniform sizing, with a Dyson sphere at Tiangong and a quasar at Wukong Deep as exotics.

**Jade Exchange.** The twenty Jade tickers (JCH, YJT, TGB, YHA, SNB, BCP, LZL, HJA, MZQ, ZGO, TWD, WKD, ZHL, BCH, HSL, SILU, HTE, CZH, XTM, EMB) are real securities on a self-contained board: a separate id range (30000+) keeps their history from splicing with base tickers or funds, they are Social Credit denominated, and they price and step through the same market engine as every other stock. All twenty symbols were checked against the existing tickers for collisions.

**Sealed passage.** A server flag WORMHOLE_OPEN gates the exchange: while sealed the tickers are withheld from the tape and any order on a Jade symbol is rejected, and the colony panels and system-view HUD show a sealed notice. A dev-only endpoint (POST /api/dev/wormhole with a dev token and {open:true|false}) opens or seals the passage live; opening broadcasts the tickers onto the tape and flips the sealed UI to open. The client reads the flag from the server. Currently defaults open for testing.

**Exchange interface.** The market panel has a Coalition / Jade Exchange tab; Jade tickers show only under the Jade Exchange tab and are hidden from the Coalition list. Each Jade ticker has a company description in the house voice. A Jade theme toggle recolors the whole UI from the default phosphor green to a porcelain/celadon palette and swaps the FLESH MARKET wordmark to Chinese characters; the choice persists across reloads.

**Chinese translation layer.** A 文/EN toggle beside the Jade theme button switches the Jade galaxy's content to Chinese, scoped to the Jade galaxy only; the Coalition side stays English. Translated: the sixteen colony names and lore, the twenty exchange ticker names, the faction name, and the colony-panel labels and sealed notice. Deferred to a later pass with graceful English fallback: ticker descriptions, planet names and bonus lines, map node labels, and system-view titles. The choice persists across reloads. Colony lore is a first-pass translation and warrants a native review before it is treated as final.

**Distinct art.** The Jade cluster uses a jade nebula background and a white/porcelain faction glow so it reads as a different place. The Coalition map is unchanged.

**Changed files.**
- server/server.js Added the 20 Jade companies to the pricing engine, the WORMHOLE_OPEN flag, the sealed-trade gate, the init filter and wormholeOpen state, and the dev toggle endpoint.
- client/assets/galaxy.js Added the Jade faction, the sixteen Jade colonies with lore, planets, banners, suns, and lanes, active-galaxy filtering, the portal and map swap, the full-parity Jade detail panel, and the gated system-view HUD; wired WORMHOLE_OPEN to the server; translated the Jade detail panel (names, lore, labels, house names, sealed notice) via jadeT with a re-render hook on language toggle.
- client/assets/core.js Reads wormholeOpen from init and handles the 'wormhole' broadcast; added the market-view filter, the Coalition/Jade view and theme toggles, the twenty Jade ticker descriptions, and the JADE_I18N translation map with the jadeT helper and 文/EN toggle (translates Jade ticker names in the tape).
- client/style.css Jade theme palette override, market-view tab styles, and the logo-swap rules.
- client/index.html Added the porcelain glow filter to the galaxy SVG defs; added the 文/EN language toggle button and the head loader that restores the persisted language before paint.
- client/style.css Added the portal spin animation.
- client/assets/space/planets/jade/* Jade exotics (Dyson sphere, quasar) and the galaxy portal sprite.
- client/assets/space/backgrounds/jade_green.png Jade nebula background.
- client/version.json 1.1.9.13 -> 1.2.0.0.

---

## v1.1.9.13 (2026-07-19) - Solitaire drag and drop + tutorial game list (CLIENT)

Client only. Hard-refresh after deploy. No server or DB change.

**Solitaire drag and drop.** Added drag as the primary interaction, with click-to-move kept as a fallback. It is pointer-based so it covers mouse and touch from one code path: pressing a card and moving past a small threshold starts a drag (a face-up tableau card carries its valid run, or the top of the waste), a ghost follows the pointer, the drop target under the pointer highlights, and the drop is hit-tested with elementFromPoint. An illegal or off-target drop snaps back. A press without movement is treated as a click, so the existing tap-to-select, double-click-to-foundation, stock-draw, and Auto button all keep working; a small guard suppresses the click that fires at the end of a drag so the two do not both fire. Drag and click both call the same validated doMove path, so the server-authoritative scoring is untouched.

Verified: the mirrored deal and rule functions were not changed, so client and server deals still match byte-for-byte and client move logs still replay to the identical server score. A hand-simulation suite was run against the engine: invariants (52 unique cards conserved, foundations ascending by suit from Ace, no face-down card left on top, no face-up card below a face-down one) held after every one of 17000+ legal moves across 400 games and through 200000 random-move fuzz steps (no throw, illegal moves never mutated state), and a solvable deal replayed to 52 of 52 with the correct payout while a truncated log could not fake completion.

**Tutorial.** The casino slide listed eight games; updated it to the current eleven, adding Baccarat (Punto Banco), Sic Bo (three-dice board), and Solitaire (Klondike).

**Changed files.**
- client/assets/casino-solitaire.js Added the pointer-based drag layer (ghost, hover highlight, snap-back) and the post-drag click guard; click-to-move and the mirrored engine untouched.
- client/assets/tutorial.js Casino slide now lists all eleven games.
- client/version.json 1.1.9.12 -> 1.1.9.13.
- docs/CHANGELOG.md this entry.
- docs/MANIFEST.txt updated.

---

## v1.1.9.12 (2026-07-19) - Solitaire (Klondike), server-authoritative (SERVER + CLIENT)

Server and client, plus a new server file (server/solitaire.js). Hard-refresh after deploy. No DB change and no new npm dependency (it reuses the casino_rounds ledger), so git pull and pm2 restart is sufficient.

New casino game: Klondike solitaire, draw-3, one pass through the stock, no redeal. It is stateful and skill-based, so unlike the RNG games it cannot ride the one-shot casino_play path. It is made server-authoritative by replay: the server owns the deal and the score, the client only plays locally and submits a move log.

**Trust model.** solitaire_start commits the buy-in and opens a round via the existing casino_rounds ledger, returning a round id. The client derives the deal from that id using a PRNG mirrored byte-for-byte from the server, plays locally, and records a move log. solitaire_finish sends only the move log; the server replays it against the deal it derives from the same round id, validates every move, and pays foundation_cards * per-card plus a bonus for a full 52-card clear. The payout is entirely server-computed - the client never reports an outcome - so a tampered or foreign move log fails validation early and scores only its legitimate prefix (it can never inflate the count, nor transfer another deal's solution). The buy-in is committed at start so wins cannot be cherry-picked; an abandoned game is forfeited by the expiry sweep, and a mid-game server restart refunds it via the boot handler. solitaire_start also auto-forfeits any prior open solitaire round so a refresh never locks the player out.

**Verification.** Client and server produced identical deals across 2000 ids (including uuid shapes); 300 client-played move logs replayed fully server-side to the identical foundation count; the engine passed an adversarial suite (draw-from-empty rejected, fabricated foundation moves rejected, no score inflation, foreign logs score low, junk logs never throw); the payout cap never clamps a full win.

**Pricing (placeholder, tunable server-side).** Buy-in 250, per-card 20 (break-even about 12.5 of 52 cards), win bonus 500. A heuristic solver is too weak to estimate skilled play, so these are house-safe starting values to be retuned from the real foundation-count distribution, which is recoverable from the casino_rounds payout column. Probability that skilled play averages past the 12.5-card break-even (which would flip it player-positive) is judged low for this hard variant, but is not something a weak solver can rule out; severity is bounded (capped per game, tunable with no client change, visible in the ledger).

**New / changed files.**
- server/solitaire.js NEW. Deterministic deal + PRNG, move validation for all Klondike move types with auto-flip, foundation scoring, and replay (stops at the first illegal move).
- client/assets/casino-solitaire.js NEW. Klondike client: mirrors the deal and rules verbatim, click-to-move (double-click or Auto sends to foundations), builds the move log, and calls solitaire_start / solitaire_finish. Self-inits into #casino-solitaire.
- server/server.js Import of the engine; SOLITAIRE_* tunables; CASINO_CFG solitaire cap (backstop only, tracks the constants); solitaire_start and solitaire_finish handlers.
- client/index.html Solitaire subtab after Minesweeper and an empty pane after the Sic Bo pane.
- client/assets/core.js solitaire added to CASINO_PANES and CASINO_SCRIPTS (lazy-load).
- client/version.json 1.1.9.11 -> 1.1.9.12.
- docs/CHANGELOG.md this entry.
- docs/MANIFEST.txt updated.

Post-deploy check: open the Solitaire tab, New Game (confirm the buy-in leaves your balance), play a few moves, Cash Out, and confirm the credit equals foundation cards times the per-card rate.

---

## v1.1.9.11 (2026-07-19) - Baccarat Tie crash fix (CLIENT)

Client only. Hard-refresh (Ctrl+Shift+R) required. No server or DB change.

The Baccarat winning-hand highlight built its element id from the outcome (player -> bac-hand-P, banker -> bac-hand-B) but produced an empty suffix (bac-hand-) on a Tie, looking up a non-existent element and throwing a TypeError on .classList. The throw aborted the reveal callback, so on a Tie the result banner and bet-slip reset never ran and the table looked frozen. It fired only on Ties (about 1 coup in 10), so Player/Banker wins masked it during casual testing.

No money was affected: casino_play settles server-side and pushes the balance before the client reveal animation runs, so every Tie was priced and paid correctly (Player/Banker bets push, Tie bets pay) regardless of the client throw. The element lookup is now guarded - a Tie highlights neither hand, which is correct since both bets push.

**Changed files.**
- client/assets/casino-baccarat.js Guard the winning-hand lookup so a Tie no longer dereferences null.
- client/version.json 1.1.9.10 -> 1.1.9.11.
- docs/CHANGELOG.md this entry.
- docs/MANIFEST.txt updated.

---

## v1.1.9.10 (2026-07-19) - Casino bet-input hardening (SERVER)

Server only. No client change (no hard-refresh needed). No DB change and no new dependency; git pull and pm2 restart.

Adversarial testing of the 1.1.9.9 casino_play resolvers (Baccarat, Sic Bo) found that a positive-Infinity bet amount in the client payload flowed through parse() and produced an Infinity stake. It was not exploitable: the handler's affordability check (stake greater than cash) rejects an Infinity stake before any cash moves, and the finite-guard in safeAddCash prevents balance corruption regardless, so no money could be created and no round settled. Closed at the source anyway - both parsers now reject non-finite bet values (Number.isFinite) rather than relying on the downstream affordability gate to catch a malformed return. A stray Infinity is dropped (zeroed) if mixed with a real bet, or the bet is rejected as invalid if it was the only entry. Legitimate finite bets are unchanged.

Verified by a suite covering hostile input (no throw, no non-finite or under-counted stake), 500k fuzzed rounds (no gross ever exceeds the payout cap and no legit max win is clamped), an exact 216-outcome Sic Bo payout audit across all 52 spots, RNG uniformity (dice chi-square, 8-deck shoe composition, unbiased shuffle), Baccarat rule behavior (naturals stand, Tie pushes), and an arbitrage check (covering the whole board still loses to the house at 15.5 percent).

**Changed files.**
- server/server.js Both casino_play parsers (baccarat, sicbo) reject non-finite bet amounts.
- client/version.json 1.1.9.9 -> 1.1.9.10.
- docs/CHANGELOG.md this entry.
- docs/MANIFEST.txt updated.

---

## v1.1.9.9 (2026-07-19) - Baccarat + Sic Bo casino games (SERVER + CLIENT)

Server and client. Hard-refresh after deploy. No DB change and no new npm dependency (crypto randomInt was already imported and the casino_rounds ledger is reused), so git pull and pm2 restart is sufficient.

Two new gambling games, both built on the hardened casino_play one-shot path that roulette and horse races already use. The client sends only the bet selection; the server rolls with crypto randomness, prices the outcome, caps the payout, and settles stake-out/gross-in atomically. There is no client-reported payout, so the forgeable-win class closed across the 1.1.9.x casino work does not reopen here. Adding each game was one resolver plus a payout cap, with no change to the casino_play handler.

**Baccarat (Punto Banco).** Pure chance, no player decisions. The server deals an 8-deck shoe (crypto Fisher-Yates), applies the fixed third-card table, and prices the coup. Bets and gross multipliers: Player 2x, Banker 1.95x (5% commission on the win), Tie 9x, Player Pair and Banker Pair 12x. On a Tie the Player and Banker bets push (stake returned). The 12x cap in CASINO_CFG exactly fits the both-pairs win (24 gross on a stake of 2) without clipping. Edges verified by Monte-Carlo against published Punto Banco values: Player about 1.24 percent, Banker about 1.06 percent, Tie about 14.4 percent, pairs about 10.4 percent.

**Sic Bo (three dice).** Pure chance, full standard board: Small/Big, Odd/Even, single number (1/2/3:1 by count), specific double (10:1), any triple (30:1), specific triple (150:1), total 4 through 17, and two-dice combo (5:1). All 216 outcomes were enumerated exactly; every one of the 52 bet types lands in a 2.78 to 30 percent house-edge band with no player-favored bet. The totals payouts (4/17 at 60:1 down to 10/11 at 6:1) were derived from the true dice probabilities rather than a standard casino table, and two initially over-generous payouts (a specific double and the 4/17 total) were corrected inward. The one deliberately steep bet is the specific-triple lottery. The 160x cap sits just above the 151x specific-triple gross.

**New files.**
- client/assets/casino-baccarat.js NEW. Punto Banco table: five bet spots, chip controls, staggered deal reveal, history strip, phosphor-CRT styling. Self-inits into #casino-baccarat, plays via CasinoNet.play('baccarat', {bets}).
- client/assets/casino-sicbo.js NEW. Sic Bo board: unicode dice with a shake/settle animation landing on the server roll, data-driven 52-spot board with winning-spot highlight, chip controls. Self-inits into #casino-sicbo, plays via CasinoNet.play('sicbo', {bets}).

**Changed files.**
- server/server.js Added baccarat and sicbo resolvers to CASINO_ONESHOT (parse() rejects unknown bet spots and negative amounts before pricing) and their caps to CASINO_CFG, plus a shared helper block (shoe build, baccarat value/deal, Sic Bo pricing and totals table). No handler change.
- client/index.html Two subtabs (Baccarat, Sic Bo) after Horse Races and two empty panes after the minesweeper pane.
- client/assets/core.js baccarat and sicbo added to CASINO_PANES and CASINO_SCRIPTS (lazy-load).
- client/version.json 1.1.9.8 -> 1.1.9.9.
- docs/CHANGELOG.md this entry.
- docs/MANIFEST.txt updated.

Post-deploy check: open each new tab, place a small bet, confirm cash decreases on play and a win credits at the listed multiplier.

---

## v1.1.9.8 (2026-07-14) - Kick tab in Dev Logs + streaming OBS overlay (CLIENT)

Client only. Hard-refresh after deploy. No server or DB change.

**Kick sub-tab (Dev Logs).** Dev Logs was a single YouTube playlist embed; it now has two sub-tabs, `Videos` and `Live on Kick`. The Kick tab embeds the official Kick player (`https://player.kick.com/fleshmarket`), which shows the live stream when broadcasting and Kick's offline card otherwise, so it needs no live-detection. There is a best-effort LIVE badge (a direct Kick API fetch that may be Cloudflare-blocked, in which case it hides) and a Follow-on-Kick link. One inline script owns both iframes (`window.__devlogsSync`) so only the visible one loads; `core.js` defers to it with the old YouTube-only path as a fallback.

**Streaming OBS overlay (`obs-stream-anchor.html`).** A broadcast desk for streaming the game, separate from the news-anchor overlay. 1920x1080 transparent frame in three columns:
- Left rail: the Mr. Flesh relay facecam (the anchor's brain-in-jar portrait pulsing to a voice waveform) over a live market-movers panel (top movers by percent change, updated on tick).
- Middle: a framed GAME window (about 1048x900) for a Window/Game Capture, so the capture is a window, not fullscreen, and nothing overlaps it.
- Right: a Kick chat column that auto-embeds Kick chat via `chat.kick.cx` (a third-party embeddable widget, because Kick blocks iframing of its own popout); `?chat=0` falls back to an OBS browser source pointed at the Kick popout.
- Top bar (branding, live breadth, PLAY FREE / FLESHMARKET.IO) and a bottom funnel ticker weaving calls to action (Mr. Flesh voice, no em dashes) between live movers and breaking news.

It reads the same token-less guest WebSocket feed the anchor uses (init, tick, news, breaking_news), read-only. The facecam attempts mic capture on load, so with OBS launched using `--enable-media-stream --use-fake-ui-for-media-stream` the waveform tracks your voice with no prompt, falling back to a procedural signal otherwise. To use a real webcam, add a Video Capture source above the overlay over the relay box. URL params: `?guide=0` (hide setup labels), `?ws=`, `?boot=0`, `?kick=USERNAME`, `?mic=0` (procedural only), `?mic=1` (click card), `?chat=URL` (swap the embedded chat widget), `?chat=0` (disable the embed for an OBS source). OBS setup is documented in the file header.

---

## v1.1.9.7 (2026-07-14) - Dark background between windows (CLIENT)

Client CSS only. Hard-refresh after deploy. No server or DB change.

Follow-up to the bolder panel edges. A player noted the space between windows read slightly green while the top of the page read dark. Cause: `--body-bg` was `radial-gradient(ellipse at 50% 40%, #04130a 0%, #020703 80%)` — a green center fading to a dark edge. The header sits at the top (dark edge); the panels and the gaps between them sit in the green center. Same background, different position on the gradient.

Flattened `--body-bg` to the dark edge color `#020703`. Because the header and the inter-panel gaps both render this one background, they are now identical by construction. Also tightened `--panel-shadow` from `0 0 24px #1aff5e1a` to `0 0 10px #1aff5e14` so the panel bloom no longer bleeds green into the 12px gaps — the bold 1.5px border already defines each window, so the wide halo was redundant and was the remaining source of gap tint. Side benefit: panels now sit on a flat near-black field, which separates them even more cleanly than over the gradient. All still one-line tunable (`--body-bg` for the field, the spread/alpha in `--panel-shadow` for bloom).

---

## v1.1.9.6 (2026-07-14) - Bolder panel edges / window contrast (CLIENT)

Client CSS only. Hard-refresh after deploy. No server or DB change.

**The note.** A player pointed out the panels barely separated from the background, so the layout read as one dark field rather than distinct windows. Root cause in `style.css`: `.panel` used `border:1px solid var(--dim)` (`--dim` is `#1f7a3aaa`, a dim semi-transparent green) over `--panel-bg:rgba(8,30,14,0.22)` — a near-transparent fill, so panels were essentially the body gradient with a faint outline.

**The change.** Added a dedicated `--panel-edge` variable (`#2f9f4a`, brighter, 1.5px) and pointed `.panel` and `#chart` at it, and raised `--panel-bg` opacity from `0.22` to `0.5` so panels sit as a distinguishable surface (still translucent, so the CRT glow-through depth is preserved). Crucially this uses a *separate* variable from `--dim`, so inputs, dividers, the chatlog, and news accents keep the dimmer border on purpose — windows now read bolder than the controls inside them, which also tightens the visual hierarchy. The existing subtle panel glow (`--panel-shadow`) is untouched; this is the "bold, not neon" option from the mockup.

**Not touched.** Feature sub-panels that hardcode their own borders inline (casino panes, the limit-order box at `#0a3315`, etc.) still use their own dimmer edges. Bringing those in line with the window edge is a separate, more scattered pass. Everything is one-line-tunable: `--panel-edge` for the color/brightness, the `1.5px` in `.panel` for weight, `--panel-bg` alpha for fill separation.

---

## v1.1.9.5 (2026-07-14) - Stronger chess AI (CLIENT)

Client only. Hard-refresh after deploy. No server or DB change.

**The problem.** Casino chess ran a weak inline engine: a plain alpha-beta with a material-only evaluation, no move ordering (so pruning was poor), no transposition table, and fixed shallow depth by ELO. It played positionally blind and dropped pieces to the horizon effect. Meanwhile a much stronger engine already existed in the repo, `client/chess_worker.js` (ordered alpha-beta with MVV-LVA move ordering, a transposition table, iterative deepening with a time budget, depth cap 5 to 7 by ELO), and was never instantiated anywhere. It was dead code.

**The fix.** The game now uses the worker for the AI's move. Because it is a Web Worker, the search runs off the main thread, so the board no longer freezes while the AI thinks. Board and move formats are identical between the two engines, so the worker's returned move applies through the same `applyMove` unchanged. The inline engine is kept as an automatic fallback: if the worker cannot be created (e.g. a restrictive CSP, or `file://`), errors, or fails to reply within 4s, the AI move falls back to the inline engine so the game never stalls on the AI's turn.

**Engine upgrades (in the worker).** Evaluation was upgraded from material-only to material plus piece-square tables (the classic simplified-evaluation set), so the AI develops its pieces, contests the center, advances pawns sensibly, and keeps its king tucked instead of only counting material. Auto-queen promotion was added to the worker's pawn move generation (it previously left a pawn on the last rank un-promoted). Net effect: noticeably stronger tactical and positional play, especially at higher ELO where the deeper ordered search and the transposition table compound.

**Not touched.** Chess still settles its fee×2.5 win the same way (client-declared, bounded by the casino cap); this build is an AI-quality change, not a security change. Poker was not changed in this build (see the session notes on why it is being handled as its own focused build).

---

## v1.1.9.4 (2026-07-14) - Server-bounded drone mining bank (SERVER + CLIENT)

Client and server. Hard-refresh after deploy. No DB schema change.

**The hole.** Drone mining cash was client-authoritative. The mining game (an iframe) reported bank changes to the parent, and the parent pushed the browser's new cash TOTAL to the server via `{type:'mining_bank', sync:N}`, which set `actor.cash = N` with no validation. This is the same faucet class the casino sync used to be: a crafted `{"type":"mining_bank","sync":999999999}` set any balance, and it did not need dev tools (a proxy, extension, or short script sends it). It was left named and isolated when the casino faucet was closed, on its own message, precisely so it could be fixed next.

**Why this one is bounded, not recomputed.** Unlike a casino game, the server cannot roll the mining outcome. Mining yield is the output of an interactive skill+risk game: a seeded asteroid field, the player's piloting and route choices, RNG hostiles, fuel/heat limits, and survival (dying loses your carried cargo). Re-deriving the exact banked amount would require simulating the whole real-time game server-side, which is disproportionate for a minigame. So banked cash is BOUNDED instead: the server caps a run's credit to a plausible yield and clamps anything above.

**The fix (server-owned bounded deltas).** The reported total is now ignored. Cash moves through `mining_bank_delta {delta, reason}`, tagged by the game (it already sends these):
- `reason:'loadout'` (negative) is a run START: the server deducts the loadout cost (overdraft-bounded, a negative delta cannot mint cash) and opens a run window with a start timestamp.
- `reason:'banked'` (positive) is a run END: the server credits the reported profit but clamped to `MINING_MAX_YIELD_PER_SEC * elapsedRunSeconds`, with a hard `MINING_MAX_RUN_BANK` per-run ceiling as a backstop. If the run-start wasn't seen (e.g. a restart landed mid-run), it falls back to `MINING_RUN_FALLBACK_SEC` of assumed run length.

The server owns the balance throughout and reconciles the client's optimistic local value via the usual `me`/`portfolio` push. The client bridge (`core.js`) was changed to forward the delta and its reason instead of collapsing to a total; the mining game itself is unchanged. A run banking above the cap is clamped and logged to the dev panel as `mining_clamped` (reported vs paid vs elapsed), the same fraud signal the casino cap produces.

**Honest limitation.** This bounds and logs; it does not eliminate. Because the game can't be audited server-side without simulating it, a modified client can still claim up to the plausible ceiling per run (bounded to a yield rate over real elapsed time, not an instant total), which the log flags. The unbounded "set balance to anything in one message" faucet is gone. The default ceiling (`MINING_MAX_YIELD_PER_SEC=5000`) is set generous so it never clamps a legitimate run; it can be tightened from real best-run data (the `mining_stats` table records best-run profit) and the clamp log once live. All three bounds are env overrides.

---

## v1.1.9.3 (2026-07-14) - Server-authoritative roulette + horse races, casino play-speed fixes (CLIENT + SERVER)

Client and server. Hard-refresh after deploy. No DB schema change (the existing `casino_rounds` table records one-shot plays too).

**The hole.** v1.1.9.1 moved the casino STAKE server-side but left every game's OUTCOME in the browser: each game rolled its own result and sent the payout via `casino_result`, which the server only capped at `wager*mult + flat`. For roulette the client literally rolled the wheel (`Math.floor(Math.random()*ORDER.length)`) and reported the payout, capped at 36x with no flat ceiling. A crafted or modified client could claim `wager*36` every spin and compound it (a win funds a larger next bet), unbounded. Horse races were the same shape at 5x. The per-round time floor (`minDurMs`) was the only "did you actually play" signal and it never stopped a script (a script just waits it out); it mostly punished fast legitimate players.

**The fix (server rolls, atomic settle).** New `casino_play {game, input}` message. The client sends only its bet SELECTION (roulette slip, or horse pick+amount), never a payout. The server validates the input, rolls the outcome itself with `crypto.randomInt` (unbiased, unpredictable), prices it from its own result, and settles in one atomic step (stake out, gross in). There is no open round to fake a result on and no time gate, because the client no longer reports the outcome. The client animates the wheel/race to the number the server rolled. This is the same pattern the TCG pack purchase already uses ("the client never decides what it receives or what it costs"), now extended to the two pure-RNG games. The `wager*mult + flat` cap is kept purely as a backstop so a resolver bug still cannot overpay. The old client-declared `casino_bet`/`casino_result` path is refused for roulette and horse races (a stale or crafted client gets the `casino_stale` refresh nudge), which closes the loop: with no way to open a client-settled round for those games, there is nothing for a fabricated `casino_result` to land on. The roulette payout table was ported verbatim from the client `payoutFor` so gross matches exactly. `casino_play` results are written to the same `casino_rounds` ledger (opened and resolved in one tick), so the dev panel Casino Activity view and the `clamped` fraud signal cover them too.

**Math game paid nothing on fast sessions (SERVER).** The `mathgame` round is a 10-question session wrapped in one round, but its `minDurMs` floor was 15000ms while the session's forced client delays only guarantee ~9000ms. A player answering faster than ~600ms/question finished under the floor, so the whole session voided (Ƒ1 sentinel refunded, zero paid) despite correct answers, while the on-screen Earned counter still climbed. Floor lowered to 5000ms, below the ~9000ms guaranteed forced-delay floor, so a real session can never void while an instant scripted settle still trips.

**Blackjack rejected fast hands (CLIENT + SERVER).** A natural blackjack resolves in ~1100ms of hardcoded animation and an instant stand vs a pat dealer in ~700ms, both well under the old 3000ms `minDurMs`, so the best outcomes voided (you saw "BLACKJACK!" and your cash did not move). Floor lowered to 1500ms and the client now pads the settle send so a hand cannot report under ~1600ms from deal, with Deal kept locked until the round closes so a fast re-deal cannot collide with the still-open round. Deterministically no false rejects, floor preserved as an anti-instant-script bump.

**Scope.** This is the first slice of a broader casino move to server-authoritative outcomes (client sends inputs, server derives payout). Roulette and horse races were done first because they are both the highest-severity faucets and the cheapest to convert (pure one-shot RNG). Blackjack (stateful, medium), the puzzle games (server-generated + graded, medium), and poker/chess (harder, lower severity) remain on the client-declared-but-capped path with their time floors for now; the math and blackjack fixes above are the interim floors for those until they convert.

---

## v1.1.9.2 (2026-07-13) - Index price persistence + chat persistence + Dev Logs tab (CLIENT + SERVER + DB)

Client, server, and DB. Hard-refresh after deploy. **DB adds a `chat_log` table on boot** (additive, `CREATE IF NOT EXISTS`; starts empty). A restart applies the schema; no migration step.

**Index tickers reset to list price on restart (SERVER).** Capital House Index tickers snapped back to their listing price on every restart, discarding all trading movement. Cause was boot ordering, not missing persistence: `restoreMarketState()` reapplies saved prices only to tickers already in the live array, but fund tickers are registered later by `loadFundTickers()`, so their persisted price was skipped and `registerFundTicker` seeded them at `list_price`. Fix: `restoreFundTickerPrices()` runs right after `loadFundTickers()` and reapplies saved price/lnP/sigma/ohlc to fund tickers, setting their daily-open baseline to the restored price like every other ticker. The NAV anchor is untouched: `updateFundAnchor` derives it from `fundNavPerShare` (persisted holdings), so the ticker resumes at its last price and re-anchors to NAV as normal.

**Chat history wiped on restart (SERVER + DB).** Chat lived only in the in-memory `chatRings` map and was never persisted, so any restart or reset cleared all scrollback. Fix: a bounded `chat_log` table (`k`, `ts`, `payload`), written on each chat/system message after the transient check, pruned every 60s to the same 200-per-room bound as the ring, and reloaded into the rings on boot via `restoreChatHistory()`. New logins already receive `chat_history` (the full ring; the old "last 30min" comment in that block is stale, there is no time filter), so no client change was needed. Chat is now on disk (`chat_log`); the deploy restart itself clears the current in-memory chat one last time, and it persists from then on.

**Dev Logs tab (CLIENT).** New `Dev Logs` tab in the center tab bar embeds the Flesh Market News uploads playlist (`UU7jGc6Xo_-Koo8IyQCD9iQA`) at 16:9. The iframe src is applied on tab open and cleared on leave (attribute-level compare, since an empty src attribute reflects as the page URL through the `.src` property), so nothing plays in the background. Autoplay is muted (browser policy); the viewer unmutes. The tab is registered in both tab-switch paths: the tab-bar click handler (core.js) and the programmatic `window.showTab` (market-state.js), so ticker clicks that jump to Market also hide it. An `Open channel` link is always present as a fallback for an empty or unavailable embed.

**Tooling (repo root).** `apply.sh` mirrors the newest `FleshMarket_*.zip` from Downloads into the working tree (tracked files only, so `.env`, local DBs, and `node_modules` survive) and `ship.sh` deploys in one command (commit as `v<version>`, push, VPS pull + pm2 restart). Both refuse to run if the folder's git remote is not `jw-giles/Flesh-Market`. `.gitattributes` pins LF on `*.sh`; `.gitignore` now also excludes SQLite WAL sidecars (`*.db-shm`, `*.db-wal`, `*.db-journal`).

---

## v1.1.9.1 (2026-07-11) - Server-authoritative casino + activity audit (CLIENT + SERVER + DB)

Client, server, and DB. Hard-refresh after deploy. **DB adds a `casino_rounds` table on boot** (additive, `CREATE IF NOT EXISTS`; starts empty). A restart applies the schema; no migration step.

**The hole.** Every casino game computed its own outcome in the browser and reported the resulting balance to the server via `{type:'casino', sync:N}`. The server set the player's cash to whatever number arrived. No wager, no game, no outcome validation. A crafted WebSocket frame (`{"type":"casino","sync":999999999}`) set any balance, and it did not need dev tools open: a proxy, an extension, or a five-line script could send it. Cash minted this way then flowed into trades, wires, and titles, touching other players' positions, so it could not be cleanly clawed back.

**The fix (two-message protocol).** The single trusted-balance message is gone. Games now:
- `casino_bet {game, wager}` - server checks funds, deducts the stake, opens a server-tracked round, returns a server-generated `roundId`. The stake is now a server-held fact.
- `casino_bet_addon {roundId, amount}` - grows the stake mid-round (Blackjack Double, poker calls/raises) so the payout cap scales with total money in.
- `casino_result {roundId, payout}` - `payout` is the GROSS return (0 on a loss; stake+winnings on a win). Server credits `min(payout, wager*mult + flat)` per game. Anything above the cap is credited at the cap and logged `clamped`.

Because the wager is committed server-side before the outcome is reported, a client can no longer inflate both sides of the cap in one message. No bet-size limit and no net-worth gate: high rollers are unaffected, the cap scales with the wager they actually staked.

**Per-game caps** (from each game's real payout table): roulette 36x (straight-up), horse races 5x, blackjack 2.5x (3:2), chess 2.5x of fee, poker 1x + Ƒ5,000 flat headroom (PvE pot pays AI-held chips), and the no-stake puzzle games (sudoku Ƒ4,200, mathgame Ƒ900, minesweeper Ƒ450) carry their fixed reward in the flat term with a nominal Ƒ1 stake returned on win or loss so they stay free.

**Round lifecycle.** One open round per player per game. A result that arrives faster than a real round could take voids the round (stake refunded, zero payout) and is logged `rejected_fast`. A round left open past its per-game timeout (3 min for quick games, up to 60 min for chess) is swept and FORFEIT: the stake stays gone, because refunding an abandoned round would make every bet risk-free (play it out, report only wins, walk away on losses). On server boot, any round left open by a crash or restart is voided and the stake REFUNDED (players cannot trigger a restart, so this cannot be farmed).

**Dev panel.** New God Panel command `player_activity` returns a player's recent casino rounds (game, wager, payout, cash before/after, status, timestamp), surfaced in the Economy tab under a "Casino Activity" section (target a player, click Pull Casino History). `clamped` and `rejected_fast` rows are a built-in fraud signal: they surface anyone whose client claimed an impossible outcome, with the damage already capped, and the view flags the count at the top. Same table serves both the exploit fix and the audit view.

**Plinko removed.** The under-repair Plinko tab was backed by dead, unreferenced client code (the physics never worked with the engine). Removed the subtab, the pane, and `casino-plinko.js`. Dice was never built (roadmap only), so nothing to remove there.

**Mining split off.** Drone mining also used the `casino` channel to bank cash and is also still client-authoritative. It was moved onto its own `mining_bank` message so the casino faucet could be closed cleanly, and the remaining mining hole is now named and isolated (see the note in `server.js`) rather than hidden inside a shared channel. Mining is NOT fixed by this patch and needs its own server-side settlement next.

- **Server** (`db.js`): `casino_rounds(id PK, player_id, game, wager, status, cash_before, payout, cash_after, opened_ts, resolved_ts)` + two indexes. Accessors: `openCasinoRound`, `getCasinoRound`, `getOpenCasinoRound`, `getOpenRoundForGame`, `addCasinoWager`, `resolveCasinoRound`, `getExpiredOpenCasinoRounds`, `getAllOpenCasinoRounds`, `getCasinoActivity`.
- **Server** (`server.js`): `CASINO_CFG` per-game cap/timeout table; `casino_bet`/`casino_bet_addon`/`casino_result` handlers replacing the deleted `casino` sync; `sweepCasinoRounds` (forfeit sweep, 15s) + `voidOpenCasinoRoundsOnBoot` (refund on boot); `mining_bank` handler; `player_activity` God Panel command; a stale-client notice on the old `casino` message.
- **Client** (`casino-net.js`, new): `CasinoNet.bet/addon/result` promise wrappers over the protocol, correlating acks by roundId. Loaded before the games in `index.html`. (`core.js`): roulette rewired (slip stakes on Spin, settles on result); Plinko removed from `CASINO_PANES`/`CASINO_SCRIPTS`; mining `setCash` points at `mining_bank`. (`casino-blackjack.js`): blackjack (bet on deal, addon on Double, single gross settle) and horse races (bet on start, gross settle). (`casino-poker.js`): blind stakes on deal, calls/raises add on, pot settles at endHand. (`casino-chess.js`): fee stakes on start, win/draw/loss settle. (`casino-sudoku.js`, `casino-mathgame.js`, `casino-minesweeper.js`): nominal Ƒ1 round per puzzle/session/board, reward settled server-side. All legacy `{type:'casino',sync}` emitters removed. (`god-panel.js`): "Casino Activity" section in the Economy tab (`godPlayerActivity` sender + `god_player_activity` render with fraud-flag highlighting). (`index.html`): Plinko subtab + pane removed; `casino-net.js` include added; Casino Activity markup added to the God Panel Economy tab.

**Known follow-ups (not in this patch):** puzzle/board integrity (sudoku solutions, minesweeper mine positions are still client-checked; the cap bounds the payout but does not verify the puzzle was solved honestly); server-side cooldowns (sudoku/mathgame cooldowns are still localStorage and bypassable; the ledger will show repeat max-payout claims); mining server-side settlement; poker flat cap may clamp a large legitimate multiway pot (raise the flat if the ledger shows it biting).

---

## v1.1.9.0 (2026-07-08) - The Index: Capital Houses as tradeable tickers (CLIENT + SERVER + DB)

Client, server, and DB. Hard-refresh after deploy. **DB adds a `fund_listings` table on boot** (additive, `CREATE IF NOT EXISTS`; starts empty). A restart applies the schema; no migration step.

A player-run tier on top of the NPC market. A Capital House whose NAV is at or above Ƒ500M can list its NAV-per-share as a real ticker on the main tape, so lower-capital players can invest in a manager's book without joining the house. New **Index Funds** button beside the History button opens a browser of every listed house (price, NAV/share, premium/discount, float, manager) with click-through to the normal chart.

**The instrument.** A listed house becomes a real entry in the `companies` array (company id >= 20000, kept clear of the 0..N index range and the 999x specials, so `price_cycles` can never splice fund history onto a regular ticker). It rides the existing SWT/BRNC anchored-stock path (`_isAnchored`), but the anchor target is LIVE `log(NAV / totalShares)`, retargeted on every NAV snapshot (fund trade / deposit / withdraw / 30-min loop). beta 0, Misc sector, excluded from news and dividends: it moves only for two reasons, manager NAV changing and players trading, so premium and discount to book value are the visible sentiment layer.

**Shared-pool structure (the anti-rug).** Member ledger shares and the public float are claims on ONE NAV pool; the denominator for NAV/share is `internal ledger shares + the fixed 100k float tranche`. Consequences, all verified in isolation: (1) a secondary buyer does not dilute NAV/share (denominator is the fixed tranche, not live-outstanding); (2) torching NAV to hurt float holders costs the owner a multiple of the damage (owner's >=500M stake vs a float capped at 20% of NAV) - arithmetic suicide, enforced by structure not by rule; (3) secondary trades never touch fund cash (buyer cash voids like any ticker), so there is no external pot to drain.

**Listing gate is point-in-time.** Owner-only, `POST /api/funds/:id/list`, requires house NAV >= Ƒ500M at listing time. No trailing-history requirement: the shared-pool structure already blocks a deposit-list-withdraw rug on its own (withdrawal is NAV/share-neutral - pulling X cash burns exactly X/NAVshare ledger shares - and a lister can only withdraw against their own ledger claim, never the float's backing, so float holders are never harmed and the lister comes out down the fee + slippage + dilution). A trailing window would only have been a legibility filter, not a safety mechanism, so it was dropped. Ƒ25M fee paid from house cash, burned to FRS. The internal ledger is rescaled so NAV/(ledger'+float) lands at ~Ƒ1,000 (float untouched by this rescale). The 100k float is sold into the fresh ticker: the house eats the full impact-model slippage (a 100k x Ƒ1,000 notional slams the 12% per-order cap, so the float opens at ~12% discount to book), proceeds land in the pool as NAV where public holders own their claim. No paid re-issuance - the float is fixed.

**Split.** A fund ticker crossing Ƒ5,000 renumbers 10:1 (not the generic 1:1000 - a four-figure NAV/share ticker renumbering to Ƒ5 would sit far under its anchor and get yanked). The split scales the public float (holdings table), the internal ledger (`fund_memberships.shares`), AND the float figure on the listing row by the same ratio, in step, so NAV/totalShares never desyncs from the renumbered price. Regular tickers keep the unchanged 1:1000 path. Guarded by a `_fundTicker` flag.

**Exits (the one hard rule).** Delist (`POST /api/funds/:id/delist`) and disband both buy out ALL public float holders at NAV/share from house cash BEFORE any member payout, DB-driven so offline holders are included. If house cash can't cover the buyout, the exit is blocked until holdings are sold to cash. Disband settles the float first, then pays members at current share value as before.

**No shorting fund tickers** (v1): shorting your own house before tanking its NAV is the one torch play the shared pool doesn't neutralize; the short-open branch rejects fund tickers.

**No house-cash trading of fund tickers.** A Capital House (and the legacy guild fund) cannot buy or sell any listed fund ticker with pool cash. Buying its OWN ticker is circular and pumpable - the pool spends cash to hold a claim on itself, the impact push marks that holding up, NAV/share and the anchor follow, and the manager manufactures an upward move with money that never left their control (plus the recursive NAV term); buying ANOTHER house's ticker lets two houses pump each other one step removed. Both fund-fill paths (`executeFundTrade` and the guild `processFundProposals`) reject `_fundTicker` symbols. Managers can still buy fund tickers from their PERSONAL account like any player - that's real money at risk with the anchor still dragging price to NAV, so nothing is manufactured.

- **Server** (`db.js`): `fund_listings(fund_id PK, symbol, company_id, float_shares, list_nav, list_price, listed_at)`. Accessors: listing CRUD, `nextFundCompanyId`, `scaleFundLedgerShares` (ledger only), `scaleFundListingFloat` (split only), `getHoldersOfSymbol`/`getFloatOutstanding` (offline-inclusive float settlement).
- **Server** (`server.js`): Index config constants; `FUND_TICKERS` registry; anchor machinery (`fundNavPerShare` on the fixed-tranche denominator, `updateFundAnchor`, `registerFundTicker`/`unregisterFundTicker`, `loadFundTickers` on boot); `settleFundFloat`; list/delist endpoints (point-in-time NAV gate); disband settlement; fund-aware split branch; short-open rejection; anchor retarget in the 30-min loop; `index_listings` WS handler; listing status block in `fundDetailSnapshot`; `company_added`/`index_listed`/`index_delisted` broadcasts. A fund ticker seeds its `prevClose` baseline at listing (to its list price) and clears it on delist, so the detail-panel day-change % updates instead of sticking at +0.00% (a fresh ticker registered mid-day was never in the boot/midnight prevClose seed).
- **Client** (`index-browser.js`, new): Index Funds button (injected beside History) + listings overlay, click-through to chart. (`funds.js`): owner-panel Index list/delist controls with NAV-gate/eligibility readout and `_fmListIndex`/`_fmDelistIndex` handlers. (`core.js`): live add/remove of a listed ticker in `TICKERS` on `company_added`/`index_delisted`, plus in-place metadata update on house edit, so already-connected clients see it without reconnect. (`market-tools.js`): the stock detail panel shows the house description as a subtitle for fund tickers (HTML-escaped; falls back to a generic line if blank). (`tutorial.js`): new INDEX FUNDS slide (on the Capital Houses tab). (`index.html`): Index owner-panel markup + `index-browser.js` include. The in-game button and browser are titled "Index Funds". The server sends the house description on the fund ticker (`desc` in `init` / `company_added`) and keeps it in sync on edit.

Known, pre-existing (NOT introduced here): the limit-order restore block references `limitOrders` before its `const` declaration (temporal dead zone), so open limit orders are not restored across a restart. Latent in the codebase before this patch; flagged for a later fix.

---

## v1.1.8.8 (2026-07-08) - Cycle history date filter (CLIENT + SERVER)

Client and server. Hard-refresh after deploy. No DB schema change; `getPriceCycles` gains an upper-bound parameter (single call site, updated together).

The 1.1.8.7 history browser loaded a ticker's ENTIRE archive per click: at full depth that is 48 cycles/day x 152 days = ~7,300 rows shipped over WS and rendered as one table. This adds a date filter and changes the default view.

- **Client** (`cycle-history.js`): new filter bar under the overlay header: range chips **24H / 7D / 30D / ALL** plus **From / To** native date pickers (local-day boundaries, matching the local-time row rendering). **Default is now 7D** (~336 rows), not the full archive; ALL restores the old behavior in one click. Presets are rolling windows from now; picking either date switches to custom; clearing both dates falls back to 7D. Selecting a ticker and changing the filter share one request path (`requestHistory`). Empty states distinguish "archive still filling" (ALL) from "nothing in this range" (filtered). Detail header shows count + active range. Subtitle no longer claims a fixed ~5-month view.
- **Server** (`server.js`): the `cycle_history` handler accepts optional `from` / `to` (epoch ms). `from` is clamped to the ~5-month retention floor server-side regardless of client input; missing/invalid `to` means "up to now". Filtering happens in SQL, so only the requested range crosses the wire.
- **Server** (`db.js`): `getPriceCycles(companyId, sinceTs, untilTs, limit)` adds the upper bound (`cycle_ts <= ?`). The `(company_id, cycle_ts)` primary key covers the range scan; no new index.

No response-race guard was added: WS is FIFO per connection and the handler is synchronous, so the last request's response always arrives last. The existing `symbol !== selected` staleness check is kept.

---

## v1.1.8.7 (2026-07-07) - Cycle price history tab (CLIENT + SERVER + DB)

Client, server, and DB. Hard-refresh after deploy. **DB adds a `price_cycles` table on boot** (additive, `CREATE IF NOT EXISTS`). The table starts empty and fills forward one row per company per 30-min cycle, so it reaches ~5 months of depth about five months after deploy. There is nothing to backfill; the only prior price series is the ~33-minute in-memory 5s ring.

New "History" button beside the Watchlist button in the Companies panel. Click it to open an overlay listing all tickers; pick one to see the start and end price of each 30-minute market cycle for the last ~5 months, newest first, with per-cycle change %.

- **Server** (`db.js`): `price_cycles(company_id, cycle_ts, symbol, start_price, end_price)`, PK `(company_id, cycle_ts)`, index on `cycle_ts`. Keyed on the stable company_id, NOT the symbol glyph, so a symbol reshuffle cannot splice two firms' histories together. Functions `insertPriceCycle` (INSERT OR IGNORE) and `getPriceCycles` (window + newest-first).
- **Server** (`server.js`): the existing 30-min `_passiveIncomeTick` now records one row per company. Each company carries a per-cycle accumulator (`_cycleStart` / `_cycleStartTs`) seeded at every boundary; at the next boundary it writes {open time, start price, end price}. Open of cycle N = close of N-1. A restart drops the one partial cycle in progress, same failure mode as the holding snapshot. A `cycle_history` WS handler (mirrors the `chart` handler) returns the last ~5 months for a symbol.
- **Client** (`cycle-history.js`, new): injects the History button into the watchlist bar and opens an overlay (ticker filter list + per-cycle start/end table). Self-contained: it builds its own button and overlay and listens on the `fm_ws_msg` event, so it does not touch the center tab strip or the shared `showTab` logic. Retention is non-destructive; the 5-month bound is a view/query window, not a delete. Physical pruning was deliberately not added (193 MB/yr is noise; deletion is irreversible).

Note: the "History" button label is distinct from the existing `price_history` market upgrade ("Extended Price History," which extends live-chart depth). Rename either freely.

---

## v1.1.8.6 (2026-07-07) - Patreon linking fix + pledge reconciliation (CLIENT + SERVER + DB)

Client, server, and DB. Hard-refresh after deploy. **DB adds a `pending_pledges` table on boot** (additive, `CREATE IF NOT EXISTS`).

Two defects meant a new patron could not receive their tier through the normal flow:

- **The link button posted unauthenticated.** `client/assets/funds.js` sent the `/api/patreon/link` POST with no auth token, so `tokenFrom` returned null and the server answered 401 before ever storing the email. `patreon_email` was never written, so the webhook's email lookup always missed. Every "Link Account" click failed for everyone since the button was added. Fixed: the fetch now sends `x-auth-token: FM_TOKEN`, matching every other authenticated call in the client, and bails with "Log in first" when there is no session.
- **Pledges that arrived before linking were dropped.** Patreon fires `pledge:create` at pledge time, which is normally before the patron has opened the game to link. When the webhook could not resolve a player it returned 200 and discarded the event, and nothing re-checked on a later link. Now an unmatched create/update is queued in `pending_pledges` (keyed by Patreon member id, carrying the email when the payload includes it), and `/api/patreon/link` drains it the instant the email is stored, granting tier, spins, and (tier 3) the CEO epic in one shot. A `delete` event for an unlinked member clears its queued row so a pledge cancelled before linking cannot later self-activate.

Grant logic (set tier + member id + expiry, notify, guild sync, monthly spins, CEO drop) is now a single `grantPatreonTier` helper shared by the webhook and the link-time drain, so the two paths cannot diverge. CEO tier still respects `CEO_MAX`; a queued tier-3 that lands while the house is full stays queued and routes to admin.

Known boundary: if Patreon omits the email from the webhook payload (config dependent), the queued row has no email and cannot be drained by link. Resolve those via the God Panel `set_patreon` command by player name.

---

## v1.1.8.5 (2026-06-22) - FRS tax engine defaults to ENABLED (DB)

DB only. No client or server-handler change; a restart applies it.

The FRS weekly tax engine shipped DORMANT in 1.1.8.0 (`frs_settings.enabled` defaulted to 0), so every fresh setup started untaxed and the live settings row was seeded disabled and never persistently flipped. This makes ENABLED the default.

- New databases seed `enabled=1`.
- An existing `frs_settings` row is enabled exactly once, via a one-time guard column (`enabled_default_v2`). After that flip, disabling FRS from the God Panel FRS tab persists across restarts, because the boot step only ever enables a row that has never been flipped.
- Rates are unchanged: income 15.00%, capital-house withdrawal 15.00%. Adjust from the God Panel FRS tab.
- Once enabled, the engine assesses on the next Sunday noon America/Los_Angeles cycle.

Note: this means players are taxed on schedule. That is the intended live behavior.

---

## v1.1.8.4 (2026-06-22) - Ƒbay Title Exchange: trade collectible custom titles (SERVER + DB + CLIENT)

Server, DB, and client. Hard-refresh after deploy. **DB adds a `title_market` table on boot** (additive, `CREATE IF NOT EXISTS`).

Builds on 1.1.8.3's collectible titles to let players trade them, modeled on the existing card market (escrow on list, atomic buy, full price to seller, no fee).

- **Exchange UI lives inside the existing Ƒbay** (the inventory marketplace), not a separate panel or header button. A new `👑 Titles` option in the Ƒbay slot filter swaps the listings area to titles: For Sale (each title in its color with its rarity, by seller) and Your Listings (delist). The existing `+ List` form, in this mode, lists one of your held titles at a price; the rarity and sort controls apply. Buy/list/cancel go over WebSocket. (`title-market.js` renders into the Ƒbay `marketListings` area; `inventory.js` market functions `loadMarket`/`applyMarketFilters`/`showListForm`/`submitListing` branch to title mode when the Titles category is selected.)
- **Server** (`server.js`): handlers `title_listings`, `list_title`, `cancel_title_listing`, `buy_title_listing`. Listing escrows the title (removed from the seller and from their `ownedTitles`, unequipped if worn) and creates a listing snapshot. Buying runs one DB transaction: validate listing is active and not your own and not already held, check funds, debit buyer, credit seller the full price, grant the title, mark sold. Cancel returns the escrowed title.
- **Ownership is table-authoritative**: `buildAvailableTitles` now unions a player's `gifted_titles` rows, so a bought title surfaces in the picker from the table alone. Trade handlers therefore never re-save a stale player object (buyer cash is synced in-memory for the snapshot only; the seller is read fresh), avoiding any cash clobber. Concurrency is safe via the `sold=0` guard inside the transaction.
- **DB** (`db.js`): `title_market` table (id, seller, label/color/badge/rarity snapshot, price, sold flag, buyer) and functions `listTitleForSale`, `buyTitle`, `cancelTitleListing`, `getTitleListings`, `getMyTitleListings`. Rarity drives display value (common, rare, epic, legendary, custom).

---

## v1.1.8.3 (2026-06-22) - Collectible custom titles (multi-hold); FRS prepaid balance readout (SERVER + DB + CLIENT)

Server, DB, and client. Hard-refresh after deploy. **DB migration runs on boot** and preserves existing gifted titles.

### Custom titles are now collectible (hold many)
In 1.1.8.0 the `gifted_titles` table used `player_id` as the primary key, so a player could physically hold only one gifted title and granting a new one overwrote the old. Now a player can hold any number.

- **Schema**: `gifted_titles` moves to one row per title with `id` PK and `UNIQUE(player_id,label)`, plus a `rarity` column (`db.js`). A boot migration detects the legacy single-row table (no `id` column), renames it aside, builds the new table, copies the rows over, and drops the legacy table. Idempotent and additive; no titles lost.
- **Granting** (`gift_title`) now adds a title without disturbing any the player already holds (re-granting the same label refreshes its color/badge/rarity), adds it to `ownedTitles`, and auto-equips it. The dossier and ack report how many custom titles the player holds.
- **Color resolution** is now by equipped label: a gifted title's color/badge apply in chat, whispers, and portfolio only while that specific title is the equipped one, so each held title shows its own color when worn (`server.js`).
- **Removing** (`ungift_title`) removes one specific title by label, or the currently-equipped gifted title if no label is given (was: cleared the single title). The God Panel Remove button uses the custom-label field for this; the dossier lists held titles with the equipped one marked.
- **Client** (`market-state.js`): `title_state` now carries a `gifted` array; the title picker renders every held custom title in its own color with its badge, all individually equippable.
- New db helpers: `addGiftedTitle`, `removeGiftedTitle`, `getGiftedTitles`, `getGiftedTitleByLabel`, and `transferGiftedTitle` (groundwork for marketplace trading).

### FRS prepaid balance
- The tax panel's Pay Ahead section now shows the prepaid amount as a prominent deposit-account balance, so players can see their running FRS prepaid balance at the point of prepaying (`tax-panel.js`).

Groundwork note: `rarity` and `transferGiftedTitle` exist so titles can later be listed and traded on Ƒbay as collectible, rarity-valued items. That marketplace integration is not in this patch.

---

## v1.1.8.2 (2026-06-22) - Gifted Titles become selectable equippable titles (SERVER + CLIENT)

Server and client. Hard-refresh after deploy. **No DB change** (`gifted_titles` table and the `ownedTitles` player field already existed in 1.1.8.0).

In 1.1.8.0 a gifted title was an invisible auto-overlay stored in a side table, disconnected from the owned-titles system. It never appeared in the title picker (the picker renders owned/available titles, and the gifted label was in neither) and only recolored the chat name on the next message, never showing the label text. Now:

- **Granting a title** (`gift_title`) adds the label to the player's `ownedTitles`, drops any previously gifted label, and auto-equips it. It appears in the title inventory picker as a selectable Equip/Unequip row, rendered in its custom color with its badge, and the chat-name recolor shows immediately (`server.js`).
- **Color and badge are tied to equipping.** The gifted color/badge apply in chat, whispers, and the portfolio snapshot only while the gifted title is the equipped title (was: applied unconditionally whenever a gifted title existed). The player can equip a different title and switch back at will, like any other title.
- **Removing a title** (`ungift_title`) pulls the label from `ownedTitles` and unequips it if it was active.
- `title_state` now carries a `gifted: {label,color,badge}` field so the client picker can render the custom role in its real color (`market-state.js`: `getTitleColor` and the inventory row use it; gifted info is cleared on ungift). `sendTitleState` and the gift/ungift pushes include it.

Design note: the gift now auto-equips and is opt-in to keep visible (the player can unequip or swap it). If a gifted title should be forced-always-on regardless of what the player equips, that is a different model and not what shipped here.

---

## v1.1.8.1 (2026-06-22) - God Panel tab bar overflow fix (CLIENT)

Client-only. Hard-refresh after deploy. **No server/DB change.**

- The God Panel grew to 9 tabs in 1.1.8.0 (added `🏛 FRS`), but the tab row was a single non-wrapping flex row in a panel capped at `max-width:400px` with `overflow:hidden`, so the last tab clipped off-screen and the FRS tab was unreachable (`index.html`, `god-panel.css`). Fix: the tab row now wraps (`flex-wrap:wrap`); `.god-tab` is `flex:1 1 auto` with `min-width:84px` so tabs flow into two even rows; the panel widened to `max-width:460px`; and the scrollable content offset went from `calc(88vh - 95px)` to `calc(88vh - 135px)` to allow for the taller two-row header. Scales to further tabs without clipping.

---

## v1.1.8.0 (2026-06-22) - Gifted Titles; FRS weekly income tax; FRS surveillance (SERVER + DB + CLIENT)

Server, DB, and client. Hard-refresh after deploy. **DB migration runs on boot** (`initFRSTables`, additive `ALTER`/`CREATE IF NOT EXISTS`, no data loss). The tax engine **ships dormant** (`frs_settings.enabled = 0`); nothing touches a live balance until an admin enables it from the God Panel FRS tab.

### Gifted Titles (display-only name recolor)
- New God Panel **FRS** tab can grant a player a display title that recolors their name. Presets: `🍇 S'weet Trader` (#b83265), `😇 Angel Investor` (#8ab8ff), `💰 Loan Shark` (#7a3fb0), plus fully custom label/color/badge. `god_cmd gift_title` / `ungift_title`.
- Title color and badge apply in chat, whispers, and the portfolio snapshot, inserted **above** Patreon tier and **below** structural roles (President, Owner, Dev, Debtor, escaped Syndicate, Cyborg/Guild). New `gifted_titles` table; `setGiftedTitle` / `clearGiftedTitle` / `getGiftedTitle` in `db.js`.

### FRS weekly income tax
- New engine in `server.js` assesses tax every **Sunday 12:00 America/Los_Angeles** (DST-correct via `Intl.DateTimeFormat` offset math; a per-minute `frsScheduleTick` fires once per boundary and is crash-safe via `last_run_ts`).
- Taxes the **week's gain** in taxable net worth (cash + long/short equity + short collateral), default **15%**. Fund stake is excluded from taxable net worth. Losses can carry forward as a credit that offsets later gains (runtime toggle). Dev and Owner accounts are exempt. First assessment baselines with no retroactive tax.
- **Pooled funds are taxed at withdrawal, not weekly.** Applies to both Capital Houses (`/api/funds/:id`) and the Guild hedge fund (`/api/fund`). Deposits and withdrawals adjust the income-tax basis symmetrically so moving money between your own cash and a fund is income-tax-neutral; the only charge on fund money is a withdrawal tax (separate `withdraw_tax_bps`, default 15%), routed to the treasury. This closes the shelter where fund stake (excluded from taxable net worth) could otherwise dodge the weekly tax.
- **Pay Taxes Here**: a `🏛 Taxes` header button (new `tax-panel.js`) appears once the FRS is active. Shows next assessment time, taxable net worth, gain this cycle, estimated tax, balance owed, and prepaid/loss credit. Players can pay a balance (`pay_tax`) or prepay ahead of going idle (`prepay_tax`); `tax_status` reports current state. Prepaid credit is applied before cash on future assessments.
- New columns on `players` (`play_seconds`, `tax_basis`, `tax_owed`, `tax_prepaid`, `tax_loss_credit`) and new `frs_settings`, `frs_tax_history` tables. God controls: `set_frs`, `get_frs`, `run_frs_now`, `frs_forgive`.
- Tutorial gains an FRS slide (UNIT-7) before orientation complete.

### FRS surveillance (dev-facing)
- Per-minute playtime accrual for online players (`addPlaySecondsBulk`), 15-minute position snapshots (`frs_position_snapshots`, capped 200/player), and a global executed-trade log (`frs_purchase_log`, capped 20000). God Panel `frs_player` pulls a per-player dossier (playtime, tax state, recent trades, tax history); `frs_recent` streams recent market activity with a min-notional filter.

---

## v1.1.7.9 (2026-06-16) - News watchlist filter; Corpo-Cards collection sort (CLIENT)

Client-only. Hard-refresh after deploy. **No server/DB change.** Batch B continued.

- **News watchlist filter** (`market-tools.js`, `core.js`) - the existing news filter (text search + good/bad/neutral tone) gains a `★` toggle that shows only news whose ticker is on your watchlist (`fm:watchlist`). `renderNews` now stamps each `.news-line` with `data-sym`; the filter reads it and dims/collapses non-watchlisted lines. Clearing the filter resets the toggle.
- **Corpo-Cards collection sort** (`tcg/tcg-app.js`) - `renderCollection` previously hardcoded a cost sort. Added a Sort by selector: Cost (asc, default - unchanged behavior), Attack (desc), Health (desc), Rarity (desc by rank common<rare<epic<legendary), Name. Non-unit cards (no attack/health) fall back to 0 and sort last on those keys. Faction/shiny filters and the click-to-list behavior are untouched.

---

## v1.1.7.8 (2026-06-16) - Chart time axis fixed to real elapsed time; DOUBLE DOWN button (CLIENT)

Client-only, `client/assets/core.js`. Hard-refresh after deploy. **No server/DB change.** First two of Batch B.

- **Chart time axis** - OHLC bars are 5s each (`BAR_MS_F=5000`), but the bottom time axis assumed 500ms/point (`secTotal = n * 0.5`), so it understated the real span by ~10x and never widened when you owned the extended-history (`price_history`) upgrade. Now a parallel `_waveTimes` buffer keeps a real timestamp per point (OHLC `t` was being discarded on seed); the axis labels are computed from actual timestamps and fall back to the old estimate only if timestamps are missing. The visible window now grows with the upgrade.
- **DOUBLE DOWN** - each long position row in `#pnlBox` now has a `2×` button that buys an equal number of additional shares at market via `marketAPI.buy`, doubling the position, behind a single confirm showing approx cost. `event.stopPropagation()` so it doesn't trigger the row's navigate. Cash, day-trade cap, and buy cooldown stay enforced server-side. Longs only (`p.qty > 0`).

---

## v1.1.7.7 (2026-06-16) — Batch A UI: clickable P&L tickers, sell fee, dividend badge, tappable stock toasts, auto-accum wording (CLIENT)

Client-only UI batch. CLIENT (`client/assets/core.js`, `sound.js`, `market-orders.js`, `market-upgrades.js`, `client/index.html`): hard-refresh after deploy (assets are served `no-cache`). **No server or DB change.**

- **P&L tickers clickable** — `#pnlBox` position rows now navigate to the stock's Market page on click (`FMGotoSymbol`), matching the house holdings and bar-chart behavior.
- **Sell dialog shows the fee** — the sell modal now displays the trade fee (0.25%, mirrors server `TRADE_TAX_BPS=25`) and net proceeds, alongside sale value.
- **Dividend badge** — positions in dividend-paying sectors (Finance/Insurance/Energy/Tech, mirrors server `DIVIDEND_SECTORS`) show a 💰 badge in the P&L list.
- **Tappable stock toasts** — `showToast` gained an optional `symbol` (and now honors the `duration` arg callers were already passing, which was previously ignored). Earnings toasts are wired to open the stock on tap; other stock toasts can opt in by passing the symbol.
- **Auto-Accumulate wording** — clarified the reserve as cash you set aside per symbol that auto-buys spend (not your spendable cash), funded/withdrawn any time. Removed the contradictory "never touches your main balance" line and reworded the cancel prompt away from "returns to your balance."

---

## v1.1.7.6 (2026-06-16) — Trade integrity: market-impact fill exploit + auto-accumulate day-trade dodge (SERVER)

Server-only. Closes a money exploit in the large-order impact model and a day-trade-cap bypass. SERVER (`server/server.js`): `pm2 restart fleshmarket` required; **no client or DB change** in this patch (it carries the earlier 1.1.7.4/1.1.7.5 client + DB changes if not yet deployed).

**Market — fills now execute at the price they create (the short "always profits" exploit)**
- Large orders (> impact threshold) filled at `c.price * (1 ± slip/2)` but moved the tape the full `slip` (`lnP ± slip`). So the order filled at *half* the impact while the market settled at the *full* impact — a permanent gap between the trader's fill and the resulting price. That gap was harvestable: short big (fill above the depressed market) then cover in sub-threshold chunks at the depressed price, or symmetrically buy big then sell small. Most visible as "short while holding nets more than just selling," and as the short's locked collateral (set from the fill) exceeding its cover liability (marked at the moved price), so net worth jumped the instant a short opened.
- Fix: all eight fill sites (personal buy/sell/short/cover, Capital House trades, legacy guild vote-passed trades) now fill at `c.price * Math.exp(±slip)` — exactly the post-tape price. Fill == resulting market price on both sides, so the round trip nets ≈ −tax and the gap is gone. Sub-threshold fills (`slip == 0`) are unchanged. **Trade-off:** orders above the threshold now pay the *full* slippage they cause (was half) — this is the cost of keeping the price impact intact while killing the arb.

**Market — auto-accumulate no longer dodges the day-trade cap**
- The day-trade cap counts round trips; a manual buy issues a ticket and the closing sell consumes it. Auto-Accumulate buys issued **no** ticket, so selling auto-accumulated shares never counted as a round trip — an end-run around the cap. Auto-Accumulate buys now issue a buy ticket like a manual buy. (Side effect: selling auto-accumulated shares in the same cycle now correctly counts as a round trip, including the 2× scalping tax.)

---

## v1.1.7.5 (2026-06-16) — Capital House cost basis + short liquidity gate (SERVER + DB + CLIENT)

Two changes: give house holdings a real cost basis (so the Portfolio %-column is gain-vs-entry like personal P&L, not the ticker's daily move), and require liquid cash backing to open a short. SERVER + DB + CLIENT (`server/db.js`, `server/server.js`, `client/assets/funds.js`): `pm2 restart fleshmarket` required; client assets are served `no-cache` and revalidate on next load (hard-refresh if in doubt). **DB migration is additive + idempotent.**

**Capital House — real cost basis on holdings**
- `fund_portfolios` previously stored `(symbol, qty)` only, so the Portfolio %-column showed the *ticker's daily market move*, not the house's gain — buying a stock up 4% on the day read as `+4%` even at your entry. Houses now carry a weighted-average entry price.
- DB (`server/db.js`): additive `avg_cost` column on `fund_portfolios` (`ALTER … ADD COLUMN`, idempotent). `setFundPortfolioBuy` maintains the weighted average on buys (mirrors `player_cargo.addCargo`); `setFundPortfolioQty` now **preserves** `avg_cost` on sells (the old `INSERT OR REPLACE` would have wiped it). `getFundPortfolio` returns `avg_cost`.
- Backfill: on startup, existing holdings with no basis are reconstructed by replaying the logged `fund_activity` buy/sell history (price is recorded per trade). The replay is **validated against the current qty** — if it reconciles, the basis is set; if not (incomplete history), basis stays 0 and the client shows a `·` placeholder rather than a wrong number. `fund_activity` is never trimmed, so normally-traded houses reconcile fully.
- Server snapshot returns `avgCost` per holding; client `_gBuildHoldings` computes `((price/avgCost)-1)*100` (gain vs entry, `null` → `·` when unknown). The holdings list and the bars both switch to gain-vs-entry, matching personal P&L. Funds can't short (sells cap at holdings), so no negative-basis edge.

**Market — short liquidity gate**
- Opening a short now requires **liquid cash ≥ 3× the shorted notional** (`price × shortQty`), checked server-side at order time in the `order` handler before any state changes. It's a **balance check, not a lock** — cash isn't consumed; the short's proceeds are still locked as collateral and the 1.65× margin call is unchanged. This re-adds an entry barrier on top of the collateral model (which had removed upfront margin).
- A mixed order that both clears a long and opens a short is **rejected as a whole** if the short portion fails the check (the long isn't partially sold). Limit orders can't open shorts (sell fills cap at holdings), so the gate sits only on the market-order naked-short path the short modal uses.

---

## v1.1.7.4 (2026-06-16) — Capital House pane retention + per-recipient broadcast, sector allocation, automated-trade markers (SERVER + CLIENT)

Four fixes: stop in-house actions bouncing to Overview, stop `fund_update` leaking the actor's perspective to every member, add a Sector Allocation panel to the house Overview, and mark automated trades in the live feed. SERVER + CLIENT (`server/server.js`, `client/assets/funds.js`, `client/assets/sound.js`, `client/index.html`): `pm2 restart fleshmarket` required; client assets are served `no-cache` and revalidate on next load (hard-refresh if in doubt). **No DB schema change.**

**Capital House — Portfolio/Manage stop bouncing to Overview**
- Buying/selling, inviting, depositing, and every other in-house action used to call `openFund()`, which force-reset the sub-pane to **Overview**. `openFund` now detects an *in-place refresh* (re-opening the house already in view) and re-asserts the **current** pane instead, so a trade from **Portfolio** stays on Portfolio and the holdings list re-renders with the new position. The trade hint still prints `✓ BUY n× SYM executed`.

**Capital House — `fund_update` is now per-recipient (Manage invite/join bug)**
- Every `fund_update` broadcast computed **one** `fundDetailSnapshot(fund, ACTOR)` and sent that identical payload to all members. `isOwner` / `isMember` / `myRole` / `my*` are viewer-specific, so a non-actor viewer rendered the *actor's* perspective: the owner sitting on **Manage** when a member was invited/joined got `isOwner:false`, which hid the owner panels and bounced them to **Overview** ("elements missing"). Members also briefly saw each other's personal stake.
- New `broadcastFundDetail(fundId)` loops the membership and sends **each member their own** `fundDetailSnapshot(fundId, member)`. All nine live route broadcasts, `broadcastHouseUpdate`, and the edit-name/description broadcast now route through it. Client `onFundUpdate` keeps `__currentFundData` in sync with the push. The legacy single-guild path and the commented-out savings-interest block are untouched.

**Capital House — Sector Allocation (Overview)**
- New **Sector Allocation** bars under the Performance block on the house **Overview**, mirroring the personal P&L sector breakdown (reuses the global `sb-*` styles). `_renderFundSectors` groups the house's live-valued holdings by sector and shows each sector's share of position equity. Allocation only — not gain/loss.

**Market — automated-trade markers in the live feed**
- `broadcastTradeFeed` carries `auto` + `src`; the feed renders `*L` for limit-order fills, `*A` for auto-accumulate fills (`*` generic automated), and leaves **manual** clicks unmarked. NPC market-sim trades are intentionally left unmarked (they would swamp the feed). Auto-accumulate fills now pass the flag; limit fills already carried `isLimit`.

**Known gap (separate change)**
- The Portfolio holdings **%-column** under the breakdown graph still shows the **ticker's daily market move**, not gain-vs-entry, because `fund_portfolios` stores no cost basis. A true house cost-basis P&L (to match personal P&L) is staged but not in this patch — it needs an additive `avg_cost` schema change + backfill from `fund_activity`.

---

## v1.1.7.3 (2026-06-15) — Capital House buy-cooldown UI: red-out + live countdown (SERVER + CLIENT)

Makes the 30-min house buy cooldown obvious instead of dumping a raw `buy_rate_limited` string on a blocked click. SERVER + CLIENT (`server/server.js` snapshot field, `client/assets/funds.js`): `pm2 restart fleshmarket` required; `funds.js` is served `no-cache` so it revalidates on next load.

**What players see**
- After a house buy, the **Execute** button reds out (disabled, red/monospace) and a `⏳ NEXT BUY mm:ss` line ticks down below the trade row — the same lock-and-clock idiom as the day-trade limit.
- **SELL stays enabled** during the cooldown (sells are uncapped). Flipping the side toggle to SELL unlocks the button; flipping back to BUY relocks it while time remains.
- The trade hint now shows the friendly server message (with the wait time) instead of the error code — `guildPost` prefers `d.msg` over `d.error`.

**How it stays correct (server-authoritative, mirrors day trades)**
- `fundDetailSnapshot` now returns `buyCooldownMs` (remaining, derived from `getLastFundTradeTs` — 0 for non-player funds) and `buyCooldownWindowMs` (the full window, so the client never hardcodes 30 min). `renderFundDetail` calls `applyBuyCooldown(f.buyCooldownMs)`, so the countdown is right on first open, immediately after a buy (via `openFund`'s re-fetch), on reload, and on every `fund_update` broadcast.
- The button click handler keeps a fallback: a buy that still returns `buy_rate_limited` (clock skew, stale panel, direct API) syncs the lock to the response's `retryInMs`.
- The countdown element is injected once and reused; a 500ms ticker re-paints and self-clears when the window elapses.
- Dev (`flsh`) and guild (`patreon`) funds report `buyCooldownMs: 0`, so the lock never shows there — matching the server-side exemption.

**Tested**
- UI functions exercised against a DOM mock (the real functions, eval'd from source): lock on buy+cooldown, counter shown with time, unlock on SELL, relock on flip back, unlock at 0, single element creation, `mm:ss` formatting.

---

## v1.1.7.2 (2026-06-15) — Capital House trade integrity: tape impact + buy rate limit (SERVER + DB)

Closes a frictionless extraction path worth ~1B SC/day, plus a defense-in-depth buy cooldown. SERVER + DB-logic (`server/server.js`, `server/db.js` — additive helper, no schema change): `pm2 restart fleshmarket` required, no client cache concern.

**The hole**
- Personal market orders move the ticker: orders above `IMPACT_THRESHOLD_C` (Ƒ1,000,000) notional pay slippage and push the tape, and the trader eats their own impact (fills off the post-impact price). Capital House trades (`executeFundTrade`) and the legacy guild fund (`processFundProposals`) did neither — they filled flat at the live quote and never touched `c.lnP`.
- That asymmetry is the exploit: a house buys a block flat (no impact), the price gets pumped (by personal orders or a second account), and the house dumps the block flat at the top — no slippage on the cheap entry, none on the expensive exit, and the dump doesn't drag the realized price down. Round-trip is free money; the player's stake in the house's NAV balloons.

**Fix 1 — impact symmetry**
- Extracted the slip formula and tape-application into two shared module functions, `impactSlip(notionalC, sideSign)` and `applyTapeMove(c, lnDelta)`, so personal orders, Capital Houses, and the legacy guild fund all price impact through one code path (no drift between them). The personal hot path now calls these — verified byte-identical to the previous inline math (0 mismatches across a price×qty×side sweep).
- `executeFundTrade` (Capital Houses) and `processFundProposals` (legacy guild): buys now fill at `price·(1 + slip/2)` and push the tape up; sells fill at `price·(1 − slip/2)` and push the tape down — exactly the personal model. Activity logs and headlines now show the actual fill price, not the pre-impact quote.
- Under threshold, `slip = 0`: fund trades fill flat and move nothing, so ordinary house activity is unchanged. Only large (exploit-scale) orders bite, capped at `IMPACT_MAX_FRAC` (12%) per order. A simulated immediate pump-dump round-trip now posts a net loss instead of a profit. This makes fund round-trips negative-sum exactly like personal trades, so cross-account pump-dump (house A pumps, account B sells into it) is net-negative across the two accounts — the same invariant as two colluding personal accounts the game already tolerates.
- Special/pinned stocks (e.g. FLSH) are held to `slip = 0` in the guild path so the pin can't be disturbed; `executeFundTrade` already excludes `_special` symbols.

**Fix 2 — Capital House buy rate limit**
- A player house may execute at most one buy per `HOUSE_BUY_COOLDOWN_MS` (default 30 min, env-tunable). Enforced inside `executeFundTrade`, so it covers EVERY buy path: direct executive/Trader trades, vote-passed proposals (timer auto-resolve and `maybeResolveEarly`), and owner-executed proposals. A rate-limited proposal buy resolves as `failed_exec` — the same graceful outcome as an insufficient-cash buy; the direct-trade and owner-execute routes return `400 { error:'buy_rate_limited', retryInMs, msg }`.
- **Sells are uncapped.** The cooldown only gates accumulation.
- Restart-safe with no new schema: the window is derived from the fund activity log via a new `getLastFundTradeTs(fundId, type)` (`MAX(ts) WHERE type='trade_buy'`). A rejected buy writes no activity row, so only a *successful* buy advances the window. Tested against the real SQLite engine (window boundary, sells-don't-block, latest-buy-wins, per-house isolation, exemptions).
- Per-house, not per-actor: a 5-member house still gets one buy / 30 min, not five. Dev (`flsh`) and guild (`patreon`) funds are exempt.

**Out of scope, flagged**
- The rate limit closes the *direct executive trade* fast path and the *self-passed proposal* fast path (a solo house in vote mode passing its own proposals). It does not touch sells or sub-threshold grinding; with Fix 1 those are no longer free-money anyway.
- Price impact removes the *free* extraction (the asymmetry), not all coordinated wash-trading. The residual cost to a patient cross-account pumper is set by the `IMPACT_K` / `IMPACT_MAX_FRAC` constants and applies equally to personal-account collusion; that's a tuning question, not a structural hole.
- The 30-min cooldown also applies to legitimate vote-passed buys: if a house buys twice within the window (e.g. an owner direct-buy then a vote passes 10 min later), the second resolves `failed_exec`. Acceptable for an anti-grind cap; raise `HOUSE_BUY_COOLDOWN_MS` or scope it to direct trades only if it bites real governance.

---

## v1.1.7.1 (2026-06-15) - Collapsible right-panel sections + flex chat (CLIENT)

Right panel: Wire Credits and Leaderboard collapse to reclaim vertical space for chat. CLIENT-only (`client/index.html` + `client/style.css`): hard-refresh, no `pm2 restart`.

- Wire Credits (`#transferSection`) and Leaderboard (`#leaderboardCompact`) are now collapsible. Each header is a clickable toggle (`role=button`, keyboard Enter/Space) with a chevron that rotates to show open/closed state. Both default to collapsed.
- The real mechanism: `#chatBox` was a fixed `height:420px`, so collapsing the sections below it would only have left dead space. It is now `flex:1 1 auto; min-height:240px`, so within the viewport-bounded `#rightPanel` flex column the chat box grows to fill whatever the collapsed sections free up. Side effect (intended): on tall desktop viewports the chat now grows past 420px even with both sections expanded, instead of capping at 420 with empty space below.
- State persists per section in `localStorage` (`fm_wire_collapsed`, `fm_lb_collapsed`), matching the existing `fm_chat_font_pct` pattern. No saved value = collapsed (markup default); `0` = expanded, `1` = collapsed.
- DOM-safe: `#board` (leaderboard render target) and all transfer input ids (`#toName`, `#amt`, `#xfer`) are unchanged; the leaderboard rows are now one level deeper but `#leaderboardCompact #board` is a descendant selector so styling and the renderer are unaffected.
- No player-visible prose changed; no em dashes introduced.

**Known tradeoff:** the Leaderboard (net-worth flex board) now starts hidden, so the social-proof/competition signal is off by default until a player expands it. If that costs more in engagement than it gains in chat space, flip the leaderboard's default by removing `collapsed` from its class in `index.html` (one token); Wire Credits defaulting collapsed is uncontroversial.

---

## v1.1.7.0 (2026-06-14) - Corpo-Cards: the in-game card game (SERVER + DB + CLIENT)

The in-game trading card game, **Corpo-Cards**, plus a player card market, deck-listing rules, and a casino card-art pass. SERVER + DB + CLIENT: `pm2 restart fleshmarket` AND hard-refresh.

**Where it lives**
- Tab structure: the in-game card game is now ONE top-level **Corpo-Cards** tab (formerly **Arena**). The card-pack store moved out of Store -> Corpo-Cards into a **Card Packs** view inside this tab; the Store tab now holds Titles / Inventory / Ƒbay / Slots only. The Corpo-Cards tab views are Play, Decks, Collection, Rules, Card Packs, Ƒbay.
- Ƒbay card market: a new **Ƒbay** view in the Corpo-Cards nav where players buy and sell Corpo-Cards for Social Credits. Cards are pack-only assets listable at any player-chosen price (free, player-driven collectables market, no fee, mirroring the item market's no-sink model). List from the Collection tab (click a card -> price dialog); browse and buy on the Ƒbay tab; cancel your own listings there. Server-authoritative: `tcg_list_card` / `tcg_buy_card` / `tcg_cancel_card_listing` / `tcg_card_listings`. Listing escrows one copy by decrementing collection qty (`tcg_card_market` table); buy delivers the card and moves cash in ONE SQLite transaction with RELATIVE cash updates (`cash=cash±price`), which is safe because the server loads each player fresh from the DB per message. Seller is notified live if online. Listing a card removes it from play: a saved deck is only playable if you currently own (un-listed) every card it uses, so listing a card a deck needs makes that deck unplayable (the row shows `N listed`, Play disabled) until you cancel the listing (the copy returns) or sell it (then you swap the card out). Enforced at the deck list, the play picker, and match start (`startMatch`), with a note in the deck builder; starter decks are exempt. PvE matches run client-side, so the gate is client-side.
- Rules tab: a Rules view was added to the Corpo-Cards nav (right of Collection) covering objective, turn structure, Assets, Orders, Battlecry/Deathrattle, all keywords (Taunt, Charge, Rush, Divine Shield, Lifesteal, Poisonous, Windfury), decks, fatigue, and factions, in the game's own terms (House/Solvency/Liquidity/Assets/Orders). No em dashes in the copy.
- Match view compaction: the in-match layout was tightened to fit a standard viewport without scrolling (hero bars, board min-heights, the log panel, and inter-section margins trimmed; board and hand cards kept full-size). Measured ~723px tall vs ~838px before.
- Cache-busting: the TCG scripts (`tcg-app.js` and its deps, where the card CSS and logic live) are loaded with a `?v=` query so a deploy is never served from a stale browser cache (this also covers the shared `lazyLoad` used by galaxy/fleshbook/dev-comms). In addition, the server now sends `Cache-Control: no-cache` on all `.html` and `.js` (forcing revalidation every load: 304 when unchanged, fresh on deploy) and `max-age=86400` on static art. Together these stop the browser from running an outdated `tcg-app.js` after a deploy. The dynamically-injected TCG script was previously cached past hard-refreshes, which froze Abaddon cards (and panel changes) on an old version.
- Corpo-Cards tab (right of Fleshbook, formerly "Arena") -> the game hub: **Play** (start a PvE match vs the AI using a faction starter or a saved deck), **Decks** (deck-builder gated to cards you own, saved to your account), **Collection** (everything you own, faction filter + shiny-only toggle), plus Rules, Card Packs, and Ƒbay.
- Bugs tab button removed (Fleshbook covers bug reports); `dev-comms.js` and `#bugsTab` left intact and unlinked, so restoring it is one line.

**Server-authoritative pack economy (`server/tcg/packs.js`, `server/server.js`)**
- Pack buying does NOT use the casino's client-trusted pattern. The server owns the price, the rarity roll, the shiny roll, the cash debit (`safeAddCash`), and the collection/deck writes. The client sends `tcg_buy_pack` / `tcg_save_deck` / `tcg_delete_deck` and only renders what it is sent.
- Five packs, tunable constants in `packs.js`: Starter (F25,000, mostly commons, no floor, 2% shiny), Standard (F150,000, >=1 Rare, 4% shiny), Premium (F750,000, >=1 Epic, 9% shiny), Guild Crate (F500,000, Dwarves-only pool, >=1 Rare, 10% shiny), and The Vault (F5,000,000, guaranteed Legendary, epic-heavy, 15% shiny). Prices are scaled to the live economy (a typical player clears ~100k in days and is a millionaire inside a week or two), so anything that reliably rolls Epic or Legend is priced high. `packs.js` gains a per-faction pool filter (`buildPool` / `poolFor`) for the Guild Crate, and uses `floorRarity:'legend'` for the Vault guarantee.
- WS handlers: `tcg_collection`, `tcg_buy_pack`, `tcg_save_deck`, `tcg_delete_deck`.

**Persistence (`server/tcg/tcg-db.js`, `server/db.js`)**
- New additive tables: `tcg_collection(player_id, card_id, variant, qty)` and `tcg_decks(player_id, slot, name, faction, cards, updated_at)`. CREATE TABLE IF NOT EXISTS, no migration risk. `db.js` calls `initTcg(db)` at the end of `initDB()`.

**Deck-builder + play (`client/assets/tcg/`)**
- Builder is gated to cards you own and enforces the same `validateDeck` the server uses: 20 cards, one faction + neutrals, max 2 of a card (1 for legendaries), and you cannot add more copies than you own. Decks save to one of 9 slots.
- PvE matches run the rules engine client-side (deck save/load is server-backed). Opponent is the heuristic AI on a faction starter. Faction starters are always playable, so a new account with an empty collection can play immediately and build custom decks as it collects.
- Shiny is an orthogonal collectible variant: any card can roll shiny, tracked as a distinct `(card_id, variant)` row, rendered with a holographic sheen + SHINY tag. Matches deal in card ids, so shiny is cosmetic only.

**Content: Dwarves faction, Abaddon faction (`cards.js`, `deck.js`, `card-art.js`)**
- New sixth faction **Dwarves**: 50 deck-legal cards (24 common / 16 rare / 6 epic / 4 legend) plus two summon tokens (Apprentice, Pit Crew). Identity is the Guild labor caste: value through work, continuity through ruin. Mechanics are tribe synergy (anthems that buff your other Dwarves), summon-swarm, deathrattle continuity, taunt / divine-shield walls, priest heal and lifesteal, and traveler draw. Every effect uses helpers already in the engine, so no new keyword was added and the rules engine is untouched. Each member carries `tribe:'dwarf'` so synergy reads it.
- The **Abaddon** legendaries are now their own seventh faction (`faction:'abaddon'`), no longer a neutral splash. All ten are legendaries, so a mono-Abaddon deck is a deliberately top-heavy boss deck; its starter pairs the ten legends with cheap neutrals for an early game. `set:'abaddon'` is retained so the purple-glow styling survives. Pre-launch change, so no live deck is affected by pulling them out of neutral.
- Both factions are registered in `FACTIONS`, each gets a starter deck (so the AI opponent and an empty-collection player can use them), and both are wired into the builder faction picker, the collection filter, and per-faction card colors (Dwarves bronze, Abaddon purple).
- Art: 50 vintage archival portraits added at `client/assets/tcg/art/dwarves/` (grayscale + alpha, ~44KB each, ~2.15 MB total), resolved via a new `['dwarf', name]` branch in `card-art.js`.

**UI fixes**
- Artist credit: an "Art by subotai" link (to subotai-khudozhnik.itch.io, opens in a new tab) sits under the Corpo-Cards header title, matching the portrait-picker credit, added per the artist's request for use of the card and portrait art.
- Tab strip is a single strand: `.tab` gets `white-space:nowrap` + `flex-shrink:0` (labels never wrap, tabs never squish) and `.tabs` gets `flex-wrap:nowrap` + `overflow-x:auto` (the row scrolls horizontally if it overflows instead of wrapping to a second line or growing taller). This fixes both the earlier thick-tab wrap and the Arena-on-a-second-row wrap.
- Bug-report button moved from the tab strip into the header, right of Discord. The `#bugsTab` pane and `dev-comms.js` are unchanged; a hidden `data-tab="bugs"` element keeps the existing tab handler wiring, and the header button triggers it.

**Pre-ship hardening**
- `cards.js` (dual CommonJS/browser file) is now loaded in `packs.js` via `createRequire` instead of a default ESM import. A default import of it returns undefined on Node 22.5/22.6 (no ESM syntax-detection), which crashed the server on boot; `createRequire` resolves it on the CommonJS loader on every supported Node. The card loader no longer constrains the Node floor (`node:sqlite` already requires >=22.5, which the VPS runs).
- `tcg_buy_pack` grants the cards first and debits cash (`safeAddCash`) only after the grant transaction commits. Previously a throw inside the grant could take the cash and leave the player with phantom cards; the new order fails closed (error sent, no charge).
- Em dashes purged from player-visible card-game strings (tooltips, banners, reveal caption, log marker). Remaining em dashes are code comments only; the U+2212 in the deck-builder is the minus-button glyph.
- Fixed blank cards in Collection, the pack-opening reveal, and the deck-builder pool. `cardEl` resolved a card's def from a live entity (`.def`) or a `.defId` object but not from a bare string id, which is exactly what those three callers pass; a string fell through and rendered an empty frame. It now resolves a string id through `CARDS`. In-match board/hand cards were unaffected (they pass live entities). Pre-existing since the card game was built; surfaced on first real pack-open.
- Card faces and pack-opening reveal. Cards now render an element-motif background tinted by faction color (cropped from the wrapper art, full-bleed behind the portrait) instead of a flat dark gradient, so there is no black behind the figures. The pack-open reveal shows each card as a sealed wrapper of the same motif and color that peels open frame by frame, then the card pops in, flowing straight into the matching background. Wrapper sprites under `client/assets/tcg/wrap/<element>-<color>/` (27 sets x 8 frames); background tiles under `client/assets/tcg/bg/<element>-<color>.png` (27 tiles). `FAC_WRAP` in `tcg-app.js` maps faction to color (one-line dict). Non-portrait cards (ships, orders) drop the old small element-face and show the motif alone. The bottom name/text panel is a light gradient, and the name and description text each carry their own dark outline (text-shadow), so the text reads on bright gold and white motifs without needing a near-opaque dark panel behind it. Earlier the panel had to be dark enough for unshadowed text, which read as a black box over the lower third of text-heavy cards. The pack-open reveal preloads the motif tiles when the TCG UI mounts and waits for each card's motif to finish loading before flipping it face-up, so a card never reveals on its black base while the tile is still downloading behind the wrapper-frame load storm (this showed as black backgrounds during opening but not in the collection). Separately, the rarity glow on rare/epic/legendary/shiny cards in the reveal was a `box-shadow` on the slot, which is larger than the card (150x170 vs 104x158); the near-opaque reveal backdrop showed through the gap between the card and the glowing slot edge and read as a black box framing only the glowing cards. The glow now sits on the card element itself, so it hugs the card and there is no gap to frame.
- Dwarves appear less often in cheaper packs, via a per-pack `dwarfBias` weight in `packs.js` applied when picking a card within a rolled rarity. Starter pulls Dwarves ~12% of the time (down from a ~48% pool baseline), Standard ~28%, Premium ~46%; the Guild Crate stays Dwarves-only and the Vault is unbiased. Tunable constants.

**Casino: pixel-art playing cards (`casino-cards.js`, `casino-blackjack.js`, `casino-poker.js`)**
- Blackjack and Poker now render real pixel-art cards from a shared sprite-sheet renderer instead of Unicode card glyphs. New `casino-cards.js` exposes `FMPokerCard` (canvas) and `FMPokerCardHTML` (markup), backed by a sprite sheet at `assets/cards/poker-deck.png` (880x464, 48x80 cells, clubs/spades/hearts/diamonds per rank group). Both tables call it when loaded and fall back to the old text glyphs if it is not, so a failed sheet load degrades gracefully rather than breaking the table. Card backs and face-down hands use the sheet's back tile.

**Not yet built**
- PvP / server-authoritative match loop. Matches are PvE for now.

---

## v1.1.6.0 (2026-06-13) - market dynamics rework + large-order impact (SERVER + DB)

Ships as one patch. The pieces are coupled: making news a real driver creates a front-running vector, so the gap mechanic lands with it; removing the gravity that auto-reverts price requires persisting the spawn origin or the runaway backstop fires off a stale value. SERVER + DB only, no client change. Deploy is `pm2 restart fleshmarket`, no hard-refresh.

**Predictability cut (`server/server.js`, `stepMarket`)**
- Removed the 6-hour spawn re-home. Re-anchoring the gravity reference to the current price every 6h produced the predictable "always returns to recent center" oscillation traders farmed. `_spawnLnP` is now a fixed origin.
- Removed the +50% graduated pullback (40% trigger, 0.8-2% yank). This was the core "fade the extremes always pays" mechanic and the single most farmable pattern in the engine. Trends are now allowed to run; direction is no longer auto-reverted. The far lifetime-gain backstop (+394%, +1500%) and the F5000 split are the only remaining ceilings.

**Wildness cut (`server/server.js`, `stepMarket`)**
- Per-stock sigma ceiling lowered 0.0015 -> 0.0009 in the vol-clustering clamp.
- Fat-tail multipliers softened 2.2/1.4 -> 1.7/1.25.
- Removed the invisible rare in-tick event (0.05%/tick, 0.3-0.9% uncaused jump). Uncaused spikes read as rigged and are un-tradeable noise. All discrete moves now carry a headline.

**News is now a real driver (`server/server.js`, `genHeadline`)**
- A company headline previously moved price ~0.02-0.08% (flavor). It now moves ~0.8-2% on a real headline, ~0.4% on weird. The move splits into an instant gap (70%, applied the moment the headline prints so reading the public feed gives no tradeable lead) plus a thin decaying drift delivered over ~2 minutes (`c.newsBias` / `c.newsBiasTicks`, summed into the per-tick delta). Earnings remain an instant gap and are unchanged.

**Large-order market impact (`server/server.js`, `order` handler)**
- Orders above F1,000,000 notional now pay slippage and move the tape; sub-threshold orders are unchanged (fill at quote, zero impact). Computed per executed leg, not per order qty, so a tiny short-cover attached to a huge order cannot move the tape.
- The trader eats their own impact: the fill is priced off the move they cause (buy avg ~ +slip/2, sell avg ~ -slip/2), then the tape (`c.lnP`) is pushed once after all money math. A big correct bet partly closes its own edge instead of printing free size.
- Symmetric by default: big buys and covers push up, big sells and short-opens push down. Curve: F1.5M -> 2%, F2M -> 4%, F3M -> 8%, F4M+ -> 12% cap (stock at F20). `IMPACT_SELL_SIDE=0` makes it buys-only.
- Threaded through all four legs (short cover, long buy, normal sell, short open incl. long-clear). Long-buy now sends an explicit "Insufficient funds." error instead of failing silently.

**Required companion fix (`server/server.js` restore, `server/db.js` save)**
- `_spawnLnP` (the origin the lifetime-gain backstop measures from) was set at module-load to `log(random 8-60)` and never persisted or restored. The 6h re-home masked it. With the re-home gone it would fire the backstop off a stale value after every restart. `_spawnLnP` is now saved in market state and restored, falling back to the restored price if no persisted origin exists.
- Init price is now seeded deterministically by company name (`rngSeeded(name,'initprice')`) instead of `Math.random()`. Masked by restore on the live DB; only affects fresh boots and newly added companies.

**Tunables (env)**
- `IMPACT_THRESHOLD_C` (default 100000000 = F1,000,000 notional in cents), `IMPACT_K` (0.04), `IMPACT_MAX_FRAC` (0.12), `IMPACT_SELL_SIDE` (1 = symmetric, 0 = buys-only), `NEWS_GAP_FRAC` (0.7), `NEWS_DRIFT_TICKS` (240).

**Known limitation**
- Notional gating is per-order. A determined whale can split a large buy into multiple sub-F1,000,000 orders to dodge entry impact (accumulation costs no day-trades; only paired sells consume the 3-per-cycle cap). Closing this needs rolling cumulative-notional tracking per player and symbol, deferred. The symbol-reshuffle reroll vector (restore keyed by symbol, symbols assigned by an order-dependent dedup loop) is also still open; seeded init only makes fresh boots deterministic.

---

## v1.1.5.8 (2026-06-11) - Father Xen branching codec dialogue + faction-sync fix (CLIENT)

**Codec engine (`client/assets/codec.js`)**
- New faction-router tree node: `id:{ branch:{ faction, match, other } }`. When the engine reaches it, it silently redirects to `match` if the caller's faction equals `faction`, else to `other` - no text, no button, the player never sees the branch. Reads `window.gPlayerFaction` (falls back to `window.ME.faction`). Linear quests and the Mr. Flesh tree are untouched.

**Father Xen lore conversation (`client/assets/codec-data.js`)**
- Father Xen (Void Collective tech-priest) gets a GM-authored branching tree (14 nodes) and is now `enabled`. Opens on a greeting with two paths: the question menu and a work stub ("Not yet. Return to me later.").
- Question menu: the Collective's goal (deflects into a "have you been talking about me" Yes/No that converges, then the mission monologue, then a follow-up on why others dislike them), why they hack other factions (surveillance / outer-planet isolation), their beliefs (unity, then an Abraxas explainer), and his read on Mr. Flesh's mandate.
- Faction-aware augment beat: after the augment line, the priest "scans" the caller. Void Collective members get the recognition line ("two scholars of Abraxas..."); everyone else gets the rejection ("you lack the augment..."). Implemented with the router node.
- The placeholder COMMUNION quest is parked (kept as dormant data, `quests:[]` set) so the lore tree plays in the idle slot, mirroring Mr. Flesh. Restore the quest by removing that empty array once the Void questline ships. Rep `ver` v0.13 -> v0.14.
- Graph-validated (no dangling refs, all 14 nodes reachable, every node can reach a hangup, faction-branch targets resolve, no em dashes in player-visible text) and flow-smoke-tested including the void/non-void routing.

**Faction-sync fix (`client/assets/galaxy.js`, `client/assets/core.js`)**
- Found while testing the augment branch: it routed everyone to the rejection line even after joining Void. Root cause was not the dialogue. `galaxy.js` is an IIFE, so its `gPlayerFaction` is a module-local variable; the `welcome` and `faction_joined` handlers updated only that local, never `window.gPlayerFaction` - the global the codec (and the header badge, and any cross-module reader) actually uses. `ME.faction` is set only at login, so it was stale after a mid-session join, and `core.js` gated its `window.gPlayerFaction` write behind a `typeof ... !== 'undefined'` check that never passed.
- `galaxy.js`: `welcome` and `faction_joined` now mirror the faction to `window.gPlayerFaction` and `window.ME.faction`, so a mid-session join is reflected immediately without a reload.
- `core.js`: portfolio sync now sets both whenever the snapshot carries a faction (removed the dead guard). The portfolio refresh the join already requests reinforces it.
- Effect: joining Void routes Father Xen to the recognition line live; every other consumer of `window.gPlayerFaction` is fixed too.

**Planet-detail lore: cold-terminal rewrite (`client/assets/galaxy.js`)**
- The detail page is a trader's data feed, not a lore page. Stripped the AI prose cadence (antithesis "it is not X, it is Y", editorializing, faction personhood) from every planet detail that was not hand-authored. Rewrote 16 colonies as cold descriptions of what the place is plus its economic and control facts: the 13 outer/financial/industrial colonies (New Anchor, Cascade Station, Frontier Outpost, The Hollow, Vein Cluster, Aurora Prime, Dust Basin, Nova Reach, Iron Shelf, The Ledger, Signal Run, Scrub Yard, Margin Call), the two Void-home colonies (Null Point, The Escrow), and Limbosis. Limbosis was re-anchored to Mr. Flesh's canonical line about it (former weapons lab, built the laser aimed at Abaddon's black holes, design later installed at Flesh Station) and rendered cold. Population and the corporation list are dropped from the lore text since the panel already renders them separately. The five remaining authored colonies (Lustandia, Gluttonis, Abaddon, Eyejog, Flesh Station) are left untouched. Lore text only; no mechanics, companies, or bonuses changed. No em dashes in any player-visible string.

CLIENT-only: hard-refresh, no server restart needed. Sits on top of 1.1.5.7.

---

## v1.1.5.7 (2026-06-11) - short-selling rework: collateral, gated margin calls, debt settlement, Debtor brand, net-worth fixes + countdown UI (SERVER + DB + CLIENT)

Everything below ships as one patch. The short mechanic was rebuilt end to end; the pieces are coupled (a margin trigger without locked proceeds just re-opens the money printer), so they land together.

**Net-worth correctness (`server/server.js`, `server/db.js`)**
- Two sites computed equity with `price * Math.abs(qty)`, counting a short as a positive asset - net worth rose as a short went underwater. Now signed `price * qty` everywhere: a short subtracts its cover cost. This fixed a live overcharge on the 45% dunce-escape fine for short-holders.
- One net-worth helper (`playerNetWorth`) is now the single source of truth for the portfolio snapshot, the dunce-escape fine, and the leaderboard: cash + signed equity + locked short collateral + Capital House stake.

**Collateral-locked shorts (new `short_coll` table)**
- Shorting no longer credits proceeds to spendable cash. Proceeds (minus tax) lock as per-symbol collateral (`shortCollC`); the only way to realize cash from a short is to cover at a profit. This kills the short-extract-then-get-wiped exploit at the source.
- No share cap, no upfront cash margin (the old 500-share cap and 50% margin gate are gone). Cover releases the proportional collateral and pays the cover cost from it; cash is only needed for a loss beyond collateral.
- Migration-free: collateral is 0 for shorts opened before this deploy (their proceeds are already in cash), so legacy positions are auto-grandfathered with no double-count - unit-proven that legacy and new shorts net to the identical figure.

**Gated margin calls (new `margin_calls` table)**
- A short crossing 1.65x its average entry (65% underwater) issues a margin call with a 3-hour deadline, persisted so the clock survives restart and logoff. Covering the position or the price recovering below 1.60x clears it (hysteresis stops flapping). A 5s sweep issues/clears for connected players and enforces deadlines for all active calls, re-checking live state so a player who covered or recovered is never settled.

**Debt settlement at the deadline - NOT a total wipe**
- If a short is still >= 1.65x at the deadline, it's force-closed and the realized loss becomes a debt, collected from cash first, then by liquidating long holdings (largest first) only as much as the debt needs. A player who can pay keeps the rest and is NOT dunced. Only a player whose loss exceeds their entire account is zeroed - the natural bankruptcy case - and that player gets the Debtor brand + dunce. Wealth (including stock) is on the hook, so you can't shield it in holdings and walk away. Fund stake is never touched.
- Dunce keeps trade access (gates chat only); escape is reason-gated - margin-call dunce = flat Ƒ25,000, mod (`/dunce`) dunce = 45% of net worth.

**Debtor brand**
- Bankruptcy grants the `Debtor` title (auto-owned, equippable). Worn, name + chat go poop-brown (`#6b4423`), below structural roles but overriding tier/cyborg colour.

**Net worth counts tied-up money**
- Leaderboard and net worth now include locked short collateral and each player's Capital House stake (their share of every fund's NAV, across the legacy fund and multi-house funds - pro-rata by shares, not credited to the owner).

**Client (`client/index.html`, `client/assets/core.js`, `client/assets/shorts.js`)**
- Margin-call banner: shows the called symbol, a live countdown (HH:MM:SS, red in the final 15m, "SETTLING…" at zero), and a COVER NOW button. Driven by the `marginCall` field in the portfolio snapshot, so it survives reconnect and clears on resolve; the server pushes a portfolio refresh on issue/clear so it appears/clears instantly.
- Short modal fixed for the collateral model: removed the stale 500 cap and 50% margin gate (which were blocking the now-allowed shorts), relabeled "proceeds received" to "collateral locked (held, not cash)" and added the liquidation price (entry x1.65).

Unit-tested: net-worth signed/invariance, collateral lock (zero spendable cash from shorting), cover P&L, 1.65x trigger, gating state machine (issue/clear/recover/hysteresis), debt settlement (solvent-from-cash, solvent-via-liquidation, bankruptcy, healthy-assets-preserved), and the countdown banner. Limit orders confirmed unable to open shorts (no bypass).

Untested live (no DB/WS in the build sandbox): schema auto-create on first boot, WS broadcasts on settlement, and the per-call fund-stake DB reads in `snapshotPortfolio` (fine at current concurrency, cacheable later).

SERVER + DB (two new tables, `short_coll` and `margin_calls`, both `CREATE TABLE IF NOT EXISTS` on boot; no manual migration) + CLIENT. Back up `server/fleshmarket.db`, `pm2 restart fleshmarket`, then hard-refresh (client assets aren't cache-busted).


---

## v1.1.5.6 (2026-06-11) - Mr. Flesh branching codec dialogue (CLIENT)

**Codec engine (`client/assets/codec.js`)**
- New branching dialogue mode alongside the linear quest scripts. A rep may carry `tree:{ start, nodes }`; each node is one NPC line plus response options rendered as left-aligned amber buttons. Selecting an option jumps straight to the next NPC line - the option label is NOT re-spoken as a player line (the player already read it on the button, so echoing it made them read it twice). Options either chain to another node, loop back to a question menu, or hang up (`end:true` -> CHANNEL CLOSED). Trees play only in the idle/all-done slot, so a future Mr. Flesh quest pitch or active-quest line still takes priority over the lore tree.
- `typeLine` gained a completion callback and the skip-typing path was unified into `finishLine` (full text from `st.fullText` instead of re-reading `st.cur.lines[idx]`, which would have thrown in tree mode). `buttons()` clears the `opts` column layout on every repaint so quest/close buttons render normally after a tree. Option hotkeys 0-9 (0 selects the 10th option, if present). Linear quest scripts (with authored `from:'you'` lines and the YOU frame) are unchanged - the no-echo rule is specific to button-selected tree options.

**Mr. Flesh lore conversation (`client/assets/codec-data.js`)**
- Replaced the idle "Get back to work..." brush-off with a GM-authored branching lore tree (21 nodes). Call opens on "Make it quick." with two paths: "I have some questions" (the lore menu) and "Do you have any work?" (stub: "Not now, but do you need anything?" - the future questline entry point; "A few things" returns to the opening, the other option hangs up).
- Lore menu has nine questions: the four faction threads (Coalition, Void, Merchant Guild, Syndicate, each chaining per the source script and looping back to the menu) plus five single-answer questions (origin, why anyone plays a rigged game, who sets Social Credit value, debt consequences, why the casino floor exists). Each single answer closes back to the menu or hangs up.
- War-timeline lore lives entirely in the Coalition thread: co1 has the Coalition formed from the fourteenth corporate war sixty years ago, then winning the fifteenth (and last) war twenty-nine years ago and holding the ruling seat into the modern day. The earlier standalone "when is the sixteenth war" question was removed as redundant; its fact was folded into co1.
- `idleLine` kept as a fallback if the tree is ever removed. Rep `ver` bumped v0.11 -> v0.12. Graph validated (no dangling node refs, all nodes reachable, every node has a path to hangup, no em dashes in player-visible text); jsdom smoke test covers the no-echo tree flow, the work stub loop, faction-thread loops, hangup, the folded co1 lore, hotkey selection, and a linear-quest regression (30 assertions).

CLIENT-ONLY: hard-refresh, no server restart needed.


---

## v1.1.5.5 (2026-06-10) - cancel auto-accumulate (SERVER + CLIENT)

**Auto-Accumulate cancel (`server/server.js`, `server/db.js`, `client/assets/market-upgrades.js`)**
- You could arm/pause/fund/withdraw an auto-accumulate but never remove one. Added a Cancel button per config: it deletes the config and returns the full segregated reserve to your main balance.
- New `auto_accum_cancel` WS handler reads the reserve, deletes the row (`deleteAutoAccum`), then credits cash by the exact reserve. Single-threaded + synchronous SQLite means the read/delete/refund completes before the accumulate engine can fire again, so there is no overspend race; money is conserved by construction, and cancelling a nonexistent config is a no-op. Verified against an in-memory SQLite copy of the schema (row removed, sibling configs and other players untouched, cash up by exactly the reserve).

SERVER CHANGE: requires `pm2 restart`, then hard-refresh the client.

---

## v1.1.5.4 (2026-06-09) - Ƒbay listings show item art (CLIENT)

**Ƒbay market listings (`client/assets/inventory.js`)**
- Listings rendered the slot emoji (`SLOT_ICONS[item.slot]`) instead of the item sprite, so every entry showed a generic glyph. Swapped in the existing `itemIcon()` helper, which renders the pixel-art `item.img` when present and falls back to the slot emoji otherwise. Catalog art is available for all listings regardless of ownership (`ITEM_CATALOG_CLIENT` lives in this module), so no lazy-load was needed. Inventory/equip views already used `itemIcon`; only the market list was missing it. The SLOTS spin reels keep slot emojis on the outer reels by design.

CLIENT-ONLY: hard-refresh, no server restart needed.

---

## v1.1.5.3 (2026-06-09) - Capital House holdings click-to-ticker nav (CLIENT)

**Capital House portfolio (`client/assets/funds.js`)**
- Applied the personal-P&L click-to-navigate behavior to Capital House / fund holdings. Clicking a holding row in the text list, or a bar in the portfolio chart, now opens that symbol in Market (via `window.FMGotoSymbol`). Bar-chart hit-test uses the deterministic row geometry (`PAD_T + i*ROW_H`), the same pattern as the personal P&L chart, and reads `canvas._gRows` live so it stays correct across re-marks, filtering, and sector grouping.

CLIENT-ONLY: hard-refresh, no server restart needed.

---

## v1.1.5.2 (2026-06-09) - ticker-list separator + Galaxy contracts legibility (CLIENT)

**Companies list (`client/assets/core.js`)**
- Restored the dash separator between ticker and lore name (the em-dash sweep had turned "SYM — Name" into "SYM, Name"). Deliberate scoped exception to the no-em-dash rule: this separator is a data label, not prose.

**Galaxy > Contracts legibility (`client/assets/galaxy.js`)**
- The lane-shares positions/table and shipping-contracts board read dulled. Cause: hardcoded dim grays (#444 route separator, #555 labels/column headers, #666 label dash + expiry, #778 strike/expiry) that the --muted brighten never reached (galaxy.js uses literal hex, not the CSS var). Brightened those values inside the contracts render only; other Galaxy sub-pages untouched.

NOTE: the v1.1.5.1 "net zero player-visible em dashes" claim was incomplete. The sweep matched the literal "—" character only; galaxy.js still has \u2014 unicode-escaped em dashes (contracts description, contract toasts) the sweep never saw. Not addressed here.

---

## v1.1.5.1 (2026-06-09) - news overhaul + live header + dev breaking-news + FLSH/BRNC + phosphor + em-dash cleanup (SERVER)

**Phosphor legibility (`client/style.css`, `client/assets/core.js`)**
- Text read too faded. Root cause was the CRT overlay (`mix-blend-mode:multiply`) dimming the bright green, plus a dim `--muted` token. Brightened `--muted` (#72e09c -> #9af2bf), removed the .9 opacity on `small`/`.muted`, retargeted dim-as-text to muted, and reduced the CRT scanline/vignette darkening (0.22 -> 0.15, 0.35 -> 0.26) so text reads brighter while keeping the scanline look. Fixed the over-dark news-header subtitle. Primary `--green` left unchanged (it was already bright).

**Em-dash cleanup (entire game)**
- Removed em dashes from all player-visible text across server and client (news strings, headlines, chat/system messages, NPC dialogue, item text, UI labels, placeholders). Comments and changelogs keep em dashes per house rule. Net zero player-visible em dashes verified game-wide.


**News content (`server/server.js`)**
- Three new headline categories with their own `genHeadline` branches: faction political/economic moves (`FACTION_NEWS`, ~12%), Mr. Flesh / FLSH house flavor (`FLESH_NEWS`, ~5%), rare cosmic-weird drip (`RARE_WEIRD`, ~3%). All tickerless, no price impact.
- New `COMPANY_GENERIC` good/bad/weird pool merged into the per-company branch so any ticker draws sector lore plus a cross-sector pool (roughly doubles company-headline variety).
- Expanded `MARKET_WIDE` (+15) and `COLONY_FLAVOR` (+8). Routing rebalanced: 3% void / 12% faction / 5% flesh / 13% market / 10% colony / ~57% company. New strings are em-dash-free per the player-text rule; pre-existing strings still use them (not touched).

**Live news header (`client/index.html`, `client/assets/core.js`, `server/server.js`)**
- New `#news-header` bar above the feed. Default shows a LIVE NEWSFEED label; a dev can push custom breaking news (tone-colored banner). Server holds `breakingNews`, broadcasts `breaking_news`, and includes current state in the `init` payload. `renderNewsHeader` handles init + live updates + a default on DOM ready.

**Dev breaking-news control (`client/index.html`, `client/assets/god-panel.js`, `server/server.js`)**
- God panel News tab: text + tone + Set Breaking / Reset to Default. New dev-gated `god_cmd` sub-command `breaking_news` sets or clears the header for all clients.

**FLSH fund -> 100T (`server/db.js`)**
- Fee accrual was glitched/unused; pinned to a flat 100,000,000,000,000 marker via a one-shot guarded by a `fund_state` sentinel (`flsh_100t`). Runs once on deploy, never resets a later manual change. Fresh-DB seed bumped to 100T.

**BRNC -> flat Ƒ0.50 (`server/server.js`)**
- Hard-locked flat at Ƒ0.50 in `stepMarket`, identical treatment to SWT (price + lnP pinned, flat OHLC bars). Excluded from company-news nudges. Reprice from Ƒ65 — existing holders take the haircut.

---

## v1.1.5.0 (2026-06-09) - market upgrades tier + P&L click-to-navigate (SERVER)

Help-desk feature drop. A purchasable market-upgrades tier (modeled on the mining-upgrade system) plus a P&L navigation fix.

**Market upgrades (`server/db.js`, `server/server.js`)**
- New `MARKET_UPGRADE_CATALOG`: `sma` (Ƒ250k), `price_history` (Ƒ500k), `auto_accumulate` (Ƒ5M). Ownership in new `player_market_upgrades` table; `initMarketUpgradeTables` / `getMarketUpgrades` / `hasMarketUpgrade` / `grantMarketUpgrade`. WS: `market_upgrades_list`, `market_upgrade_buy` -> `market_upgrades_state` / `market_upgrade_purchased`.
- SMA overlay (`client/assets/core.js` `drawChart`): SMA-20 line drawn in the chart's own coordinate space, gated on owning `sma`.
- Extended price history: chart handler serves up to 400 bars (vs 199) when the player owns `price_history`. Data was already retained server-side; this lifts the send cap.

**Auto-Accumulate (`server/db.js`, `server/server.js`)**
- Segregated-reserve model: a per-symbol reserve funded out of main cash up front. The engine spends ONLY from reserve_c; main cash is never touched by auto-buys. `player_auto_accum` table; `setAutoAccumConfig`, `adjustAutoAccumReserve` (overdraw-guarded), `getArmedAutoAccum`, `spendAutoAccumReserve` (atomic debit guard). All money in cents, no bitwise ops (values exceed 32-bit).
- Engine (`setInterval`, 15s; 60s per-symbol cooldown): for each armed config on an online player, if last price <= avg cost * (1 - drop_bps/10000), buy a clip sized by min(clip, reserve) accounting for trade tax, atomically debit the reserve, update holdings + basis, take the FLSH cut + treasury tax, broadcast the fill, notify the player. Self-throttling: buying below avg lowers avg, which lowers the next trigger. Online players only (v1); offline is a future extension.
- WS: `auto_accum_get` / `auto_accum_set` / `auto_accum_fund` / `auto_accum_withdraw` -> `auto_accum_state`. Fund deducts cash first then credits reserve; withdraw debits reserve (guarded) first then credits cash, so a failure can never create credits.
- Control surface: `client/assets/market-upgrades.js` panel in the market tab (buy upgrades; configure threshold/clip; fund/withdraw reserve; arm/pause per symbol).

**P&L click-to-navigate (`client/assets/core.js`)**
- Shared `window.FMGotoSymbol(sym)` helper (set symbol input, request chart, switch to Market, scroll). Wired to the positions list rows and the P&L bar chart (canvas click hit-test by row height). News lines now route through the same helper.

**Chat avatar fix for item-backed portraits (`client/assets/core.js`, `client/assets/player-profile.js`)**
- Item-backed chat avatars (clothing/implant portraits, Mr. Flesh's Preserved Brain) resolve from the item catalog, which is lazy-loaded only on the inventory/store tab. Viewers who had not opened those tabs saw a blank avatar; the owner saw their own fine. Chat now lazy-loads the catalog on demand when an item-backed avatar appears and refills any avatars that could not resolve. New shared `FMPortraitNeedsCatalog` helper mirrors the existing header/picker pattern. Note: Mr. Flesh's avatar only shows if his account portrait is actually set (select the Preserved Brain in his profile).

---

## v1.1.4.0 (2026-06-09) - codec quest system + gated portraits + Mr. Flesh (SERVER)

One feature drop, built across several internal checkpoints and shipped together. Codec calls go live, quests persist and complete server-side, portraits can be unlocked by equipping items, and Mr. Flesh joins the contact list.

**Codec calls + quests**
- Codec calls enabled. RE4-style call UI with a BACK control (Backspace) and tuned panel/portrait sizing.
- Quest persistence (`server/db.js`): new `player_quests` table (CREATE TABLE IF NOT EXISTS) with `initQuestTables`, `acceptQuest`, `getPlayerQuests`, `getQuestStatus`, `completeQuest`. `completeQuest` transitions `active -> completed` once only, so a quest can never pay out twice.
- Declarative completion framework (`server/server.js`): `QUEST_DEFS` maps quest id -> objective + reward; `tryCompleteQuest(player, eventType, ev)` completes the first matching active quest and grants the reward in one place. Objective types: smuggle, ship_arrive, war_fund, blockade, short_hold. Reward supports delivered/seized branches, spins, cash, stake refund, item drops.
- Multi-quest-per-rep engine (`client/assets/codec.js`, `codec-data.js`): reps carry `quests:[]` (linear chain; current = first not completed), with legacy single-`quest` fallback and a rep-level `allDoneLine`.
- COLD OPEN is the first wired quest: smuggle Encrypted Data Cores (`data_cores`) New Anchor -> The Hollow; seized = stake refund + 1 spin, delivered = 3 spins. Hooked via `resolveSmuggling`; `resolveShipping` success calls `ship_arrive` (no-op until a deliver quest exists).
  - LIMITS: only COLD OPEN has a def + dialogue. war_fund / blockade / short_hold types exist in the matcher but have no call sites yet (one-line hook each when those quests are written). "Standing" still cosmetic.

**Live-gated portraits** (`server/server.js`, `server/db.js`, `client/assets/player-profile.js`, `core.js`)
- A portrait can require a specific equipped item: equip to unlock it as your avatar, unequip (or equip over it) and the avatar reverts. First entry: the Preserved Brain (`jarred_brain` implant). Server gates `/api/portrait` and clears the stored portrait on unequip (`enforcePortraitGate`); `isItemEquipped` added. Shared `FMPortraitSrc` resolver feeds header, profile, chat, and picker; the picker shows gated portraits under "Equipped Unlocks" only while their item is equipped.

**Mr. Flesh contact** (`client/assets/codec-data.js`)
- Added as a fifth contact under a new `flesh` faction (gold). Portrait reuses item art via an `item:<id>` form resolved from `ITEM_CATALOG_CLIENT` (data-URI sprites); item-backed portraits render `image-rendering:pixelated` so they stay crisp scaled up. The item catalog (lazy `inventory.js`) is loaded on demand by the codec / picker / header when an `item:` portrait needs it. role/blurb are functional stand-ins pending his real voice.

**This deploy's call state:** all four faction reps (McHallan, Rahtan, Jaquet, Xen) Offline; only Mr. Flesh callable ("Get back to work..."). Re-enable faction reps for testing after the push.

SERVER + client change; `pm2 restart` required (new `player_quests` table auto-creates), then hard-refresh.

---

## v1.1.3.6 (2026-06-08) - codec contacts copy + portrait pass

- **Contact descriptions rewritten** (`client/assets/codec-data.js`): all four faction-rep blurbs (McHallan, Rahtan, Jaquet, Father Xen) replaced with in-world briefing text framing each rep's relationship to FLSH station. No em dashes in player-visible copy. Roles and faction ids unchanged; Xen stays Void Collective (resolved a "Null Syndicate" naming collision with Jaquet's Syndicate).
- **Contacts list readability** (`client/assets/codec.js` CSS only): contact portrait avatars 48px to 76px; cards top-align so the larger portrait sits beside the now-longer multi-line text; blurb color `#5f8f74` to `#9fc7b5` and size .66rem to .74rem with looser line-height; panel width 460px to 520px to fit the longer copy.

Files: `client/assets/codec-data.js`, `client/assets/codec.js`, `client/version.json`.

Client change; hard-refresh required after deploy. Codec calls remain disabled (`CALLS_ENABLED = false`).

---

## v1.1.3.5 (2026-06-06) - fix commodity round-trip exploit

- **Commodity exploit closed** (`server/server.js`): a same-colony buy then immediate sell of the same lot printed credits. Both legs priced off the same stored mid, and the buy committed its upward price impact before the sell read it, so a trader front-ran their own market impact; the sell's downward nudge only eased 60% back, so repeat cycling ratcheted the baseline up and compounded. There was no spread and no sell-side friction, so the round trip on any non-guild colony was pure profit (~Ƒ14.8M on a 100k lot of a high-base commodity). Fix: fills now price off the POST-impact price. `nudgeCommoditySupply` was split into a non-writing `previewCommodityPrice` plus a commit step; buys gate funds on the previewed post-impact price then commit the nudge; sells apply impact first then price the fill off the depressed price. A round trip now eats slippage both ways (the same 100k lot that printed ~Ƒ14.8M now costs ~Ƒ8.9M). Legitimate cross-colony arbitrage is unaffected.

Files: `server/server.js`, `client/version.json`.

Server-only logic change; no client cache-bust or hard-refresh needed.

---

## v1.1.3.4 (2026-06-06) - temporarily disable codec calls

- **Calls disabled** (`codec.js`): codec calls are gated behind a new `CALLS_ENABLED = false` flag until the quest system and fixes land. The Contacts list and rep profiles still open, but each call button is redded out (class `.off`), relabeled "Offline", and inactive; clicking it (or a card) only toasts. `FMCodec.call` also early-returns while disabled. Flip the one flag to re-enable.

Files: `client/assets/codec.js`, `client/version.json`.

Cumulative over v1.1.3.3 and earlier (note: 1.1.2.9 through here are one combined push if you have not pushed since the portraits upload).

---

## v1.1.3.3 (2026-06-06) - bigger chat avatar + glowing art credit

- **Larger chat avatar** (`core.js`): chat-line portrait bumped from 30px to 40px.
- **Glowing credit** (`player-profile.js`): the "Art by subotai" link now pulses with a phosphor glow and is larger/bolder so it reads clearly when the picker opens.

Files: `client/assets/core.js`, `client/assets/player-profile.js`, `client/version.json`.

Cumulative over v1.1.3.2, v1.1.3.1, v1.1.3.0, v1.1.2.9 (portraits) and earlier - none of which have been pushed yet.

---

## v1.1.3.2 (2026-06-06) - portrait artist credit

- **Art credit** (`player-profile.js`): the portrait picker now shows an "Art by subotai" link under the title, opening https://subotai-khudozhnik.itch.io/ in a new tab (rel=noopener).

Files: `client/assets/player-profile.js`, `client/version.json`.

Cumulative over v1.1.3.1 and earlier.

---

## v1.1.3.1 (2026-06-06) - header portrait badge + bigger chat avatar

- **Header identity face** (`client/index.html`, `funds.js`, `core.js`, `player-profile.js`): a circular portrait now sits left of your name in the header (`#fm-header-portrait`), styled like a company-account badge. Clicking it opens the portrait picker, so portraits are reachable from both the header and the profile popup. Empty state shows a + prompt. Portrait is now included in the login, session-restore, and WS welcome payloads so the face paints on load; `window.FMHeaderPortrait()` repaints it live on change and on auth.
- **Chat avatar legibility** (`core.js`): chat-line avatar bumped from 20px to 30px with a 2px faction-colored ring.
- **Rename** (`portrait-manifest.js`): the "Nano-Infected" portrait category is now "S'weet Addict".

Files: `server/server.js`, `client/index.html`, `client/assets/core.js`, `client/assets/funds.js`, `client/assets/player-profile.js`, `client/assets/portrait-manifest.js`, `client/version.json`.

Cumulative over v1.1.3.0 and earlier.

---

## v1.1.3.0 (2026-06-06) - faction rep contacts + codec calls

- **Contacts + codec calls** (new `client/assets/codec.js`, new `client/assets/codec-data.js`, `client/index.html`): a "☎ Contacts" button in the chat tab bar opens a list of four faction reps. Calling one launches a codec-style transmission overlay (ring -> accept -> portraits + name + typewriter dialogue -> contract offer with accept/decline), faction-themed via a `--fac` CSS var, using the real portrait set. The player's own selected portrait appears in the outgoing window.
  - Three-layer split from the prototype is preserved: `codec.js` is the dumb engine (knows nothing about quests), `codec-data.js` is GM-authored rep/conversation data, and the quest payload is handed to a single `onQuestAccepted` hook. That hook is a thin stub for now: it records the accepted contract in an in-memory `window.FM_QUESTS` and toasts. No server changes this patch; live quest tracking + persistence is the next decision.
  - Reps: Captain Trisha McHallan (Coalition, corpo2), Rahtan (Merchant Guild, corpo7), Jaquet (Syndicate, hacker1), Father Xen (Void Collective, cyborg11). Rep portraits are assigned from the selectable set and easy to swap. The Contacts button is intentionally not a `.chat-tab` so it does not trigger channel switching.

Files: `client/assets/codec.js` (new), `client/assets/codec-data.js` (new), `client/index.html`, `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.9 and earlier.

---

## v1.1.2.9 (2026-06-06) - player portraits in chat + profile

- **Selectable player portraits** (new `client/assets/portraits/` 60 PNGs, new `portrait-manifest.js`): players choose a portrait and it renders as a small avatar next to their name in every chat room.
  - Server: new `portrait` column on `players` (migration in db.js `_migrations`), exposed on the hydrated player and via `setPlayerPortrait`. New `POST /api/portrait` validates the chosen id against `PORTRAIT_SET`, an allowlist read from the portraits dir at boot (so the client can never inject an arbitrary `<img src>`). Portrait is added to the main + dunce chat payloads and to the `/api/items/profile/:name` response (alongside `faction`).
  - Client: `addChat` renders a 20px avatar from `item.portrait` (sanitized, clickable to open the profile). The profile popup shows the portrait; on your own profile a "change" link / clickable avatar opens a grouped picker modal (`window.openPortraitPicker`) that POSTs the choice and updates live. Manifest is generated from the asset filenames, grouped Corporate/Cyborg/Hacker/Nano-Infected/Street.

Files: `server/db.js`, `server/server.js`, `client/assets/core.js`, `client/assets/player-profile.js`, `client/index.html`, `client/assets/portrait-manifest.js` (new), `client/assets/portraits/` (60 PNGs, new), `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.8 and earlier.

---

## v1.1.2.8 (2026-06-06) - trader's calculator under Ship Cargo

- **Pixel-art calculator** (`calc.js` new, `calc/buttons/*.png` new, `galaxy.js`, `index.html`): added a self-contained calculator widget below the Ship Cargo console in the Galaxy Markets view, for working out spreads and shipping math without leaving the tab. Uses the supplied key sprites with a CSS body and screen matched to the art palette (body #736fa1, screen #4b4173/#2e2747, keys are the sprite PNGs). Supports digits, decimal, + - * /, square root, percent, sign toggle, clear, and delete via an accumulator state machine (no eval). Mouse/touch only so it never steals keystrokes from the adjacent commodity search field. Mounted by `renderMarketsTab` after render; state is module-level so the displayed value survives a view re-render. Arithmetic verified against the same state machine (chained ops, sqrt, percent, divide-by-zero -> ERR).

Files: `client/assets/calc.js` (new), `client/assets/calc/buttons/` (28 PNGs, new), `client/assets/galaxy.js`, `client/index.html`, `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.7 and earlier.

---

## v1.1.2.7 (2026-06-06) - clear announcements + shipping-risk cap order fix

- **Clear pinned announcements** (`core.js`): announcements were stuck until their duration expired with no way to remove one early. The pinned banner now shows an admin-only clear control (✕) that calls the existing `/api/admin/broadcast/clear` and removes the banner for everyone via the `announcement_clear` broadcast. No server change; the endpoint already existed from v1.1.2.2, it just had no UI.
- **Shipping risk cap-before-subtract** (`server.js`): in `/api/cargo/quote` and `/api/cargo/ship` the interception chance was computed as `min(0.50, raw - guardCut)`, so a run whose raw risk exceeded 50% stayed pinned at 50% even after buying an escort, because the escort cut was subtracted from the pre-cap number and the result was still above the cap. Now the risk-increasing terms (base + ship mod + fly-by) are capped at 50% first, then the escort cut (including Private Army's 26%) is subtracted: `max(0.03, min(0.50, raw) - guardCut)`. Example: an 80% raw run with Private Army now shows 24% instead of 50%. Both endpoints use the identical formula so the quote preview matches the resolution roll. Runs already below the cap are unaffected.

Files: `server/server.js`, `client/assets/core.js`, `client/version.json`.

Cumulative over v1.1.2.6 and earlier.

---

## v1.1.2.6 (2026-06-06) - Fleshbook UI reskin (in-universe terminal feed)

- **Removed the top blurb** (`fleshbook.js`): the "the colonies talk, Mr. Flesh listens..." line read as filler and contained an em dash (an AI tell banned from player-visible text). Gone.
- **Platform-matched chrome** (`fleshbook.js`, `index.html`): the panel previously used `#4ecdc4` (the Coalition faction colour) as its accent and Courier, so it looked like a teal app bolted onto the game. Now uses the platform tokens: amber (`#f0b454`) and green chrome, `IBM Plex Mono` inherited from the body, dark green-tinted surfaces. A compact sticky terminal header replaces the paragraph: FLESHBOOK wordmark, a dim PUBLIC FEED label, and a small live indicator.
- **Faction colour reserved for identity** (`fleshbook.js`): each post carries a left accent stripe in the author's faction colour (gold if pinned), and the faction label is uppercased next to the name. GM posts are tagged FLESH CORP in gold.
- **Vocabulary** (`fleshbook.js`): upvote is reframed as a signal boost (▲) since boost is already the platform's language; replies collapse to a ↳ glyph with a count; the post button reads BROADCAST; empty state reads "No broadcasts yet." No em dashes in any player-visible string.
- **Layout fix** (`index.html`): the Fleshbook tab overlapped the tab bar. Cause: every other pane is listed in the `#marketTab,...,#bugsTab{flex:1;min-height:0;overflow-y:auto}` rule in `style.css`, but `#fleshbookTab` was not, so it had no height constraint while still carrying the `margin:-8px` copied from bugsTab, pulling it up into the tabs. Gave the container `flex:1;min-height:0` inline and dropped the negative margin so it sits below the tabs like the other panes.
- No behaviour or API changes; this is presentation only.

Files: `client/assets/fleshbook.js`, `client/index.html`, `client/version.json`.

Cumulative over v1.1.2.5 / v1.1.2.4 / v1.1.2.3 / v1.1.2.2.

---

## v1.1.2.5 (2026-06-06) - Fleshbook features: rate limit, edit/delete own, sort, pin, mentions, composer polish

- **Rate limits** (`server.js`): per-author cooldowns via in-memory maps, 30s for posts and 12s for replies, returned as HTTP 429 with `seconds` remaining. Admin/dev accounts are exempt so seeding is not throttled.
- **Edit + delete own content** (`db.js`, `server.js`, `fleshbook.js`): `/api/fleshbook/delete` changed from admin-only to owner-or-admin; new `/api/fleshbook/edit`. Added `edited` columns to `fb_posts` and `fb_replies` (with ALTER migrations for already-created test DBs), `fbPostOwner` / `fbReplyOwner` / `fbEditPost` / `fbEditReply`. Client shows edit/delete on your own items (and devs on anything), inline edit box, and an "(edited)" marker. Server enforces ownership by `author_id` regardless of the client.
- **New vs Top sort** (`db.js`, `server.js`, `fleshbook.js`): `fbGetFeed` takes a sort arg; Top orders by upvote count. Added `p.id DESC` as a final tiebreaker so newest-first is deterministic even when two posts land in the same millisecond. Client sort toggle re-fetches.
- **Dev pin** (`db.js`, `server.js`, `fleshbook.js`): new `pinned` column + `fbSetPinned` + `/api/fleshbook/pin` (admin). Pinned posts sort first in both New and Top and show a 📌 marker; dev gets a pin/unpin control.
- **@mention notifications** (`server.js`): both posts and replies parse `@name` (deduped, capped at 12 scans, excludes self/GM), resolve via `getPlayerByName`, and notify each mentioned player through the shared `fbNotify` helper (chat cross-post + unread dot), reusing the reply-notification path. Reply recipients are deduped so the OP is not pinged twice when also mentioned. Client highlights `@mentions` in post and reply bodies.
- **Composer polish** (`fleshbook.js`): live character counter (`n / 1000`) and Enter-to-post with Shift+Enter for a newline. Reply inputs already send on Enter.
- **Fix**: the "No posts yet" empty-state line was removed by a selector matching the `style` attribute for text it never contained, so it lingered under the first post. Tagged it `.fb-empty` and remove by class.

Files: `server/db.js`, `server/server.js`, `client/assets/fleshbook.js`, `client/version.json`.

Cumulative over v1.1.2.4 (Fleshbook base), v1.1.2.3 (chat liveliness), v1.1.2.2 (chat robustness). One deploy ships all of them.

---

## v1.1.2.4 (2026-06-06) - Fleshbook: in-house social feed

- **Feed + schema** (`db.js`): new `fb_posts`, `fb_replies`, `fb_votes`, `fb_notifications` tables with indices on `fb_replies(post_id)` and `fb_notifications(recipient_id, seen)`. Functions: `fbAddPost`, `fbGetFeed` (returns upvote count, reply count, and the viewer's own vote state in one query), `fbGetReplies`, `fbAddReply` (returns the post author for notification routing), `fbToggleVote`, `fbDeletePost` / `fbDeleteReply` (soft delete via a `deleted` flag), `fbAddNotification`, `fbUnreadCount`, `fbMarkSeen`. All DB functions runtime-tested end to end against a temp database.
- **Routes** (`server.js`): `GET /api/fleshbook/feed` (open; reads token if present for vote state), `GET /api/fleshbook/post/:id/replies`, `POST /api/fleshbook/post`, `POST /api/fleshbook/reply`, `POST /api/fleshbook/vote`, `GET /api/fleshbook/unread`, `POST /api/fleshbook/seen`, `POST /api/fleshbook/delete` (admin), `POST /api/fleshbook/gm-post` (admin, in-character). Posting and replying are gated on mute/dunce state via `fbPostBlock`, reusing the existing moderation system.
- **Reply notification loop** (`server.js`): when someone replies to your post, the server cross-posts a transient 60s line into your chat ("X replied to your Fleshbook post") and pushes a `fleshbook_unread` count so the tab dot lights even before the module loads. Self-replies and replies to GM posts do not notify.
- **Client module** (`fleshbook.js`, new, lazy-loaded): composer, feed render with faction-coloured author tags and GM gold badge, per-post upvote toggle, expand-to-replies with an inline reply box, relative timestamps refreshed every 60s, and dev-only soft-delete controls. Mirrors the existing lazy-tab pattern (`window.fleshbookTabLoad`).
- **Layout fix** (`index.html`): `#fleshbookTab` was first inserted just outside the center panel close, so it rendered in the chat column with the main area blank. Moved inside the center `panel` as a sibling of the other tab panes (mirrors `#bugsTab`), so it renders in the main content area.
- **Wiring** (`index.html`, `core.js`, `god-panel.js`): new "📣 Fleshbook" main tab with an unread dot; `core.js` shows/hides + lazy-loads it, handles `fleshbook_unread`, and fetches the unread count on `fm:authed` so the dot is correct on login. New God panel control posts to the feed in character (default author "Mr. Flesh", tagged GM). Added `fleshbook.js` to the MANIFEST.

Anti-ghost-town note: the GM posting path exists so the feed is never empty and reads as in-fiction corporate bulletins rather than an abandoned board. Seed it before pointing players at it.

Files: `server/db.js`, `server/server.js`, `client/assets/fleshbook.js` (new), `client/assets/core.js`, `client/assets/god-panel.js`, `client/index.html`, `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.3 (chat liveliness) and v1.1.2.2 (chat robustness).

---

## v1.1.2.3 (2026-06-06) - chat liveliness: display cap, ring match, relative timestamps

- **Client display cap 15 to 200** (`core.js`): `addChat` trimmed each pane to 15 nodes, so even though the server hands a new connection up to a full room of history, the client showed only the most recent 15 and evicted one on every new line. This was the real reason chat felt short. Raised `MAX_CHAT_MSGS` to 200; the client now shows the scrollback the server actually keeps.
- **Server ring 120 to 200** (`server.js`): bumped `CHAT_RING_MAX` to match the client cap so the model is simply "the client shows everything the server retained." Still well under ~2MB total, fixed regardless of population.
- **Relative timestamps** (`core.js`): each chat line now carries a dim inline relative time (`now` / `5m` / `2h` / `1d`) with the absolute time on hover, refreshed in place every 60s via a single `.cm-time` sweep. Undated scrollback could not signal whether a room was active-now or stale; the timestamp is the dead-or-alive signal. Styled small and low-opacity in the line's own colour to sit inside the phosphor aesthetic rather than fight it. Falls back to render-time `Date.now()` for lines that ship without a `t` (e.g. local system notices).
- Decided against a separate system room: mechanical notifications (income, confirms, dividends, fills) keep their 60s TTL and remain in the active room. Lore/social broadcasts (faction, president, splits) stay in global as ambient liveliness.

Files: `server/server.js`, `client/assets/core.js`, `client/version.json`.

Cumulative over v1.1.2.2 (per-room history, transient TTL, pinned announcements).

---

## v1.1.2.2 (2026-06-06) - chat robustness: per-room history, transient TTL, pinned announcements

- **Per-room count-bounded chat history** (`server.js`): replaced the single 30-minute, 200-message global ring (`CHAT_HISTORY` / `CHAT_HISTORY_MS`) with per-room rings keyed by `channel:room`, capped at `CHAT_RING_MAX` (120) each with no time expiry. Quiet rooms now keep scrollback instead of pruning to empty and reading as a dead server. Memory is fixed at rooms x 120 regardless of population (rejected the per-user-cap idea: per-user is unbounded in population and would cost more memory, not less). Messages flagged `data.transient` are never stored.
- **Transient notification TTL** (`core.js`): `addChat` now honours an optional `ttlMs` and self-removes the line after it elapses. Applied 60s TTL to passive income, `chat_system` confirms, dividend, and limit-fill lines. Faction / president / stock-split broadcasts (`type:'chat'`, `user:'SYSTEM'`) carry no TTL and remain as scrollback. Most of these notifications were already per-socket (never in history), so this is the client-side half of the same cut.
- **Persisted pinned announcements** (`db.js`, `server.js`, `core.js`, `god-panel.js`, `index.html`): new `announcements` table (text, author, created_at, expires_at) with `addAnnouncement` / `getActiveAnnouncements` / `clearAnnouncement` / `pruneExpiredAnnouncements`. The dev-panel God Broadcast now pins a DB-backed announcement above every chat room for a duration set in the panel (new "Pin duration (min)" input, default 30, range 1 min .. 7 days). Active announcements are re-sent on every WS connect, so they survive PM2 restarts and alt-logins. A 30s server loop expires them and broadcasts `announcement_clear`; the client also self-expires each banner at its `expires_at`. New REST routes `/api/admin/broadcast` (now persists + takes `durationMin`) and `/api/admin/broadcast/clear`.
- **Bug fixed**: admin announcements vanished when logging in on a second account. Root cause: the old `admin_broadcast` was broadcast live but never written to chat history and rendered as a scrolling line, so a fresh connection never received it. Announcements are now persistent server state, not an in-flight message.

Files: `server/server.js`, `server/db.js`, `client/assets/core.js`, `client/assets/god-panel.js`, `client/index.html`, `client/version.json`.

Note: Fleshbook (in-house social feed) is designed but not in this build. Backend + tab are gated on scope confirmation (single global feed, one-level replies, upvote, reply-notification dot, dev-pin).

---

## v1.1.2.1 (2026-06-06) - blockade funding status bar + durability

- **Two-phase blockade status bar** (`galaxy.js`): the blockade panel now shows a live bar for the selected lane. Building phase fills toward the Ƒ1,000,000 activation threshold; active phase shows remaining integrity as counter-funding drains the pool toward 0. Refreshes on lane select, on every `blockade_update`, and on panel open.
- **Building-phase pools no longer discarded client-side** (`galaxy.js`): `blockade_update` with `active:false` used to delete the lane entry, throwing away partial funding so it was invisible until activation. Now the entry is retained whenever `pool > 0`, and only dropped on break/expiry. `threshold` added to the active + counter broadcasts so the bar has its denominator.
- **Stale text fixed** (`galaxy.js`): the blockade panel helper line read "Ƒ50k activates a 2-hour blockade" (encoded `\u01925\u0030k`, missed by the earlier 50k sweep); now reads Ƒ1,000,000.
- **False-blockade on the map fixed** (`galaxy.js`): the map painted the red ⛔ for any lane present in the blockade map, including lanes merely accumulating funding. The indicator (and the share-count offset, and the lane dropdown label) now require `active === true`; building lanes show `[FUNDING]` in the dropdown instead. Also hardened the server restore (`server.js`): an active blockade restored without a valid future expiry is cleared rather than resurrected as a permanent lockdown, so a stuck entry can't keep showing a lane as blockaded.
- **Over-funded bar** (`galaxy.js`): the bar fill clamps to 100% for layout, but the label shows the true percentage (e.g. 140%) and notes how much counter-funding a over-funded active blockade actually needs to break.
- **Immediate blockade persistence** (`server.js`): blockade fund / counter / Private Army handlers now call `saveGalaxySystems()` right after mutating, instead of relying solely on the 60s autosave. Pools already survived restarts via `restoreGalaxySystems()` (market_state table) on boot + graceful shutdown; this closes the up-to-60s window where a hard crash could drop recent contributions. No new table.
- **Legible blockade panel** (`style.css`, `galaxy.js`): the panel inherited the global phosphor glow, blurring the status bar and helper text. Added `#gBlkPanel` (and its children) to the glow-exclusion list and bumped the status/helper font sizes and contrast so the funding bar reads clearly.

Files: `server/server.js`, `client/assets/galaxy.js`, `client/style.css`, `client/version.json`.

---

## v1.1.2.0 (2026-06-06) - shipping risk rebalance, escort/insurance, blockade + war-funding repricing

- **Per-hop shipping risk up 4x** (`server.js`): cargo arbitrage fly-by risk raised from `(hops-1)*0.025` to `(hops-1)*0.10` in both `/api/cargo/quote` and `/api/cargo/ship`. Each intermediate colony now adds 10% interception risk instead of 2.5%, pushing multi-hop runs toward the 10-25% band. NOTE: direct (1-hop) runs are unaffected and still sit at base (~10% corporate, ~15% grey); raise `SHIPPING_BASE_RISK` if those also need to move.
- **Escort fees +1/3** (`server.js`, `galaxy.js`): `GUARD_TIERS` feeFrac light 0.04 to 0.0533, medium 0.10 to 0.1333, heavy 0.22 to 0.2933. Shared with smuggling, so smuggling escort costs the same 1/3 more. Cargo dropdown labels and the smuggling fallback array updated to match.
- **Insurance in the cargo console** (`galaxy.js`, `server.js`): added an Insurance checkbox beside Escort. Wires `insure` into `/api/cargo/quote` (now returns `insurancePremium` + `upfrontTotal`) and `insured` into `/api/cargo/ship`. On interception, insurance now refunds **half** the cargo cost (not the full stake), so an insured loss still hurts; premium and escort fee are gone regardless. It does not lower the interception roll. Stacking with an escort pays both off the top.
- **Blockades repriced 50k to 1M** (`server.js`, `galaxy.js`): `BLOCKADE_THRESHOLD` 50000 to 1_000_000. Governs raise, counter-break, and the Private Army instant-break (all tied to the constant). All five client text strings + stale comments updated.
- **War funding pooled, 10M per 1%** (`server.js`, `db.js`, `galaxy.js`): `/api/galaxy/fund` no longer converts per-donation. All contributions to a (colony, faction) bank into a shared pool (`war_fund_pool` table, persisted); every full Ƒ10,000,000 in the pool converts to +1% control, remainder carries forward so partial contributions are never wasted. No per-donation cap (pool size + the 96% ceiling are the only limits); SC blocked by the ceiling stays banked. Min donation restored to Ƒ1,000. Endpoint returns `pctGained`/`pctToNext`; both fund toasts show control gained or SC banked toward the next 1%.
- **Removed outdated savings text** (`funds.js`): dropped the `0.040%/hr` line from Capital House directory cards (fund savings interest has been disabled since v1.0.2.4).

Files: `server/server.js`, `server/db.js`, `client/assets/galaxy.js`, `client/assets/funds.js`, `client/version.json`.

---

## v1.1.1.6 (2026-06-04) — de-fog company + fund detail panels

- **Crisp detail panels** (`style.css`): extended the glow-exclusion rule to `#companyDetail` (market company detail), `#guild-detail` (Capital House fund view), and `#transferSection` (Wire Credits panel). They were inheriting the global `body` phosphor glow, blurring the "No base dividend" / "Dividend eligible" line, the fund type badge ("Capital House" / "Guild" / "FLSH"), the Overview/Portfolio/Governance/Manage sub-tabs, and the wire transfer-tax disclaimer. One-line CSS change; no logic touched. Follows the same v1.1.1.5 store fix.

Files: `client/style.css`, `client/version.json`.

---

## v1.1.1.5 (2026-06-04) — store/title text de-fogged

- **Crisp store text** (`style.css`): the global `body` phosphor glow (`text-shadow:0 0 3px rgba(70,255,125,.30)`) was being inherited by the store panes, making title names and blurbs read blurry. Added `.store-pane` to the existing glow-exclusion rule alongside markets/tickers/news/board, so all four store subtabs (Titles, Inventory, Ƒbay, Slots) render crisp. One-line CSS change; no logic touched.

Files: `client/style.css`, `client/version.json`.

---

## v1.1.1.4 (2026-06-03) — dev text -> gold; neutral news -> amber

- **Dev text gold** (`galaxy.js`): the Flesh Station (dev) faction was still light green (`#9dff5a`) despite its gold dim/bg — fixed its faction color, the DEV ONLY badge, the galaxy-map FLESH STATION label, and the HOME OF MR. FLESH banner to gold (`#ffce4d`), matching the Capital Houses dev fund.
- **Neutral news amber** (`style.css`): neutral headlines reverted from pale to amber (good=green / bad=red still override via the tone classes).

Files: `client/assets/galaxy.js`, `client/style.css`, `client/version.json`.

---

## v1.1.1.3 (2026-06-03) — news feed redesign + ASCII title sizing

- **News feed (layout A)** (`core.js`, `style.css`): each story is now a row with a tone-colored left accent bar and faint wash (green up / red down / amber neutral), a meta header line (time + a color-coded category chip), and the headline on its own line in pale (green/red tint for good/bad). Replaces the old single inline wrapping line. Category chips recolored to a coherent set: market=green, colony=amber, sector=purple, system=blue, trade=teal.
- **ASCII titles** (`index.html`): FLESH MARKET wordmark to 9px with a bit more glow; NEWS ASCII title to 7.5px.

Files: `client/assets/core.js`, `client/style.css`, `client/index.html`, `client/version.json`.

---

## v1.1.1.2 (2026-06-03) — amber section titles

Established "title text = amber" across the UI (cosmetic).

- All `h2` panel titles recolored green -> amber (Companies, Leaderboard + Net Worth, Wire Credits, Limit Orders, Price Alerts, Drone Mining, etc.) via the global `h2` rule.
- FLESH MARKET wordmark recolored to amber; NEWS title converted to ASCII-art (figlet) in amber to match.
- Chat room badge (`global · room N`) and the A-/A+ chat font-size buttons recolored to amber.

Files: `client/style.css`, `client/index.html`, `client/version.json`.

---

## v1.1.1.1 (2026-06-03) — amber navigation chrome

Tabs and watchlist to amber (cosmetic). Amber now also carries primary navigation, not just places/neutral/symbols/chat.

- Main tabs, Galaxy subtabs, and chat room tabs: border, text, active highlight, and glow recolored green -> amber.
- Watchlist toggle: border/text/count and the active (filter-on) state recolored to amber.

Files: `client/style.css`, `client/assets/market-tools.js`, `client/index.html`, `client/version.json`.

---

## v1.1.1.0 (2026-06-03) — green CRT phosphor reskin (Ellen's Theme)

Full visual reskin to a permanent green-phosphor CRT look, plus one gameplay fix. Cosmetic unless noted.

- **Theme:** permanent green-phosphor CRT (amber retired, theme selector removed), always-on scanlines, re-saturated palette with a pale to dim green readability hierarchy.
- **Fonts:** self-hosted (no Google Fonts) — Share Tech Mono on chrome (wordmark/headings/tabs/EOD timer), IBM Plex Mono on body/data. Header wordmark is ASCII-art (figlet 'small').
- **Signal palette:** green = data/structure; amber (#f0b454) = places, neutral news, ticker symbols, chat text; gold (#ffce4d) = Patreon/premium + FLSH dev guild + golden share; red = loss/danger. Faction/rainbow/tension colors kept as identity.
- **Polish:** softened glow + de-glowed dense tables, muddy greys lifted to green tiers, pale company-list text, heatmap warm tiles fixed and sector headers colored from the P&L wheel palette, faint amber button outlines removed.
- **Fix (functional):** cargo shipping now allows only one in-transit shipment per player at a time, enforced server-side.

---

## v1.1.0.0 (2026-06-01) — major content drop: free starter ship, shipping overhaul + escorts, P&L sector tools, brighter donuts

A single large release consolidating the post-governance sprint. Four things land together.

**Free starter Skiff.** New accounts (and any existing account that never commissioned a ship) were locked out of the entire commodity loop — `/api/commodities/buy`, `/api/commodities/sell`, and `/api/cargo/ship` all hard-gate on `shipClassFor()`, which returned `null` until you spent Ƒ150k on a Courier. Added a free `skiff` class scaled off the Courier row (capacity 2,500u = 25% of Courier, `riskMod` +0.03, `price` 0) and made `shipClassFor()` fall back to it instead of returning null. `/api/ships` floors `owned` to `skiff`; `/api/ships/buy` rejects `classId==='skiff'` (`starter_ship`) since it's the floor, not an upgrade. No DB migration — the fallback is virtual, so the Skiff is never persisted and the first real purchase still sets `ship_class` normally. The Shipyard renders any `price<=0` class as a non-buyable "Starter ship," so it shows as ACTIVE for new players with no UI change.

**Commodity interception rebalanced.** The "40–55% no matter the lane" was the lane base being swamped by stacked modifiers, not the lane itself. Fixes in `cargoShipmentInterceptChance()` and the two cargo endpoints, tuned via Monte Carlo over the weighted run space so the riskiest unescorted hauls land in a 45–50% band with a hard 50% backstop:
- Cargo-value scaling no longer reuses the steep abstract `shippingBetRisk` curve (0/0.05/0.10/0.15). New `CARGO_VALUE_RISK_TIERS`: 0 / +3% / +5% / +7% at Ƒ25k / 100k / 500k / ∞.
- Fly-by risk cut from 5% to 2.5% per extra hop.
- Lane factor trimmed from `laneRisk.intercept * 0.4` to `* 0.35` (lane ordering corporate→dark preserved).
- Tension divisor raised 1500→1800 (max tension ~5% instead of ~6.7%).
- Blockade surcharge cut from +10% to +6%.
- Inner clamp 0.60→0.52; final clamp 0.70→**0.50** hard ceiling, floor 2%→3% so a fully-escorted corporate run keeps a sliver of risk.
- Simulated outcome (200k runs): all-runs median ~18%, p99 39%; risky subset (dark/contested, ≥100k, no escort) p99 46%, max 50%; lane means corp 14% / grey 18% / contested 22% / dark 27%.

**Shipping escorts.** Added guard escorts to the commodity shipping console, reusing the smuggling `GUARD_TIERS` verbatim (None / Light -8% / Armed Convoy -16% / Private Army -26%). Fee is `feeFrac` × cargo value, paid up front and lost if intercepted (the escort dies with the cargo). The cut is baked into the stored `interceptChance`, so the resolution roll reflects it — no schema change. Plumbed through `/api/cargo/quote` (`?guard=`) and `/api/cargo/ship` (`guardTier` in body); quote returns `guardFee`/`guardCut`. Console gains an Escort selector; preview shows the cut and fee. Worked example, dark 3-hop 800k haul: unescorted 48%, Light 40% (Ƒ32k), Armed Convoy 32% (Ƒ80k), Private Army 22% (Ƒ176k).

**P&L sector tools.** Personal P&L (`core.js`) and the Capital House portfolio (`funds.js`) gained a themed sector control beside the search box: `All positions` / `Grouped by sector` plus every sector listed by name (Finance, Biotech, Insurance, Manufacturing, Energy, Logistics, Tech, Misc). Picking a sector filters the row list **and** the %-move bars to that sector; "Grouped" clusters by sector with a faint per-row tag. New `.sector-select` style (panel-matched fill, gold border, custom caret). `_pnlArrange` / `_gArrange` apply search + sector filter/group in one pass shared by bars and list; sector-aware empty states. Sector indices/names come from `window.TICKERS` `.sector` + `V5_SECTOR_NAMES`.

**Allocation donut flood bug fixed (the real cause of the "dim/washed" wheel).** Both donuts (`_drawDonut`, `renderFundDonut`) computed each slice as `sweep = frac*2π - GAP` and drew the outer arc from `ang + GAP/2` to `ang + sweep`. For any slice under ~0.6% of the total (typically the cash sliver on a large fund) `sweep` falls below `GAP/2`, so the arc's end angle drops below its start angle and the default-clockwise arc wraps nearly 360°, flooding the entire ring with that one slice's color. That is why the wheel read as a uniform pale tan with only the true colors glinting at the edges — it was never a palette or dark-mode issue. Reproduced and confirmed headlessly with node-canvas. Fix: the slice guard is now `if (sweep <= GAP/2) return;` (was `<= 0`), so sub-threshold wedges are skipped instead of wrapping. The donuts now render their full vivid palette.

Alongside the fix, both wheels share one vivid palette (`FM_DONUT_PAL`, defined in `core.js`, read by `funds.js`) with a per-segment glow (`shadowBlur 6`), bolder ring (outer radius +2px, inner ratio 0.6), and warmer center text — luminosity from the glow, not from lightening the colors.

Scope: all exploitable paths stay server-authoritative. Guard cut and value scaling are computed server-side; the client only mirrors them for preview. Donut and sector changes are client-side reorders/redraws of already-computed data.

---

## v1.0.3.9 (2026-05-31) — guild Portfolio: live-priced holdings + %-move bars


The Capital House Portfolio pane only rendered holdings on `openFund`/`fund_update` (fund trades, deposits), so between those events the prices were stale and you couldn't watch companies move. `fund_holdings` stores only `(symbol, qty)` — no cost basis — so there's no gain-vs-entry to show; the available, and more relevant, metric is today's % move.

Changes (funds.js, index.html, core.js):
- `_gBuildHoldings(f)` re-marks each holding at the live price from `window.TICKERS` and pulls today's `pct`; value recomputed at live price.
- `_renderGuildHoldings` rows now show live price + color-coded today's % alongside qty/value.
- New `_drawGuildBars` / `_drawGuildBarsAxis` render a per-holding %-move bar chart into `#g-pnl-bars` with a pinned `#g-pnl-bars-axis`, fixed 24px rows growing inside a 180px scroll wrapper — same shape as the personal P&L bars.
- `window.refreshGuildHoldingsLive()` re-renders on every market tick (hooked in core.js after `refreshHeatmap`), gated on `#g-pane-portfolio` being visible (`offsetParent`), so it's idle unless you're looking at it.
- `setHousePane('portfolio')` triggers a redraw so the canvas sizes correctly after being hidden (zero clientWidth).
- The 1.0.3.8 holdings filter and scroll still apply; search narrows rows and bars.
- Scope: fund NAV/cash/per-share remain server-authoritative; only the holdings rows and bars are re-priced client-side.

## v1.0.3.8 (2026-05-31) — P&L: scrollable + searchable position list (personal + guild)

With a large book the P&L bar chart packed every position into a fixed 180px canvas. `rowH = min(28, floor((H-22)/n))` collapsed to ~6px at ~25 holdings, so bars overlapped and the left-edge symbol labels overprinted into an unreadable smear (the donut/net-worth side was fine). The `#pnlBox` list below had no height cap or filter, and the guild Capital House portfolio (`#g-d-holdings`) had no filter either.

Changes:
- Personal P&L: added `#pnlSearch` ticker filter; `#pnlBox` capped at 360px with `overflow-y:auto`. `_drawBars` rewritten to use a fixed 24px row height and grow the canvas vertically inside a 180px-max scroll wrapper (`#pnl-bars-wrap`) instead of compressing rows. The `+/-%` scale is drawn into a separate pinned canvas (`#pnl-bars-axis`) above the scroll wrapper so it stays fixed while the bars scroll (shared geometry keeps the zero line aligned). Search filters the visible list and bars via `_pnlMatch` / `window.pnlApplySearch`.
- Guild portfolio: added `#g-holdings-search`; holdings render refactored into `_renderGuildHoldings(f)` driven by `window.guildHoldingsSearch`, filtering `__currentFundData.holdings`.
- KPIs, net worth, equity, unrealized P&L, and the allocation donut still compute on the full portfolio; the filter only narrows the readable list/bars.

## v1.0.3.7 (2026-05-31) — fix: golden-share badge shown on wrong member

The golden-share ★ in the member list was rendered by matching the holder's name against each member's name (f.goldenHolder===m.name). Name collisions (or a treasurer/other officer whose name matched) could show the badge on the wrong person. The members array didn't expose player_id to the client, so a name match was the only thing available. Fixed by computing an isGolden boolean per member server-side off player_id and badging on that. Purely cosmetic — both veto endpoints already gate on getGoldenHolder()===actor.id, so the share's actual authority was never mis-assigned; only the badge was wrong.

## v1.0.3.6 (2026-05-31) — fix: smuggling countdown froze (real fix)

v1.0.3.5 anchored the smuggling countdown to resolveTs but updated the wrong element: the RUN IN PROGRESS panel renders its timer into #gShipCountdownTimer (a shipping-named id it reuses), while the interval was writing to #gSmugStatus. So the visible number never moved. Replaced both with one shared ticker (_smugTick / _ensureSmugTicker / _stopSmugTicker) that recomputes from resolveTs each second and writes to whichever countdown element is present, re-armed at the end of renderShippingTab so tab switches and re-renders keep it live. Known minor gap: a full page refresh mid-run doesn't restore the run panel (no smuggling_status client handler yet) — separate follow-up.

## v1.0.3.5 (2026-05-31) — fix: smuggling countdown drift

The smuggling run timer counted down a local `secLeft--` once per `setInterval` tick instead of recomputing from the run's resolve timestamp. Background-tab throttling and interval drift made the displayed time desync from the real arrival, and the interval wasn't cleared on resolve or before a new run (so they could stack). Rewrote it to mirror the shipping countdown: recompute remaining time from `resolveTs` every tick, store the interval on window, and clear it on resolve and before starting a new one.

## v1.0.3.4 (2026-05-31) — governance: officer roles

Second half of the God-Complex set. The owner can delegate specific powers to members — concentrated authority that an officer can use (or abuse) until it's revoked.

- **Treasurer** — can move fund cash: withdraw from the fund and assign cash to members, same as the owner.
- **Trader** — can execute trades directly, bypassing the fund's governance mode entirely (even vote mode, where everyone else must propose). Trade-without-a-vote is the role's whole point.
- **Whip** — can force-call any open proposal: voting closes immediately and the current tally decides it. Owner can do this too.
- Owner appoints/revokes from the Manage panel (name + role). One role per member; the owner implicitly holds every power. Role badges (and the golden-share ★) now show in the member list.
- New endpoints: officer/appoint, officer/revoke, proposal/:pid/force. New fund_officers table (created on boot). Gates updated on the trade, withdraw, and assign endpoints to admit the relevant officer.
- NOTE: still no coup. Officers add more delegable owner power to an owner who cannot yet be removed. The seize / no-confidence proposal is the outstanding counterweight.

## v1.0.3.3 (2026-05-31) — governance: tenure voting + golden share

First half of the God-Complex governance set. Concentration levers — the counterweight (coup / no-confidence) is a separate follow-up.

- **Tenure-weighted voting**: new vote-weight option alongside equal and share-weighted. Weight = 1 on join, +1 per full day in the fund. Entrenched elders out-vote rich newcomers — a different tyranny than buying control with shares.
- **Golden Share**: a single transferable veto token per fund. The owner holds it at creation. The holder can veto ANY open proposal — it dies regardless of the vote tally — and can hand the token to any member (permanent, instant). It's the purest God-Complex artifact and, because it's transferable, the prime target of a future coup.
- New endpoints: POST /api/funds/:id/golden/veto and /golden/transfer. New funds.golden_holder column (lazy migration on boot, backfilled to owner). Governance panel shows the holder, veto buttons appear on open proposals for the holder, and a hand-over control for transfers.

## v1.0.3.2 (2026-05-31) — fund deposit/withdraw is cash, not shares

Deposit and withdraw now work in raw cash amounts. The percentage dropdown is gone — one Amount field, Deposit moves that cash player to fund, Withdraw pulls that cash fund to player.

- Withdraw is capped only by the fund's liquid cash. Positions stay locked. If the fund holds Ƒ300k cash against a Ƒ2M NAV, only the Ƒ300k is withdrawable; the rest is tied up in trades until governance votes to sell. Intended harshness.
- No per-member ceiling. Governance is the gate (owner-controlled / executive). A withdrawal that exceeds available cash caps to what's there rather than erroring blind.
- Shares are now display-only. The "My Value" card became "Contributed" (lifetime gross deposited, never decreases). Per Share / NAV / drawdown stay as house performance, not a personal claim.
- Shares are still burned to match cash pulled so the per-share line stays honest; pulling beyond your own stake (allowed) zeroes your shares and visibly drags spp for everyone.
- A withdrawable/locked hint shows under the panel so the liquidity cap is transparent.

## v1.0.3.1 (2026-05-31) — item scrapping

Slot-machine items can now be scrapped from the bag for a flat Ƒ500, same payout for every rarity. It's a clutter sink, not a fair-value buyback — the point is to give players a one-click way to dump junk instead of listing it on Ƒbay forever.

- ⊘ Ƒ500 control on each bag item; click stops propagation so it doesn't trigger equip. Confirm dialog since the item is destroyed permanently.
- Equipped items and items currently listed on Ƒbay can't be scrapped (the listed guard prevents orphaning an active listing).
- New `POST /api/items/scrap`. Payout + delete run inside a single DB transaction; portfolio is pushed over WS on success so cash updates live.

## v1.0.3.0e (2026-05-30) — route risk preview

You can now gauge a shipment's risk BEFORE committing. The Shipping Console shows a live preview as you change the commodity, origin, destination, or quantity:
- **Route** (full hop path) and **hop count**, **transit time**, and **interception risk**, color-coded (green <25%, amber 25-45%, red 45%+), including the fly-by surcharge for multi-hop routes.
- Flags when you don't own a ship yet, and when no route exists.
- Per-row SHIP buttons also trigger the preview after pre-filling.
- New `GET /api/cargo/quote` endpoint runs the same routing + risk math as the ship endpoint without executing it.

## v1.0.3.0d (2026-05-30) — routing fix: cluster gateways

Multi-hop routing wrongly refused to pass through non-market colonies, which made the entire Abaddon cluster (Limbosis / Lustandia / Gluttonis) unreachable — their only link to the galaxy is the gluttonis/lustandia/limbosis <-> abaddon lanes, and Abaddon is a non-market anchor. Shipping to any cluster colony returned "no route". Fixed: a ship can fly THROUGH any colony as a transit waypoint (it just can't buy/sell at a non-market one). Endpoints are still validated as market colonies. Example now works: Nova Reach -> Gluttonis routes in 4 hops through Abaddon.

## v1.0.3.0c (2026-05-30) — multi-hop auto-routing

Shipping to a colony with no direct lane now **auto-routes** the shortest path through intermediate colonies (BFS over the lane graph) instead of returning "no lane." It stays one shipment with one delivery at the final destination — a simple auto-queue, not manual leg-chaining.

- **Transit time scales per hop:** a 3-hop route takes ~30 min (3 × the 10-min leg), not three separate runs. Phase tracker stretches across the whole journey.
- **Fly-by risk:** each extra hop adds +5% interception chance (skipping past colonies without docking). A 3-hop run carries +10%.
- **Route risk** is based on the riskiest lane type anywhere on the path, so routing through a dark lane is appropriately dangerous.
- Routes only pass THROUGH market colonies as waypoints; non-market anchors can still be endpoints but aren't used as transit stops.
- The launch confirmation shows the hop count, the full route, the time, and the risk.

## v1.0.3.0b (2026-05-30) — Shipping Console UX

- Commodity picker in the Shipping Console is now a **searchable type-to-filter** field (datalist) instead of a 120-item scroll `<select>` — type a few letters to narrow it.
- The commodity list and both colony dropdowns (From / To) are now sorted **alphabetically**.

## v1.0.3.0a (2026-05-30) — shipping risk rebalance

Commodity shipment interception was too punishing for legitimate trade. The base shipping risk was a flat 18% on every run before any modifiers, stacking to ~41% on an ordinary grey-lane haul. Lowered:
- `SHIPPING_BASE_RISK` 0.18 -> 0.05.
- Faction-away penalty (shipping through colonies your faction doesn't control) halved from +0.04 to +0.02 per endpoint.

Result: corporate lane ~14% (was 27%), grey lane ~24% (was 41%), while contested/dark lanes with big cargo stay 44-51%. The risk gradient is preserved; legitimate shipping is now viable. Smuggling uses a separate risk path and is unchanged (contraband stays dangerous).

## v1.0.3.0 (2026-05-30) — The Commodity Economy Update

The largest single update to FleshMarket: a full inter-colony trade economy layered on
top of the stock market. Everything below ships as one release.

### Commodity market
- **120 commodities** across Tech, Med, and Agri, each with pixel art, priced
  independently at every one of the 19 market colonies. Per-colony, per-commodity
  affinity means each colony is cheap in some goods and dear in others — 2,280 live
  prices, real arbitrage, routes that span the galaxy.
- **Arbitrage Board** in the Markets tab surfaces the best buy-low/sell-high spread per
  good, with class filters (Tech/Med/Agri) and name search.
- **Live ticker prices.** Prices update in place like a stock ticker — no page jump —
  flashing green/red as player trades, NPC trades, and ambient drift move them.

### Shipping & logistics
- **Ship-based shipping.** Commodity trade requires a ship (Courier / Freighter /
  Hauler, bought in the Shipyard). Cargo is **located** — it physically sits at the
  colony where you bought it. To profit from a spread you must run a real, timed,
  phased shipment (loading → undocking → transit → dropoff → return) to another colony
  and sell it there. You can only sell where your cargo actually is — no instant
  cross-colony arbitrage.
- **Shipping Console** in the Markets tab: pick commodity, origin, destination, and
  quantity from dropdowns and launch a run without touching the sector map. A per-row
  SHIP button pre-fills it from the board.
- **Domino-style in-transit tracker** shows each shipment advancing through its phases.
- Shipments can be **intercepted** en route (cargo lost, ship survives); whole-route
  insurance optional.

### Server NPC trade fleet
- Up to **17 server-authoritative NPC haulers** travel real lanes carrying 1–3 real
  commodities each, buying at origin and selling at destination — they genuinely move
  prices, and every player sees the same fleet. Click any ship for its manifest.

### Shipping Contracts (options)
- A financial layer on the commodity market: **cash-settled options on lane spreads.**
  Pay a premium for the right to capture a spread by expiry (1h/4h/8h); profit if it
  widens past your strike, lose only the premium if not. No ship needed — an
  entry-level commodity play. Priced with a verified ~12% house edge; blockades raise
  premiums; lane shareholders earn a kickback on contract profits.

### Smuggling & Guards
- The legacy freight bet is retired; the tab is now a dedicated **💀 Smuggling**
  operation. Stake on contraband runs for up to ×3 payouts. A new **Guard escort**
  system replaces insurance: pay for muscle to cut interception odds, but the fee is
  lost if you're caught — a spend-to-lower-odds bet, not a safety net.

### Supporting work
- Commodity trading consolidated entirely into the Markets tab (removed from the planet
  details panel, closing an instant buy/sell exploit).
- Tutorial rewritten with Commodity Market, Shipping Contracts, and Smuggling & Guards
  slides. Galaxy tab renamed to 💀 Smuggling.
- **Database:** additive only — one new column on players (`ship_class`) and four new
  tables (commodity_prices, player_cargo, cargo_shipments, shipping_contracts);
  player_cargo is keyed per-colony. No existing profile data is modified. Back up the DB
  before the first restart.

## v1.0.2.9a (2026-05-30) — gating + tab order

Players no longer start with a free Courier — you must commission a ship (Courier now ƒ150,000) before you can buy, sell, or ship commodities. All three commodity actions are gated server-side on ship ownership (`no_ship`), with client prompts pointing to the Shipyard. Reordered the Galaxy tabs: Sector Map → Markets → Shipping → Contracts → Factions.

## v1.0.2.9 (2026-05-30)

**Shipping V2 — stages A+B: logistics phases + buyable ships.**

Cargo shipping is no longer an instant action with a hidden end-roll. A run now takes **10 minutes flat**, split across five visible phases — Loading → Undocking → Transit → Drop-off → Returning — with risk weighted toward Transit (it carries ~65% of the interception chance; loading/undocking/dropoff/return are low). The interception roll is distributed: each phase rolls its share as the shipment enters it. On interception, **cargo is lost but the ship survives** and finishes the return phase empty. Insurance is bought at launch, whole-route, value-scaled (unchanged model). A per-run **fuel/return cost** is charged up front, scaling with ship size and cargo value, so long hauls on big ships cost real credits.

A Domino's-style **phase tracker** shows each in-transit shipment's current phase (pips), live ETA, and risk on the Markets tab. Phase changes and outcomes push over WebSocket (`cargo_phase`, `cargo_ship_result`).

**Buyable ships.** Three classes set your cargo capacity per run: **Courier** (free starter, 10,000u), **Freighter** (ƒ1,500,000, 35,000u, +2% risk), **Hauler** (ƒ5,000,000, 70,000u, +4% risk). Bought from the new Shipyard on the Markets tab. Capacity caps how much you can ship in one run. Everyone starts with a Courier. Ship class persists per player (new `ship_class` column).

Shipments persist in `cargo_shipments` (new phase/ship columns) and resume correctly across a restart — the phase stepper advances them by elapsed time on a 3s tick instead of per-shipment timers. Verified: boot clean, phase math (fracs + risk shares both sum to 1.0, transit is the long dangerous stretch), ship purchase/capacity, restart resume.

## v1.0.2.8b (2026-05-30) — UI

Markets tab arbitrage board is now actionable: each row has BUY (purchases at the cheapest colony shown) and SELL (offloads at the dearest, when held) buttons, with an inline result line — no need to leave for the Sector Map to trade. Reduced the per-colony commodity panel font back down (the 1.0.2.8a bump was too large and wrapped the buttons).

## v1.0.2.8a (2026-05-30) — UI tweak

Markets tab moved to sit directly after Sector Map (was after Shipping) for quick back-and-forth between the arbitrage board and the map. Bumped font sizes up across the Markets tab and the per-colony commodity panel — the prior sizing was too small to read comfortably.

## v1.0.2.8 (2026-05-30)

**Commodity market — dedicated Markets tab.**

Trading was only reachable by opening each colony's detail panel, which made the galaxy-wide arbitrage invisible. Added a Markets tab to the Galaxy view (sibling to Sector Map / Factions / Shipping / Contracts). It shows your cargo hold, in-transit shipments, and an Arbitrage Board: for every commodity, the cheapest buy colony vs the dearest sell colony and the spread % right now — so profitable routes are visible at a glance. Buy/sell/ship still happen on a colony (open it from the Sector Map); the per-colony market panel from stage 2 remains.

New endpoint `GET /api/commodities-grid` returns the full colony×commodity price grid in one call. Verified live: grid returns 12 commodities × 20 colonies with control-driven prices.

## v1.0.2.7a (2026-05-30) — hotfix

Fix a fatal crash introduced in 1.0.2.7: while inserting the arbitrage-shipping block, the `const SHARE_MAX_SLOTS = 100;` definition for the Lane Shares system was accidentally dropped. The first WebSocket message that hit the lane-share path threw `ReferenceError: SHARE_MAX_SLOTS is not defined` and killed the server process (connection-refused for everything after). Restored the definition. Verified the server now boots clean and seeds commodity prices.

## v1.0.2.7 (2026-05-30)

**Commodity market — stage 3: arbitrage shipping (the payoff).**

Buy a commodity cheap at one colony, ship it through a lane, sell it dear at another. Each held commodity in the market panel now has a SHIP button: pick a connected destination + lane, optionally insure, and launch. Shipments reuse the existing lane/risk/blockade model — corporate lanes are safe and slow-cheap, dark lanes fast-risky; tension, enemy territory, blockades, and haul value all push intercept odds up; your faction controlling the route lowers them.

Cargo is escrowed out of your hold on launch and persisted in a new `cargo_shipments` table, so shipments survive a server restart (in-flight runs are rescheduled on boot; overdue ones resolve immediately). On delivery the goods land in your hold at the destination, ready to sell at its live price. On interception the units are lost — insurance refunds the buy cost (premium scales with value); uninsured losses feed the Void raiding kickback like other shipping. A 10s sweep is a safety net for missed timers.

Endpoints: `POST /api/cargo/ship`, `GET /api/cargo/transit`. In-transit shipments show under the market with destination, risk %, and ETA. Verified the full escrow→deliver / escrow→loss lifecycle and the double-resolve guard.

This completes the commodity arc: control sets prices (stage 1), players trade locally (stage 2), and now they move goods between colonies to exploit control-driven spreads (stage 3).

---
## v1.0.2.6 (2026-05-30)

**Commodity market — stage 2: local buy/sell + cargo hold.**

Players can now trade commodities at a colony. The colony detail panel has a Commodity Market section listing all 12 goods with live buy/sell prices (Guild tithe shown where it applies) and BUY/SELL buttons. Bought goods go into a persistent cargo hold (`player_cargo` table, survives disconnect) tracked with weighted-average cost. Selling requires holding the good; over-selling clamps to what you have.

Trading moves the local market: buying tightens local supply and nudges the price up, selling floods it and nudges the price down (scaled by lot size, eased toward a supply-adjusted target, and decaying back over the 5-min tick). No inter-colony shipping yet — buy and sell happen at the same colony. Stage 3 adds arbitrage shipping (buy cheap here, ship through the lane/risk/insurance system, sell dear there).

Endpoints: `POST /api/commodities/buy`, `POST /api/commodities/sell`, `GET /api/cargo/me`. Verified: weighted-avg cost, over-sell clamp, and supply-driven price movement.

---
## v1.0.2.5 (2026-05-30)

**Commodity market — stage 1: control-driven price grid (backend).**

First piece of the new shipping/commodity economy. 12 commodities across three classes (Tech/Industrial, Medical, Agricultural), each tied to a market sector. Every colony has a live price per commodity that floats on which faction leads it: Coalition subsidizes medical (cheap), Syndicate gouges it (dear), Void has cheap tech but dear agriculture (can't farm), Guild keeps narrow efficient spreads plus a small buy-side tithe. Prices mean-revert toward a control-driven target on a 5-min tick with per-faction volatility, clamped to a sane band. Contested colonies carry a scarcity premium.

New `commodity_prices` table (colony × commodity grid). Read endpoints: `GET /api/commodities` (definitions) and `GET /api/commodities/:colonyId` (live grid with buy/sell prices, Guild tithe applied to buys). Prices seed on boot and lazily on first colony read. No trading or shipping yet — that's stage 2 (buy/sell + cargo) and stage 3 (arbitrage shipping). Verified: medical arbitrage spread Coalition→Syndicate ~58%.

Also fixed a leftover 3-faction control object in `runGalaxyTick` (now includes Guild).

---
## v1.0.2.4 (2026-05-29)

**Capital Houses — guild redesign: rename, faucet removal, performance P&L, and governance/voting.**

### Renamed to Capital Houses
The player-fund system is now "Capital Houses" (tab, directory, create form). "Merchants Guild" now refers only to the Patreon tier and its chat channels, ending the three-way collision on the word "Guild." Internal `type`/route ids unchanged. The Merchants Guild "Join" button is now a "★ Become a Patron" CTA that opens patreon.com/FLSH instead of POSTing `/join`.

### Passive faucets removed
Both minted passive-income paths on funds are gone — houses earn through trading performance, not yield: hourly savings interest (`applyFundSavingsInterest`, cron disabled) and the 30-min profit distribution (`DIST_RATE`, removed; the loop now only snapshots NAV). Savings-rate UI badge removed.

### Performance P&L
New `fund_nav_history` table (`fund_id, nav, spp, total_shares, ts`, 1000-row cap) + `recordFundNAVFn` writer and `GET /api/funds/:id/history`. Funds are snapshotted on every trade/deposit/withdraw and on the 30-min loop. The house view shows an allocation donut (NAV composition, NAV in center) plus six metric cards (Max Drawdown, Best/Worst Period, Volatility, Win Rate, Total Return) computed from the value-per-share series — matching the player P&L. spp is the performance line (not raw NAV), so it reflects trading rather than deposits/withdrawals. History begins at deploy.

### Four-pane house view
The detail panel is restructured into sub-views: **Overview** (stats, performance, deposit/withdraw, members), **Portfolio** (holdings, direct trade, activity), **Governance** (mode, proposals, polls), **Manage** (owner: slots, withdraw, assign, invite, edit, disband). Single withdraw control; destructive actions isolated in Manage (owner-only tab).

### Merchants Guild as a 4th controlling faction
The Merchants Guild is now a full galaxy faction alongside Coalition, Syndicate, and Void — fundable on the colony detail page and in the God Panel, able to contest and conquer colonies the same way. Added a `control_guild` column to `colony_state` (lazy ALTER for live DBs). The funding endpoint now redistributes control four ways with a proportional drain that always re-sums to 100, with no faction below 1%. The Guild starts holding **Eyejog** and **Dust Basin** as its territory; a one-time boot correction assigns those two to the Guild only if untouched (war_chest 0, no prior guild control), so it never clobbers live state. Removed Eyejog's old "Patreon-only / cannot be contested" sovereign lock — it is now a normal guild-held colony. Guild players earn the same per-colony passive and bonuses; conquest, leading-faction, and shipping/smuggling risk calcs all recognize the Guild. Also fixed a latent bug where one funding path sent `faction` instead of `factionId` and silently failed.

### Galaxy grey-lane visibility
Grey-market shipping lanes used `#999`, which was nearly invisible against the dark space background. The newly-connected frontier colonies (Eyejog, Dust Basin, Nova Reach, Iron Shelf, Margin Call) link only via grey lanes, so they appeared orphaned even though the lanes were present and clickable. Brightened grey lanes to `#c8cdd6` and matched the map legend swatch.

### Galaxy faction-control fix
The lower-cluster colonies (Eyejog, Dust Basin, Nova Reach, Iron Shelf, The Ledger, Signal Run, Scrub Yard, The Escrow, Margin Call) were rendered on the map but never seeded into `colony_state`, so funding faction control on them returned "colony not found." Added all nine to the colony defaults, and made the seeder backfill per-colony on boot (INSERT OR IGNORE each, instead of bailing whenever any rows already exist) so existing servers pick up the missing colonies without resetting live control/tension on the others.

### Portfolio dividends
Capital Houses (and the Merchants Guild) now earn dividends on the shares they hold, paid into fund cash on the same 2h cycle and base sector rates as players (full rate on Finance/Insurance/Energy/Tech, base rate elsewhere). Funds use the same continuous-holding eligibility as players via a parallel `fund_holding_snapshots` table — no faction/guild bonuses (player-only). A house must hold a position through the eligibility window before it pays, so dividends begin a few cycles after deploy.

### Governance & voting
Owner sets a per-house mode:
- **Executive** — owner trades directly; members passive. (Default for player houses.)
- **Majority Vote** — members propose; passes when yes-weight beats no-weight; direct trades blocked. (Default for the Merchants Guild.)
- **Executive + Council** — members vote (advisory); owner holds final execute/veto and may trade directly.

**Vote weight:** `equal` (one member, one vote) or `shares` (weighted by holdings). **Threshold:** majority of votes *cast*. A proposal resolves the moment every eligible member has voted (owner included; 0-weight members don't block it), otherwise on the owner-set **voting window** — a per-house dropdown of 30m / 1h / 6h / 24h / 3d (default 6h). Proposer auto-casts a yes.

Schema: `house_proposals` + `house_votes` tables (fund-scoped); `governance`, `vote_weight`, `vote_duration_ms` columns on `funds` (lazy ALTER). Endpoints: `POST /api/funds/:id/governance` / `/propose` / `/vote` / `/proposal/:pid/resolve`. Trade execution unified in a shared `executeFundTrade` (direct trades, passed votes, owner overrides). A 60s tick resolves expired proposals; the legacy global-guild proposal system is untouched.

---

## v1.0.2.3 (2026-05-29)

**Weekend bugfix batch.**

### Hedge fund disband payout
`POST /api/funds/:id/delete` refunded each member their original `deposited` amount, ignoring any gains or losses on the fund's holdings — members effectively cashed out at cost basis. Disband now pays each non-owner member their **current share value** (`shares × NAV/totalShares`), with holdings valued at live ticker price. Owner still receives the flat Ƒ5M creation-cost rebate.

### Drone-mining instant kills
Enemies were placed at a uniform-random point inside each newly loaded chunk with no floor on distance to the drone. A chunk overlapping the drone could spawn a hostile on top of the player, one-shotting the drone the moment the chunk loaded. Spawns now reject any position inside `ENEMY_AGGRO_BASE × aggroBoost × 1.25` of the drone (up to 8 retries, then the spawn is skipped), guaranteeing enemies appear outside their own aggro range.

### SWT hard-locked
SWT ran through the beta-model tick with strong anchored mean-reversion around Ƒ4500. That produced a tight, predictable oscillation traders could exploit. SWT is now pinned flat at Ƒ4500 every tick (no drift, no noise, no reversion); a flat OHLC bar is still recorded so the chart renders a clean horizontal line.

### Patreon webhook email matching
The webhook read the patron email only from `included[type=user].attributes.email`. First-time activations match solely on email (no `patreon_member_id` stored yet), so a missing/oddly-cased field meant the role never assigned. The handler now reads the member resource email first, falls back to the included user email, and normalizes (trim + lowercase) to match the stored value (lookup is already `COLLATE NOCASE`).

---

## v1.0.2.2 (2026-04-19)

**NPC ship classes + friendly variants + class-scaled salvage.**

### NPC ship classes
NPCs now spawn as one of five ship classes instead of a single fighter type. Each class has distinct stats (HP, speed, fire rate, hitbox, render size) that stack with existing faction stats.

| Class | HP | Speed | Fire rate | Salvage | Notes |
|---|---|---|---|---|---|
| Fighter | 2 | 1.0× | 1.0× | 1.0× | Baseline, same as before |
| Scout | 1 | 1.4× | 1.1× | 1.2× | Fast, fragile |
| Prospector | 3 | 0.95× | 0.9× | 1.6× | Tanky, slower |
| Hauler | 4 | 0.75× | 0.8× | 2.2× | Slow, hard to kill, big target |
| Dreadnought | 8 | 0.70× | 1.5× | 4.0× | Rare boss encounter |

Class spawn distribution shifts by depth band — NEAR zone is mostly fighters, VOID is mostly haulers. Dreadnoughts have a flat 1% chance at any band, making them an RNG threat even in starter zones.

NPC ships use the existing buyable ship sprites (Scout/Prospector/Hauler/Dreadnought × Coalition/Syndicate/Void variants). Hauler and Dreadnought render noticeably larger than Fighter.

### Dreadnought warning label
Dreadnoughts wear a `⚠ DREADNOUGHT` label instead of the standard `HOSTILE` tag so players immediately know they're staring down a capital-class threat. Label font is bumped and the glow plate is slightly larger.

### Class-scaled salvage
`salvageValueForEnemy` now multiplies the base band value by class salvageMul. A Dreadnought kill in VOID with chase bonus can hit ~Ƒ1,200. Bigger hulls = bigger scrap drops, matching the effort required to kill them. Still worthwhile to engage capital ships if you've got combat-oriented gear.

### Friendly variants (same ship faction = ally)
New `isPlayerAlly(faction)` helper: a faction is friendly to the player if it matches either their FM account faction OR their equipped ship's faction. Flying a Syndicate hull into Syndicate space means the patrol ships there are your allies, even if your FM account is Coalition.

In rival sectors, 20% of NPCs spawn flying the player's ship-faction colors instead of the sector's. This creates a sense of contested territory — Coalition patrols show up in Syndicate space and vice versa. Dreadnoughts never spawn as allies; they're always hostile to preserve the threat.

Ally NPCs get a green `ALLY` label instead of red `HOSTILE`, making them visually distinguishable at a glance.

All aggro / beam / bullet checks updated to use `isPlayerAlly` — your escorts' beam passes through ally NPCs, enemy bullets from ally factions don't hit you, etc.

### Files modified
- `client/assets/drone-mining/index.html` — `NPC_SHIP_CLASSES` table, `NPC_CLASS_TABLE` spawn weights per band, `pickNpcClass()`, `isPlayerAlly()` + `isPlayerEnemy()` helpers, refactored enemy spawn in `buildChunk`, refactored `drawEnemy` to use class sprite + dynamic size + maxHp-aware HP bar, DREADNOUGHT/ALLY labels, `salvageValueForEnemy` class multiplier, all faction aggro checks updated to use the helpers.

---

## v1.0.2.1 (2026-04-19)

**Mining: ship store, faction-style hulls, hull HP, auto-miner toggle, cargo drones, shipyard UI, HUD cleanup.**

### Ship Store — 12 buyable hulls with faction-style gameplay
- Dedicated **SHIPS** button in the loadout bar between STORE and LEADERS opens the Shipyard modal. Every ship is buyable regardless of FleshMarket account faction.
- **Three style tracks × four classes = 12 ships**, plus the free default Mining Drone.
  - **Coalition (Mining focus)** — Prospector Scout Ƒ500k, Auto-Miner Ƒ1.5M, Mining Barge Ƒ3M, Excavator Ƒ5M. Higher drill rate, higher heat cap, slower fire rate.
  - **Syndicate (Combat focus)** — Interceptor Ƒ500k, Gunship Ƒ1.5M, Raider Ƒ3M, Warship Ƒ5M. Higher fire rate, higher bullet speed, more free escorts (up to 4).
  - **Void (Drone focus)** — Courier Scout Ƒ500k, Commander Ƒ1.5M, Mothership Ƒ3M, Hivemind Ƒ5M. Built-in cargo drones and free escorts.
- Ship stats multiply with Fuel/Cargo/Heat loadout tiers and permanent perks (Cargo Optimizer, Salvage Magnet, Improved Scanner, Ion Engines, Cryo-Cooled Emitter).
- Stat axes: `speedMul`, `cargoMul`, `heatMul`, `drillMul`, `fireRateMul`, `bulletSpdMul`. Plus flags: `autoMiner`, `cargoDrones`, `freeEscorts`, `hp`.
- Server-persisted via new `mining_ships` SQLite table (owned JSON blob + equipped column).
- Ship picker tile row in the loadout shows all owned ships as clickable equip tiles, colored by faction.
- BUY/EQUIP buttons self-heal after 4 seconds with no server response, auto-resyncing state.

### Hull HP — armored ships take multiple hits
- Default Mining Drone: 1 HP (unchanged one-shot behavior).
- Scout: 2 HP. Prospector: 3 HP. Hauler: 4 HP. Dreadnought: 5 HP.
- Each non-fatal hit decrements HP, flashes the sprite red, and shows a toast "ARMOR HIT — X/Y HULL."
- 30-frame (0.5s) invulnerability grace after a hit prevents double-tap kills from packed bullets.
- **HP pips render above the player ship in world-space** (same visual as escort drones). Color shifts green → yellow → red as HP drops. Pip offset scales with ship size. No pips shown for 1-HP default drone.
- Shipyard cards display hull HP alongside other stats.
- Opening lore updated: "A single hostile round ends a stock drone — armored hulls take more."

### Auto-miner toggle
- Auto-miner ships (Coalition Prospector, Coalition Excavator, Void Hivemind) drill nearby rocks passively — but toggled OFF by default so low-band areas don't instantly cook your heat sink.
- Press **T** in-field to toggle ON/OFF. Toast confirmation on toggle. Pressing T on ships without auto-miner shows "No auto-miner on this hull."
- Bottom control legend shows `T · AUTO-MINE` when ship has the capability. The T key letter turns green when ON, gray when OFF.

### Cargo drones
- Ships with `cargoDrones > 0` (Void tier) spawn blue delegate drones that orbit the player.
- **New Cargo Drones loadout stepper** — Ƒ800 each, max 3 per run. Stacks on top of ship built-ins.
- When player cargo reaches 50% of cap, an idle drone loads up to Ƒ300 of cargo value, flies to the mothership autonomously, deposits to run-banked total, and returns. Proportional count transfer — the drone hauls the same per-unit value ratio the player keeps.
- 2 HP each, destroyed by enemy fire (loses carried cargo). Dead drones respawn at mothership after 20 seconds.
- **Bought cargo drones refund on safe return** if still alive at run end. Built-in ship drones don't refund.
- Render: 24×24 miniature default Mining Drone sprite. Gold tint + halo while carrying. Carried value shown as `Ƒ###` badge above drone. Health pips visible when damaged.

### Free escorts + faction-adoption
- Several ships spawn with built-in escort drones that don't cost loadout credits (Coalition Excavator 1, Syndicate Gunship 2, Syndicate Raider 3, Syndicate Warship 4, Void Commander 2, Void Mothership 2, Void Hivemind 3).
- Guard Drone perk still stacks on top. Bought escorts refund as before — free ones don't.
- **Escorts adopt ship faction sprite.** Flying a Syndicate ship → escorts wear Kla'ed fighter sprites. Default Mining Drone → escorts follow your FM account faction as before.

### Shipyard UI readability
- Modal widened 780→880px, more padding.
- Ship name 14→17px, bolder. Description 11→13px with lighter color (#d8c8a0). Stats line 10→12px with lighter color (#c8b088). Sprite preview 56→64px. Group headers 11→13px bolder.
- Faction-grouped ship cards with BASELINE / COALITION · MINING / SYNDICATE · COMBAT / VOID · DRONES section headers, color-coded.

### HUD cleanup
- Top-left HUD panel removed entirely (Sector / Zone / Weapon / Hull / Auto-Mine / Assets). Information moved to world-space pips (hull HP) and bottom-bar legend (auto-mine state).
- Fuel (bottom-left), Cargo (top-right), Heat (bottom-right) gauges unchanged.

### Mothership visual
- Replaced vector hexagon mothership with a Starlancer Dominion blue science vessel sprite. Pulsing dock-range rings and central blue docking light preserved.
- Sprite is ~160×136 on screen, reads clearly as a capital-class docking platform.

### Cryo-Cooled Emitter perk
- Ƒ1M permanent upgrade. Heat builds 30% slower while firing the mining beam. Mining laser renders blue instead of white/gold while owned.

### Camera zoom
- World renders at 1.25× zoom. Sprites and asteroids read larger without losing the sense of open belts. Viewport culling bounds and chunk-load radius account for the new effective viewport.

### One-life conversion
- Drone lives stepper removed from loadout. Every run is a single drone. Death ends the run immediately.
- Postmortem shows `Outcome: SURVIVED / DRONE LOST` instead of `Drones Lost X/Y`.

### Visual + mechanics polish
- Bullet sprite rotates +π/2 so projectile tip aligns with travel direction.
- Asteroid hit-boxes match visible sprite area (44% of render radius) rather than bounding box.
- HOSTILE red pulsing labels above every rival enemy.
- RMB auto-cannon with ±60° forward cone proximity aim-snap at ~140 units and 4-frame lead prediction.
- LMB dedicated to mining beam, SPACE removed from fire input.

### Server-crash fix
- `buyMiningShip` in db.js previously called `db.transaction()`, a `better-sqlite3` API. This codebase uses `node:sqlite` (`DatabaseSync`). Every ship purchase was crashing the node process with `TypeError: db.transaction is not a function`. Replaced with the module's own `transaction(fn)` wrapper.

### Files modified
- `server/db.js` — `MINING_SHIP_CATALOG` with 13 entries + `hp` field, `mining_ships` table, ship accessors.
- `server/server.js` — `mining_ships_list`, `mining_ship_buy`, `mining_ship_equip` WS handlers with validation and atomic cash sync.
- `client/assets/core.js` — `pushShipsToIframe`, ship purchase/equip forwarding, cache-buster on iframe src.
- `client/assets/drone-mining/index.html` — 16 new ship sprite registry entries, ship registry + `getEquippedShip()` helper, stat composition, auto-miner toggle, cargo-drone mechanics (built-in + loadout-bought + refund), dedicated SHIPS button and Shipyard modal, loadout ship picker, loadout Cargo Drones stepper, mothership sprite, camera zoom, one-life refund logic, BUY/EQUIP self-heal, HP pips world-space renderer, T key handler, HUD cleanup.
- `client/assets/drone-mining/sprites/` — 16 new ship PNGs (Scout/Prospector/Hauler/Dreadnought × Coalition/Syndicate/Void/Factionless) + mothership.png + updated bullet rotation.
- `client/index.html` — tutorial slide rewritten with Ships section including HP scaling and T toggle; opening lore updated.

### Deploy notes
- No `npm install` required.
- DB migrates automatically via `CREATE TABLE IF NOT EXISTS`.
- Existing player-owned upgrades preserved. Ship ownership starts empty (default Mining Drone always equipped).

---

## v1.0.2.0 (2026-04-18)

**Drone Mining minigame with sprite-based visuals, faction-specific ships, separated mining/combat, tiered salvage, and tutorial accuracy pass.**

### Drone Mining — new Mining tab
- New **⛏ Mining tab** added to the main tab bar between Galaxy and Bugs.
- **Brief screen** inside the tab shows a tutorial covering movement, mining, combat, heat, factions, depth bands, docking, death, refineries, and escorts. High-contrast body text (`#c8b088` on dark) at 16px.
- Clicking **⛏ LAUNCH EXPEDITION** opens the drone mining game in a fullscreen iframe overlay. An in-game "BACK TO FLESHMARKET" button tears down the iframe and returns to the brief screen.
- Bank is shared with the FleshMarket account via the `casino` WS sync pattern. Run-start loadout cost is deducted, run-end banked cargo is credited.
- Game lives at `assets/drone-mining/index.html` as a standalone HTML file that communicates with FM via `window.postMessage`. Runs isolated in an iframe, no CSS/DOM collisions. Still playable standalone (file://) with an internal Ƒ25,000 bank.
- **Cache-buster** on iframe src so updates propagate without manual browser refresh.

### Drone Mining — gameplay
- Single-drone expeditions into an infinite chunked asteroid belt. Depth bands NEAR / MID / DEEP / VOID with escalating mineral richness and hostile density.
- Minerals: Iron Ƒ5, Cobalt Ƒ12, Gold Ƒ25, Painite Ƒ60, Void Opal Ƒ120, Musgravite Ƒ250. Distribution weighted by depth.
- **Mining controls — LMB fires the mining laser beam.** The beam is a thin precision cutting tool that damages asteroids only. Hold to drill a rock; when the bar fills, the mineral and ore count are revealed. Empty rocks still require a full drill cycle and then explode with an 8-frame animation.
- **Combat controls — RMB fires the auto-cannon.** Projectile weapon independent of the mining beam. Bullets travel straight-forward from the ship's nose. Within a 140-unit proximity and a ±60° forward cone, the cannon snaps its aim to the nearest rival enemy with 4-frame lead prediction. Beyond that, manual aim by rotating the ship.
- **Hostile identification.** Every rival enemy shows a pulsing red **HOSTILE** tag above its sprite. Same-faction allies render without tags.
- **Faction-specific ship sprites.** Coalition players fly the Nairan fighter (teal). Syndicate players fly the Kla'ed fighter (red). Void players fly the Nautolan fighter (purple). Factionless players fly the neutral Main Ship. Escorts match player faction. Enemies render with their faction's fighter sprite. All ships render at 48px on-screen regardless of source sprite size.
- **Per-faction combat stats.** Coalition baseline; Syndicate +15% speed / +20% fire rate / +10% bullet speed (fast aggressive); Void -15% speed / -20% fire rate / +30% bullet speed (slow heavy).
- **Factionless = hostile to all.** Players with no FM faction set are treated as rival by every enemy patrol. Lone-wolf mode.
- **Tiered scrap drops.** Enemy salvage value scales by faction difficulty (Void 1.45×, Syndicate 1.10×, Coalition 1.00×), run threat (+15% per extra drone bought), and chase state (+20% if actively hunting you). Tougher fights pay better.
- **Asteroid hit-boxes match visible sprite**, not the full bounding box. Collision radius is 44% of render radius to match the 40% opacity coverage of the voidpack sprite.
- **Drone refund on safe return.** Docking at the mothership refunds the drone's Ƒ1,000 base cost in addition to banking cargo. Dead drones do not refund.
- **Open Range framing.** Game text reframed as unregulated asteroid extraction zones where every faction has agreed that mining is where conflict happens.
- One-shot death model, laser overheat with heat lockout (weapon + thrust both locked at 100% heat until cooling to 40%).
- **Mobile refineries** (Ƒ400) deployable with R — stationary fuel generators, 3 HP, destructible by enemies.
- **Escort drones** (Ƒ1,500 per drone) orbit and shoot automatically, 2 HP each, lost with the drone they escort.
- Enemies collide with asteroids and require line-of-sight to shoot through rocks; bullets are absorbed on asteroid hit.
- Em dashes scrubbed from player-visible UI strings per style rule.

### Drone Mining — permanent upgrade store
- **Mining Store** accessible from the brief-screen menu (STORE button). Server-persisted upgrades purchased with Social Credits.
- **Cosmetic titles:** Drone Pilot (Ƒ25k), Belt Runner (Ƒ250k, requires 25 runs), Void Diver (Ƒ1M, requires reaching VOID band), Scrap Baron (Ƒ5M, requires Ƒ10M lifetime profit). Granted titles also add to the main FleshMarket ownedTitles collection via `title_updated` WS broadcast.
- **Gameplay perks:** Guard Drone (Ƒ150k, free extra escort each run), Ion Engines (Ƒ1M, passive fuel regen), Salvage Magnet (Ƒ250k, pull radius 90→150), Improved Scanner (Ƒ400k, asteroids pre-revealed), Cargo Optimizer (Ƒ750k, +10 cargo cap), Rescue Beacon (Ƒ500k, one-per-run cargo recovery on death).
- Server-side validation prevents duplicate purchases, enforces gates, and atomically deducts cash.
- `LEADERS` button on the brief screen shows top 10 by best_run_profit with faction-color names and band badges.

### Drone Mining — sprite assets (all CC0 / permissive)
- Asteroid base + 8-frame explosion animation: **Foozle Void Environment Pack** (CC0)
- Player Main Ship: **Foozle Void Main Ship** (CC0)
- Kla'ed fighter (Syndicate), Nairan fighter (Coalition), Nautolan fighter (Void): **Foozle Void Fleet Packs 1/2/3** (CC0)
- Auto-cannon projectile: Main Ship weapons pack

### Onboarding tutorial
- **DRONE MINING slide** (10th of 13) between Casino and Social/Economy. Switches to the Mining tab when viewed.
- **Main tutorial "How Mining Works" slide** rewritten: LMB mining (not SPACE), RMB auto-cannon combat with proximity snap, HOSTILE tag explanation, new Scrap section explaining tiered salvage, factions section notes factionless = hostile to all.
- **SHORT SELLING slide rewritten** for accuracy: 50% cash collateral locked, 0.1% borrow fee per 30 minutes, 500-share cap per symbol, covering counts as a day trade.
- **DIVIDENDS AND ANALYSIS slide rewritten** for accuracy: Finance/Insurance/Energy/Tech pay 0.6% every 2 hours, all other sectors pay 0.2%, colony/faction bonuses stack, Merchants Guild members +1% per MG member. Seven-cycle (3.5 hour) continuous-hold requirement.

### Integration details
- `client/assets/core.js` — tab switcher wired for `mining` pane; `pushBankToIframe()`, `pushFactionToIframe()`, `pushUpgradesToIframe()`, `pushLeaderboardToIframe()` helpers; cache-buster on iframe src; faction defaults to `'none'` when `ME.faction` is not one of the three valid factions.
- `client/assets/tutorial.js` — DRONE MINING slide added; SHORT SELLING and DIVIDENDS AND ANALYSIS slides rewritten for accuracy.
- `client/index.html` — Mining tab button added; brief screen pane and fullscreen iframe host; main tutorial mining slide rewritten for current controls.
- `client/assets/drone-mining/index.html` — standalone game with FM-bridge postMessage hooks, sprite-based rendering with offscreen tint canvas, faction-specific ship selection, LMB/RMB split controls, tiered salvage drops, HOSTILE tags, proximity aim-snap, 8-frame explosion animations, scanner perk pre-reveal.
- `client/assets/drone-mining/sprites/` — 7 PNG sprites: asteroid, asteroid_explode (8-frame strip), main_ship, nairan_fighter, klaed_fighter, nautolan_fighter, player_bullet (4-frame strip).
- `server/db.js` — `mining_upgrades` and `mining_stats` tables; `MINING_UPGRADE_CATALOG`; `getMiningUpgrades`, `hasMiningUpgrade`, `getMiningStats`, `canBuyMiningUpgrade`, `grantMiningUpgrade`, `recordMiningRun`, `getMiningLeaderboard` helpers.
- `server/server.js` — `mining_upgrades_list`, `mining_upgrade_buy`, `mining_run_complete`, `mining_leaderboard` WS handlers.

### Deploy Notes
- Client-only changes for most of the mining surface, plus server.js + db.js for the upgrade store
- DB migrates automatically via `CREATE TABLE IF NOT EXISTS`
- No `npm install` required

---

## v1.0.1.9 (2026-04-16)

**Discord button + dividend hold-time exploit fix.**

### Changes
- Added Discord button to header bar, right of Patreon — links to https://discord.gg/H47DnbY33t
- Discord button uses Discord brand blue (#5865F2) muted toward game palette, with matching pulse animation
- **Dividend exploit fix:** stocks must now be held through at least 7 trading-day snapshots (7 × 30-min EOD cycles = 3.5 hours) to be eligible for dividend payouts
- Prevents the "buy right before dividend, collect, sell" exploit
- New `holding_snapshots` table records each player's stock positions at every 30-min EOD cycle
- `runDividends()` now computes eligible qty as `min(current_qty, min(qty) across last 7 snapshots)`; new purchases pay zero until they age in
- Selling immediately reduces eligibility — you cannot receive dividends on shares you no longer hold
- Snapshot cycles older than the 7-cycle window are automatically pruned

### Files Modified
- `client/index.html` — Discord button + pulse animation
- `client/version.json` — version bump
- `server/db.js` — added `holding_snapshots` table, `snapshotAllHoldings()`, `getEligibleDividendQtyBulk()`, `DIVIDEND_HOLD_CYCLES` constant
- `server/server.js` — `runDividends()` uses eligible qty; `_passiveIncomeTick` calls `snapshotAllHoldings()` each 30-min cycle

### Deploy Notes
- No `npm install` required
- New SQLite table created automatically on first `initDB()` call (idempotent `CREATE TABLE IF NOT EXISTS`)
- Migration behavior: dividend payouts pause for the first 7 EOD cycles (3.5 hours) after deploy, then resume normally — no grandfathering of existing positions (closes the exploit window)

---

## v1.0.1.8 (2026-04-12)

**FLSH permanently pinned at Ƒ1B.**

### Changes
- `updateFLSHPrice()` stripped of all drift, shocks, and stock split logic
- FLSH price now hardcoded at Ƒ1,000,000,000 every tick — no random walk, no GBM, no shocks
- Removed the 5:1 stock split mechanic (no longer reachable since price never moves)
- Removed the `chat_system` broadcast and headline announcement that fired on splits
- OHLC bar aggregation kept so the chart still renders flat at Ƒ1B
- FLSH continues to function as a stable reference asset and dev valuation marker

### Files Modified
- `server/server.js` — `updateFLSHPrice()` rewritten to pin price, no drift/split logic

---

## v1.0.1.7 (2026-04-12)

**SWT anchored at Ƒ4500, BRNC normal ticker, sawtooth fix.**

### The Bug
- SWT was cycling predictably between Ƒ4000 → Ƒ1500 → Ƒ4000 every couple days
- BRNC was stuck low with no recovery mechanism
- Root cause: SWT spawned at Ƒ280 with `offset 2.23` had a soft drag at Ƒ1387 and an emergency reversion target of Ƒ1675 from the anti-runaway gravity system. When SWT hit Ƒ4467 (lifetime gain > 2.77), the emergency reversion fired hard and yanked the price toward Ƒ1675. As it fell past the threshold, the trap released and natural drift pushed it back up. Predictable sawtooth.
- BRNC was running through the regular beta model but with very weak `ownKappa` (0.000005) — its `ownTargetLnP` drifted essentially randomly with no real pull toward any center. Combined with blockade hits, it had no recovery mechanism.

### SWT Fix — Anchored at Ƒ4500
- Spawn price + natural center both set to Ƒ4500
- `ownKappa = 0.00015` (~30x stronger than regular tickers — pulls hard toward Ƒ4500)
- `targetDriftSigma = 0.00006` (half regular drift — more stable target)
- New `_isAnchored = true` flag exempts SWT from the anti-runaway gravity that was causing the sawtooth
- Hard ceiling raised to Ƒ10,000 for anchored stocks (was Ƒ5,000) so SWT doesn't constantly bump the cap
- Startup forces `lnP`, `_spawnLnP`, `ownTargetLnP`, `_naturalCenter` to Ƒ4500 — overwrites any restored DB state
- Will oscillate naturally around Ƒ4500 with normal market noise but always pulled back

### BRNC Fix — Normal Beta-Model Ticker
- All special anchoring removed
- Uses regular `ownKappa`, `targetDriftSigma`, `targetSectorKappa` (manually applied since the main `companies.forEach` ran before BRNC was pushed)
- Anti-runaway gravity applies normally
- One-time fixup only triggers if price is broken (NaN, zero, > Ƒ5000)
- Will drift around its sector 3 fair value with normal volatility

### Files Modified
- `server/server.js` — SWT/BRNC config, beta-model init, anchored stock support in `stepMarket`, raised hard ceiling for anchored tickers, startup fixup

---

## v1.0.1.6 (2026-04-12)

**FLSH stock split, short cover rework, Private Army, short persistence fix.**

### FLSH Stock Split
- FLSH price forced to Ƒ1B on startup regardless of saved state
- When price crosses Ƒ5B during runtime, executes a 5:1 split
- All holders get 5× shares via `UPDATE holdings SET qty = qty * 5 WHERE symbol = 'FLSH'`
- Online players get in-memory update + portfolio push
- Price resets to Ƒ1B
- Headline + chat system message broadcast
- Cost basis total unchanged (per-share basis halves but total preserved)

### Short Cover Rework
- Buy handler now splits into two paths based on `have < 0`
- **Cover path**: caps qty at the short position size, charges cover cost + tax, calculates realized P&L from average entry price vs current price, closes the position, cleans up `basisC` proportionally on partial covers, sends P&L result to chat
- **Blocks buying through**: if a player tries to buy more than their short size, the excess is rejected with "close your short first before going long"
- **Normal long buy**: unchanged path when `have >= 0`
- Limit order fills still use the old blind-add pattern — known limitation, lower priority since covers go through market orders

### Short DB Persistence Fix [CRITICAL]
- Root cause of the cover-allocates-shares bug from earlier reports
- `db.js` had four filters that dropped all short positions on every save/load cycle:
  - Save filter at line 225: `if (qty>0)` — negative holdings (shorts) were never written to the `holdings` table
  - Save filter at line 229: `if (bc>0)` — negative basis (short entry tracking) was never saved
  - Hydration filter at line 267: `if (h.qty>0)` — negative holdings were never loaded from the `holdings` table
  - Hydration filter at line 269: `if (b.basis_c>0)` — negative basis was never loaded
- After any `pm2 restart` or `savePlayer()` call, all short positions silently vanished from the DB. When the player tried to cover, `have = 0`, so the cover path never triggered and the normal buy path ran — allocating shares instead of settling P&L.
- Fixed all four filters from `> 0` to `!== 0`
- SQLite INTEGER column accepts negatives natively — no schema change needed
- `snapshotPortfolio` already handled negative holdings correctly (line 3260 filters `qty !== 0`, lines 3263-3266 calculate avg/isShort properly) — only the persistence layer was broken

### Private Army (Blockade Break)
- New `private_army` WebSocket handler in server
- Costs Ƒ50,000 (same as `BLOCKADE_THRESHOLD`)
- Instantly breaks an active blockade — clears the timer, deletes the blockade entry, broadcasts a headline with the player's name, pushes `blockade_update` with `broken:true`
- Red "⚔ PRIVATE ARMY — Break Blockade (Ƒ50,000)" button added in two places:
  - Lane detail panel (always visible — server rejects with "No active blockade on this lane" if not active)
  - Main shipping tab blockade panel
- Confirmation dialog before sending
- Toast on success: "⚔ Private army deployed! Blockade destroyed."

### Files Modified
- `server/server.js` — FLSH split logic in `updateFLSHPrice`, buy handler split into cover vs long paths, `private_army` WS handler
- `server/db.js` — `executeStockSplit()` function added, holdings/basis save+hydrate filters changed `> 0` → `!== 0`
- `client/assets/galaxy.js` — Private Army button (lane detail + main shipping panel), `_gLanePrivateArmy` and `_gPrivateArmy` handlers, `private_army_result` WS handler

---

## v1.0.1.5 (2026-04-11)

**Eyejog system view re-enabled.**

### Eyejog
- Removed `isEyejog` from the System button exclusion list in the colony detail panel
- Eyejog now opens the standard single-body system view (same render path as Lustandia, Gluttonis, Abaddon)
- Only Flesh Station remains non-visitable
- Planet cards in the detail panel remain non-clickable (Eyejog is still flagged `SP_SINGLE_BODY`) — consistent with the lore of Eyejog as a single celestial body

### Files Modified
- `client/assets/galaxy.js` — one-line change to System button exclusion condition

---

## v1.0.1.4 (2026-04-10)

**Wall-clock aligned passive income and day-trade reset.**

### The Bug
- The passive income `setInterval` drifted from wall-clock because it started counting from server boot time, not from the next `:00` or `:30` boundary
- If the server started at 14:07, resets happened at 14:37 / 15:07 / 15:37, etc.
- Client countdown + EOD timer used wall-clock `:00` / `:30`, so players trading at 14:29 saw "resets in 1 minute" but actually had to wait 8 more minutes
- Player reported day trades not refilling at the expected EOD boundary

### The Fix
- Converted the passive income `setInterval` to a wall-clock aligned scheduler
- At server startup, `scheduleAlignedPassiveIncome()` calculates `msUntilNext` to hit the next `:00` or `:30` boundary exactly, fires the first tick there, then `setInterval` every 30 minutes from that point
- All subsequent ticks land on wall-clock `:00` / `:30` — matching what the client shows
- Startup log now reports: `[PassiveIncome] First tick in Xs (aligned to :00)` or `:30`

### Side Benefits
All 30-minute cycle events now align to wall-clock `:00` / `:30`:
- Day-trade counter reset
- Passive income payouts
- Leaderboard snapshot
- Hot stocks rotation
- President passive income
- Guild fund distributions
- Void Collective raid income

### Files Modified
- `server/server.js` — passive income loop refactored into named `_passiveIncomeTick` function invoked by a wall-clock aligned scheduler

---

## v1.0.1.3 (2026-04-10)

**Critical short-sell exploit fix, Eyejog detail panel fix.**

### Short-Sell Money Duplication Exploit [CRITICAL]
- Player reported duplicating ~Ƒ50,000 by shorting while holding long positions
- Root cause: in the short-sell branch of the order handler, the long-clear block credited cash for the existing long position but **never zeroed `actor.holdings[s]`**
- Subsequent `holdings[s] = (have) - shortQty` line then did `100 - 100 = 0`, leaving no short position recorded
- The short proceeds credit still fired, so the player received cash for both the long sale AND the "short" (which was never actually opened)
- Example: Own 100 shares at Ƒ50, short 200 at Ƒ60 → received Ƒ6,000 (long sale) + Ƒ6,000 (phantom short proceeds) = Ƒ12,000 cash with no holdings, no basis, no owed shares. Pure profit of Ƒ6,000 per occurrence.

### Fix
- Added `actor.holdings[s] = 0;` inside the long-clear block before the short delta is applied
- Traced all three scenarios to verify fix:
  - **Pure short (have=0)**: unchanged — long-clear block skipped, holdings goes from 0 to -qty
  - **Short through long (have>0)**: long cleared, cash credited, holdings zeroed, then shorted properly
  - **Add to existing short (have<0)**: unchanged — long-clear skipped, holdings goes more negative

### Eyejog Detail Panel
- Eyejog was flagged as `SP_SINGLE_BODY` (no star + orbiting planets) but its `COLONY_META` config still listed 2 planets (Guild Market, Sand Exchange) with clickable `spOpenSystem` handlers
- Clicking a planet card would call `spOpenSystem('eyejog')` which was also explicitly blocked, creating a dead-end interaction
- Fix: Added `SP_SINGLE_BODY[id]` check in the planet grid renderer — single-body colonies now render planet cards as static info cards (no onclick, no "ENTER ›" arrow)
- Also removed a duplicate `var isEyejog` declaration

### Files Modified
- `server/server.js` — short-sell handler, long-clear block
- `client/assets/galaxy.js` — detail panel planet grid, duplicate variable removal

---

## v1.0.1.2 (2026-04-08)

**Market tools, mobile responsiveness, tutorial rewrite.**

### Watchlist
- ★ toggle on every ticker row — click to add/remove from watchlist
- "★ Watchlist" filter button above search — shows only starred tickers when active
- Count badge updates live
- Persists in localStorage across sessions

### Price Alerts
- Alert panel below Limit Orders: set symbol / above or below / target price
- Alerts checked on every 500ms price tick via `fm_ws_msg` listener
- Fires toast notification + sound when triggered (one-shot, then removed)
- Active alert list with ✕ remove buttons
- Auto-fills current symbol on focus
- Fired alerts cleaned from localStorage on page load

### Portfolio Performance Metrics
- 6-card grid added to P&L tab: max drawdown, best period, worst period, volatility, win rate, total return
- Fetches from `/api/pnl/:token` on first P&L tab click
- Computed from `net_worth_history`: std dev of returns, peak-to-trough drawdown, % positive periods
- Color-coded: green for positive, red for negative, amber for volatility
- Manual refresh button

### Company Detail Panel
- Expanded info panel below chart canvas, updates on every tick and symbol change
- Shows: symbol, name, sector (color-coded badge), HQ colony, dividend eligibility
- Shows: current position size and unrealized P&L, short position info, open limit order count
- Symbol change detected via `Object.defineProperty` on `window.CURRENT` with polling fallback

### News Filter
- Search input + tone dropdown (Good/Bad/Neutral/All) between News heading and feed
- Non-matching headlines dimmed to 15% opacity with collapsed height
- ✕ clear button resets all filters
- Incoming headlines respect active filter state

### Mobile Responsiveness
- `mobile.css` — 5 breakpoint tiers: 1100px (shrink grid), 900px (stack to 1-column), 640px (phone), 400px (extreme compact), landscape short-height
- `mobile.js` — collapsible Companies/News/Wire Credits sections, mobile bottom nav bar, touch optimizations
- Custom cursor PNGs disabled on touch devices via `@media (pointer: coarse)`
- Bottom nav bar with 6 tabs (Market/Heat/Casino/Galaxy/Store/P&L) at ≤900px, syncs with desktop tab clicks
- Galaxy map colony sidebar stacks below map instead of beside it on narrow screens
- Safari `100dvh` viewport height fix
- Touch target minimum sizes: 36px tickers, 32px buttons, 28px tabs
- All modals/popups go full-width on phone
- God panel, mod panel, player profile adapt to small screens
- Original `<h2>` headings hidden when collapsible replacements active (no duplicates)

### Tutorial Rewrite
- Expanded from 9 slides to 12 slides covering all current features
- New slides: Market Tools (alerts, news filter), Short Selling (margin, borrow fees), The Store (titles, inventory, ƒbay, slots)
- Fixed: Casino slide listed Plinko (disabled) and Slot Machine (moved to Store), missed Roulette/Sudoku/Math Quiz
- Fixed: Blackjack described as "5 AI opponents" (removed in prior rewrite, now "6-deck shoe with card tracking")
- Fixed: Guild tab navigation (hidden for non-Patreon users, caused empty panel)
- Updated: Dividends slide now covers Heatmap + P&L + metrics
- Updated: Shipping slide now mentions Lane Shares inline
- Updated: Summary slide references all new features including bug reports tab
- Guild slide replaced with Social & Economy slide (navigates to Market tab, not hidden Guild tab)

### UI Polish
- Ticker/news divider: `<hr/>` changed from 1px dashed to 2px solid with amber glow
- Store sub-tabs (Titles/Inventory/Ƒbay/Slots): inactive color `#553333` → `#997755`, active `#c8a86a` → `#e6c27a`, underline brightened, font bumped, dark background added

### New Files
- `client/assets/market-tools.js` (620 lines) — watchlist, alerts, metrics, company detail, news filter
- `client/assets/mobile.css` (354 lines) — responsive breakpoints, bottom nav, collapsibles
- `client/assets/mobile.js` (244 lines) — collapsible sections, bottom nav behavior, touch fixes

### Files Modified
- `client/index.html` — 3 new references (mobile.css, market-tools.js, mobile.js), inline CSS for new features, store sub-tab color fix
- `client/style.css` — hr divider style updated
- `client/assets/tutorial.js` — full SLIDES array rewrite (9 → 12 slides)
- `client/version.json` — version bump to 1.0.1.2

### Server
- Zero changes. All features are pure client-side.

---

## v1.0.1.1 (2026-04-03)

**Title rework, store tab restructure, Patreon button glow.**

### Titles
- Renamed all 20 purchasable titles and 6 Patreon-exclusive titles
- Rewrote all title descriptions to read as colony dispatch notes rather than taglines
- DB migration on startup: renames equipped titles and owned_titles for existing players
- President of The Coalition description updated

### Store Tab Restructure
- Store tab now contains four sub-tabs: Titles, Inventory, Ƒbay, Slots
- Inventory panel (equipped gear + bag grid) moved from floating modal into Store
- Item market renamed to Ƒbay, moved from floating modal into Store
- Slot machine moved from standalone modal into Store
- Floating invPanel and slotModal removed
- Inventory and Slots buttons removed from top bar

### Top Bar
- Patreon button enlarged with amber pulse glow animation
- Cleaner layout with fewer buttons

---

## v1.0.1.0 (2026-04-01)

**Beta market model, news feed rewrite, heatmap fix.**

### Market Simulation — Beta Model
- Replaced sector-lockstep model with per-stock beta sensitivity system
- Each stock gets a `beta` (0.1–2.5) controlling reaction to sector *changes* (delta per tick), not absolute sector level
- Each stock has an independent `ownTargetLnP` (personal fair value) that drifts via random walk with very weak pull toward sector
- `ownKappa` tuned to 0.000005 (80× weaker than old model) — prevents both momentum and mean-reversion exploits
- Parameters validated through 5-iteration simulation sweep across 30 simulated days (5.1M ticks):
  - Lag-1 autocorrelation: -0.007 (essentially zero)
  - Momentum strategy Sharpe: 0.051 (not exploitable)
  - Mean-reversion strategy Sharpe: 0.051 (not exploitable)
  - 3-day streak persistence: 48% (coin-flip)
- Individual stock sigma boosted ~2.5× (0.0004–0.00075), fat tail probability widened (2% at 2.5×, 8% at 1.5×)
- Vol clustering range widened (0.00015–0.0015 vs old 0.00008–0.0008)
- Beta and ownTargetLnP persist through market state save/restore (db.js updated)
- Gravity, stock splits, admin bias, god panel, earnings all unchanged

### News Feed — Full Rewrite
- 56 sector-specific lore headlines across 8 sectors (good/bad/weird per sector)
- 20 market-wide headlines (no specific ticker — "dark pool activity surges", "flash crash in off-hours trading")
- 7 colony-flavored headlines referencing colony names ("Unrest simmers at Cascade Station")
- Price impact reduced ~10× (0.02–0.08% vs old 0.1–0.4%) — news is flavor, not market driver
- Clicking any company headline navigates to that ticker's chart (same behavior as heatmap cells)
- Category badges in feed: MKT (market-wide), COL (colony), SYS (system events)
- Tone coloring: green/red/amber with hover highlights and timestamps

### Heatmap Bug Fix
- Fixed: `_makeHeatCell` crashed on `t.price.toFixed(2)` when price was null, killing entire `refreshHeatmap` — only 3 of 8 sectors rendered
- Added null guard for price, wrapped each sector block and cell in try/catch
- Added `sector` to `/state` endpoint so heatmap groups correctly on first load before any tick
- Fixed: duplicate `COLONY_DISPLAY` const (function-scoped in fireTensionEvent vs module-level in news) — renamed news copy to `NEWS_COLONY_NAMES`

---

## v1.0.0.4 (2026-03-28)

**Faction persistence, server-authoritative day-trade enforcement.**

### Faction — Persistence Fix
- Fixed: faction assignment dropped on client refresh (showed unassigned after F5)
- Root cause: `hydratePlayer()` in db.js never read `faction` column from DB row
- Added `faction` to hydratePlayer return, /api/login response, fm:authed event, window.ME, and galaxy.js welcome handler
- Faction now survives refresh through four redundant paths covering every load order

### Day Trades — Server-Authoritative Enforcement
- Day-trade limit (3 per 30-min EOD cycle) now enforced server-side
- In-memory Map tracks round trips per player: buy ticket → sell pairs, short ticket → cover pairs
- Server rejects market orders, limit order placement, and limit order fills at cap
- `dt_update` WS message pushed to client after every trade and on EOD reset
- `dayTradesRemaining` included in portfolio snapshots for sync on connect
- Removed client-side localStorage tracking and marketAPI wrapper patching
- trade-limit.js rewritten as display-only badge synced from server state
- Eliminates all client-side exploits: console manipulation, localStorage clearing, raw WS sends

---

## v1.0.0.3 (2026-03-28)

**Viewport lock, layout overhaul, Wire Credits hardening, leaderboard relocation.**

### Wire Credits — Security Fix
- Blocked self-transfers (previously allowed infinite money duplication by wiring to yourself)
- Transfers no longer broadcast to public news headlines — now private between sender and recipient
- Both sender and recipient receive ⚡ SYSTEM chat messages confirming the wire
- Recipient's portfolio auto-refreshes on receive

### Viewport — Full-Screen Fit
- Entire UI now fits within the browser viewport with no scrolling required
- `.wrap` converted to a flex column locked to `100vh`
- CSS grid row constrained with `grid-template-rows:minmax(0,1fr)` to prevent content overflow
- Left panel scrolls internally; center and right panels use flex column layout
- All hardcoded `calc(100vh - ...)` heights removed from galaxy map, factions, contracts, guild, and bugs tabs — replaced with `flex:1;min-height:0` for natural fill
- Bottom bar (live market ticker) pinned at bottom with `flex-shrink:0`

### Leaderboard — Compact Right Panel
- Moved from bottom bar into right panel, below Wire Credits
- Shows top 10 players only — compact `.72rem` rows, no scrolling
- If you're outside top 10, your entry appears as the 11th row with a dashed separator and your actual rank number
- Your own row highlighted with amber border
- Removed level display for compactness
- Bottom bar now contains only the live market ticker strip

### Galaxy Map — Layout Fix
- Galaxy tab switched from `display:block` to `display:flex` with `flex-direction:column`
- Fixed conflicting tab handler in `market-state.js` that was overriding `display:flex` with `display:block` — the root cause of the galaxy map overflow
- Map pane, factions pane, and contracts pane all use `flex:1` to fill available space
- Shipping lanes legend fully visible at bottom of map

### Live Trades — Relocated
- Moved from left panel (under news) to center panel (under XP bar) in the Market tab
- Removed the `injectTradeFeed()` DOM-move function from `sound.js` — feed is now statically positioned in HTML

---

## v1.0.0.2 (2026-03-28)

**Market stabilization, economy rebalancing, chat/leaderboard overhaul.**

### P&L Fix
- Smuggling interception path now sends `snapshotPortfolio` immediately — P&L updates in real time after both successful and intercepted runs (previously only success pushed portfolio)
- Smuggling start also pushes portfolio after stake deduction

### Wire Credits (replaces legacy Transfer)
- UI renamed from "Transfer (2% tax)" to "Wire Credits"; send button relabeled to "Wire"
- **90% Merchant Guild surcharge** on the portion of any transfer exceeding Ƒ10,000 (server-enforced, additive with standard 2% base tax)
- Fine print under the Wire Credits UI explicitly states the tax tiers
- Insufficient funds error now returns exact breakdown: amount + base tax + Guild surcharge
- Headlines show both fees separately when Guild surcharge applies

### A−/A+ Chat Font Buttons
- Increased from `.72rem` transparent ghost buttons to `.85rem` bold amber buttons with dark background, visible border, and bright hover state

### Chat Auto-Scroll
- Each chat pane caps at 20 messages; oldest messages pruned on every append to keep chat in eyeline
- Auto-scrolls to bottom on every new message

### SWT / BRNC Ticker Normalization
- **Root cause**: Both had sigma values designed for daily ticks but running on 500ms ticks (172,800×/day). SWT `sigma: 0.042` compounded to ~1,750% daily volatility. No ceiling, no mean-reversion.
- **Fix**: Removed `_special` flag entirely. SWT and BRNC now run through the normal `stepMarket` GBM+GARCH loop with sector mean-reversion, anti-runaway gravity, graduated pullbacks, and 1:1000 stock split at Ƒ5,000 — identical to every other ticker.
- SWT: `offset: 2.23` (gravitates toward ~Ƒ280 within sector 7)
- BRNC: `offset: 0.77` (gravitates toward ~Ƒ65 within sector 3)
- Removed `updateSpecialCompanyPrice` function entirely
- On first boot, any saved prices above Ƒ5,000 (from the explosion bug) are reset to compiled defaults

### Smuggling Cooldown
- Increased from 60 seconds → 15 minutes
- Error message now shows remaining time ("Cooldown active — 12m 18s remaining")

### Leaderboard — EOD Freeze
- Leaderboard is now frozen at each 30-minute income cycle via `snapshotLeaderboard()`
- `broadcastLeaderboard()` sends the frozen snapshot, not a live query
- Init message and `request_state` handler both use the snapshot
- **Client caching**: leaderboard payload cached to `localStorage` under `fm:lb_snapshot`; restored immediately on page load before WebSocket connects, so the board survives browser refresh
- Removed `leaderboard-local.js` — was computing net worth client-side every 5 seconds and overwriting `#board`, fighting the server snapshot

---

## v0.9.0 — Modular Client + Polish (2026-03-24)

**Client architecture refactor.** The monolithic `index.html` (909 KB) has been split into 18 JavaScript modules and 13 CSS files. `index.html` is now ~102 KB and serves as a thin shell.

### New module files (`client/assets/`)
| File | Contents | Size |
|---|---|---|
| `core.js` | WebSocket, market engine, tab routing, chart | 113 KB |
| `inventory.js` | Pixel art data, item/slot UI, slot machine | 331 KB |
| `galaxy.js` | Galaxy map, faction system, colony UI | 108 KB |
| `casino-blackjack.js` | Blackjack with 5 AI opponents | 31 KB |
| `casino-poker.js` | Texas Hold'em vs AI | 19 KB |
| `casino-chess.js` | Chess with engine integration | 19 KB |
| `casino-sudoku.js` | Sudoku | 11 KB |
| `casino-mathgame.js` | Math quiz game | 10 KB |
| `casino-minesweeper.js` | Minesweeper | 8 KB |
| `funds.js` | Guild and hedge fund system | 26 KB |
| `market-state.js` | Persistence helpers, full tab switcher | 20 KB |
| `god-panel.js` | Dev/admin tools panel | 22 KB |
| `sound.js` | Web Audio system, sector name constants | 17 KB |
| `shorts.js` | Short position UI and borrow fee tracking | 11 KB |
| `player-profile.js` | Player profile popup | 10 KB |
| `chat-ui.js` | Chat tab switching, room indicators | 7 KB |
| `block-users.js` | Client-side user blocking | 6 KB |
| `market-orders.js` | Buy/sell modal controllers | 6 KB |

### Lazy loading
- `galaxy.js` (108 KB) — loads only on first Galactic tab click
- `inventory.js` (331 KB) — loads only on first Inventory/Store tab click
- Casino scripts (poker, chess, sudoku, mathgame, minesweeper) — load on first subtab click; blackjack loads eagerly as the second-most-visited tab

### Removed
- Client-side NPC engine (`npc_traders.js`, `strategies.js`, `npc_config.json`) — dead code, never connected. Server GBM+GARCH handles all price movement. Lore decision: players are the story; fake volume dilutes that.

### Bug fixes in this release
- Cursor PNG paths corrected after CSS extraction (double `assets/` prefix stripped)
- Galaxy map black screen fixed — `window.__galaxyOpen` exposed for post-DOMContentLoaded lazy init
- Five missing CSS `<link>` tags restored (`sell-modal`, `casino-roulette`, `casino-sudoku`, `casino-mathgame`, `casino-minesweeper`)
- Orphaned HTML in unmod-warning-modal div restored after bad style-block extraction

---

## v0.8.x — Cyberpunk Augmentation Update

*Formerly `PATCH_NOTES_I.md`*

### Inventory & Slot Machine
- All clothing slot items now display as 32×32 cyberpunk pixel art icons (hat, glasses, upper body, necklace, watch, pants, shoes)
- Slot machine win screen shows item art at 64×64
- 40 new clothing items across 7 slots with cyberpunk-themed names and pixel art

### New: Implant Slot
- 40 cyberpunk body augmentation items (Neural Combat Blade through Chrome Endoskeleton)
- Implants range Common (+20 Ƒ/30min) through Legendary (+750 Ƒ/30min)
- Existing databases auto-migrated to add the new column

### Set Bonuses
- Neon Syndicate, Crimson Wave, Ghost Protocol, Chrome Corp
- 2–5 piece stacking passive income bonuses
- Active set bonuses shown live in inventory panel

### God Mode
- All 40 clothing items and 40 implants available in the God Menu item picker
- `give_item` command works with all new item IDs

---

## Build H — UI & Casino Overhaul (2026-03-16)

*Formerly `PATCH_NOTES_H.md`*

### End-of-Day Timer
- Large green glowing countdown in header next to logo
- Turns urgent red with faster pulse when under 3 minutes remain

### Blackjack — Poker-Style UI + AI Players
- Full UI rebuilt: green felt table, shared card styles, seat ring layout
- 5 AI opponents: Vega, Oracle, Dread, Silk, Baron — each with stack, bet, card display
- AI plays basic strategy; async turn-by-turn animation
- Bet chip buttons (+10, +25, +100, +500, MAX)

### Roulette — Full Overhaul
- New canvas engine: gold rim, realistic fills, fret dividers, animated ball
- 13 bet types (was 8), interactive number grid, individual bet removal
- Spin history strip showing last 12 results

### Active Ticker Price Badge
- Selected ticker highlights with green border and live ± % badge

---

## v5.0 — Full Flesh

*Formerly `PATCH_NOTES_v5.md`*

### Server
- **Limit orders** — buy/sell limits with cash reservation, 24h expiry, auto-fill on tick
- **Short selling** — negative positions, 0.1% borrow fee per 30 minutes
- **Earnings events** — random company every 8 minutes, 6–20% swing, global broadcast
- **IPO events** — 90-minute windows, 15–35% discount, 100 share cap per player
- **Dividends** — 0.6% per 2h cycle for Finance, Insurance, Energy, Tech holders
- **Trade feed** — anonymised live feed of all fills
- **Daily quests** — 3 random quests per player per day, 10 quest types, XP rewards
- **Heatmap data** — `pct` and `sector` added to every tick broadcast
- **Portfolio snapshot** — `isShort`, `sectorName`, `shortExposure`, `sectorBreakdown`

### Client
- Heat tab — full market heatmap, click cell to switch chart
- Quests tab — progress bars, XP rewards, completion state
- Limit order panel — open orders list with cancel buttons
- Trade feed — live scroll below News, IPO buys in gold
- IPO banner — fixed overlay with countdown and buy input
- Earnings/dividend toasts
- Sound effects (Web Audio API) — off by default

---

## Patch G — Quest Removal + XP Overhaul

*Formerly `PATCH_NOTES_G.md`*

- Removed daily quest system entirely
- Replaced with pure activity-based XP rewarding trading skill and market participation
- 999-level scaling curve (floor(60 × 1.06^(n−1)) XP per level)

---

## Patch F — Casino Sanity Pass

*Formerly `PATCH_NOTES_F.md`*

- Chess timeout status message bug fixed
- Various casino UI stability fixes

---

## v3.0 / Patch E — SQLite Player Persistence

*Formerly `PATCH_NOTES_E.md`*

- Full SQLite persistence via Node.js built-in `node:sqlite`
- Player accounts, holdings, and market state survive server restarts
- Requires Node.js v22.5+

---

## v2.1 / Patches A–D — Foundation

*Formerly `PATCH_NOTES_A.md` through `PATCH_NOTES_D.md`*

**Patch A** — `/health` endpoint for status checks  
**Patch B** — Autosave + restore, read-only state endpoint  
**Patch C** — Player persistence via session tokens  
**Patch D** — Unique usernames enforced (case-insensitive)
