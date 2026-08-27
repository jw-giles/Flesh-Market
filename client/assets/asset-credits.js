// ═══════════════════════════════════════════════════════════════════════════
// asset-credits.js - everyone whose work is in this game.
//
// ONE TABLE, NOT MARKUP. Every credit is a row below and the panel is generated
// from it, so adding an asset is one object and cannot half-land: there is no
// second place to forget. tools/reach-check.mjs asserts this table and
// docs/CREDITS.md name the same people, because the two are maintained by hand
// and would otherwise drift in the direction of the client having fewer names.
//
// THIS IS AN OBLIGATION, NOT A NICETY, for at least one entry: the creature
// pack's licence requires attribution to Will Tice in the credits, for USE,
// independently of anything to do with redistribution. It is also just the right
// thing, which is why the CC0 entry is here too and marked as not required.
//
// Loaded eagerly and rendered from a literal. No fetch, no lazy load: the one
// surface on this page that must not be able to fail to appear.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* who   - the name to credit, exactly as the licence or the artist asks
     what  - what of theirs is in the game, in plain language
     url   - where to find them. Omitted rather than guessed.
     note  - anything a reader should know about the terms
     req   - true when a licence REQUIRES this credit, false when it is offered */
  var CREDITS = [
    {
      group: 'Art',
      who: 'Will Tice / unTied Games',
      what: "Khai'sultull creatures - crawlers, flies, hopclops, grubs, eggs and their rounds",
      url: 'https://untiedgames.com',
      note: 'Super Pixel Alien Monster Pack 1',
      req: true,
    },
    {
      group: 'Art',
      who: 'AL_Core',
      what: 'Coalition and Jade Circuit infantry - assault, shield trooper, engineer and turret',
      note: 'Sci-Fi Animated Army Squad',
      req: false,
    },
    {
      group: 'Art',
      who: '38491748',
      what: 'The distant skyline towers and street vehicles',
      url: 'https://38491748.itch.io/3d-low-poly-modern-city-assets',
      note: '3D low-poly modern city assets.',
      req: false,
    },
    {
      group: 'Art',
      who: 'Voloshka',
      what: 'The modular city kit - walls, windows, doors, roofs, roads, pavements and street props',
      url: 'https://viravoloshyn.itch.io/low-poly-city-asset-pack',
      note: 'Industrial Low Poly City. Free edition, explicitly free for commercial use.',
      req: false,
    },
    {
      group: 'Art',
      who: 'papptimus',
      what: 'Cyber City building facades, their emissive maps and the roof sheets',
      url: 'https://papptimus.itch.io/cyber-city',
      note: 'Cyber City - CC BY 4.0. Attribution is the licence\u2019s one condition, so this row is required.',
      req: true,
    },
    {
      group: 'Art',
      who: 'Aralepixel',
      what: 'The Turquoise Hound battle tank',
      note: 'Turquoise Hound animated pixel art tank',
      req: false,
    },
    {
      group: 'Art',
      who: 'NickyBHobbying',
      what: 'Merchant hulls, scoundrel corvettes and the Verbattan Defense Fleet',
      note: 'Merchants and Scoundrels; Verbattan Shipyards Fleet',
      req: false,
    },
    {
      group: 'Art',
      who: 'Helianthus Games',
      what: 'The spinning planets - every world on the galaxy map and in system '
          + 'view, and the source every battlefield takes its colour from. '
          + 'Also the black hole, the Flesh Station megastructure, '
          + 'the Jade Circuit dyson and quasar bodies, '
          + 'the suns, and the 16px system-view icons',
      url: 'https://helianthus-games.itch.io',
      note: '25 Spinning Planets',
      req: false,
    },
    {
      group: 'Art',
      who: 'CodeSpree',
      what: 'The 64px seamless tile set every battlefield ground texture is derived from',
      note: '114 Free Seamless 64px RPG Tiles',
      req: false,
    },
    {
      group: 'Art',
      who: 'RGS_Dev',
      what: 'Low-poly terrain: rocks, crags and cliff meshes on every battlefield',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      note: 'Nature Pack Low Poly, CC0 1.0. No attribution required; credited anyway.',
      req: false,
    },
    {
      group: 'Art',
      who: 'gatlingart',
      what: 'Two hundred commissioned portrait sketches, human and android',
      req: false,
    },
    {
      group: 'Art',
      who: 'Webtential',
      what: 'Science fiction character portraits',
      note: 'Science Fiction Pixel Art Portraits 1',
      req: false,
    },
    {
      group: 'Art',
      who: 'subotai',
      what: 'Cyberpunk and fantasy character portraits',
      note: '25 and 60 Cyberpunk portraits; A dwarfload of portraits; '
          + "Masters of the dark lord's armies",
      req: false,
    },
    {
      group: 'Art',
      who: 'Hanker',
      what: 'Corpo-Cards: card faces, packs, chests, foil animation and deck-builder UI',
      note: 'Pixelart Poker Cards; Deck Building card Template; UI Pack for a '
          + 'DeckBuilding Game; Chest Asset Pack; Free Card Packs; Rainbow Shine '
          + 'Card Animation',
      req: false,
    },
    {
      group: 'Art',
      who: 'almostApixel',
      what: 'Exploration vessel art',
      note: 'Starlancer Solar Dominion Exploration Vessel',
      req: false,
    },
    {
      group: 'Art',
      who: 'Free Game Assets (GUI, Sprite, Tilesets)',
      what: 'Every commodity icon in the game - the tech, medical and '
          + 'agricultural goods traded on all three markets - and the clothing '
          + 'and equipment icons: necklaces, hats, tops, trousers, shoes and '
          + 'vehicles. Also the weapon, ammo and resource icons',
      url: 'https://itch.io/profile/free-game-assets',
      note: 'Free Cyberpunk Resource Pixel Art 32x32 Icons; Medicine and '
          + 'Thematic Things Pixel Art 32x32 Icon Pack; Vegetation Icons 32x32 '
          + 'Pixel Art; Cyberpunk Weapon and Ammo Pixel Icons',
      req: true,
    },
    {
      group: 'Art',
      who: 'heondu',
      what: 'The animated book',
      note: 'Pixel Book Animation',
      req: false,
    },
    {
      group: 'Art',
      who: 'Poly Haven',
      what: 'Reference textures',
      url: 'https://polyhaven.com',
      note: 'CC0',
      req: false,
    },
    {
      group: 'Type',
      who: 'AntonXCM',
      what: 'Anti Kvak, multilingual display face',
      req: false,
    },
  ];


  /* Art that is in the game and whose author is not recorded. LISTED, NOT
     OMITTED. A credits panel that silently leaves people out reads as complete,
     and a reader has no way to tell the difference between "nobody else
     contributed" and "we lost track". Saying so is also the only way anyone
     affected finds out we are looking for them. */
  /* EMPTY, AND IT STAYS IN THE CODE. Every asset in the game has an author
     recorded against it now. The list is kept rather than deleted because the
     next pack that arrives without a name needs somewhere to go, and a section
     that has to be rebuilt from scratch is a section that gets skipped. The
     panel hides the heading when this is empty. */
  /* AND EMPTY AGAIN, BECAUSE THE ANSWER CAME BACK. The previous note here
     reasoned that the black hole, the megastructure, the Circuit's dyson and
     quasar bodies, the suns and the 16px icons could not be assumed to be
     Helianthus just because they share a directory with the planets - and it
     was right to refuse the assumption. They ARE Helianthus. Jacob identified
     them against his own itch library, which is the source of every other
     attribution in this table, so they move into that credit rather than being
     assumed into it.

     The list stays in the code. The next pack that arrives without a name
     needs somewhere to go, and a section that has to be rebuilt from scratch
     is a section that gets skipped. Empty is a state, not a requirement: the
     panel hides the heading when there is nothing in it. */
  var UNKNOWN = [];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function rowHtml(c) {
    var link = c.url
      ? ' <a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(
          c.url.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a>'
      : '';
    var note = c.note ? '<br><span class="ac-what">' + esc(c.note) + '</span>' : '';
    var req = c.req
      ? '<br><span class="ac-what" style="color:#a7946a">Credit required by licence.</span>'
      : '';
    return '<div class="ac-row"><span class="ac-who">' + esc(c.who) + '</span>' + link
      + '<br><span class="ac-what">' + esc(c.what) + '</span>' + note + req + '</div>';
  }

  function build() {
    var groups = {};
    CREDITS.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });

    var html = '<button id="assetCreditsClose" aria-label="Close">CLOSE</button>'
      + '<h3>ASSET CREDITS</h3>'
      + '<div class="ac-what">Everyone whose work is in FleshMarket.</div>';

    Object.keys(groups).forEach(function (g) {
      html += '<h4>' + esc(g).toUpperCase() + '</h4>';
      groups[g].forEach(function (c) { html += rowHtml(c); });
    });

    if (UNKNOWN.length) {
      html += '<h4>NOT YET ATTRIBUTED</h4>'
        + '<div class="ac-what">Some art here has no author recorded against it:</div>'
        + '<div class="ac-row"><span class="ac-what">'
        + UNKNOWN.map(function (u) { return '&bull; ' + esc(u); }).join('<br>')
        + '</span></div>'
        + '<div class="ac-note">If any of this is yours, or you know whose it is, get in '
        + 'touch and you will be credited properly here. Nothing is used here with the '
        + 'intention of going uncredited.</div>';
    }

    html += '<h4>GAME</h4>'
      + '<div class="ac-row"><span class="ac-who">JW Giles</span>'
      + '<br><span class="ac-what">Design, code, writing, and GM of the living '
      + 'narrative.</span></div>';

    return html;
  }

  var scrim = null;

  function ensure() {
    if (scrim) return scrim;
    scrim = document.createElement('div');
    scrim.id = 'assetCreditsScrim';
    var box = document.createElement('div');
    box.id = 'assetCreditsBox';
    box.innerHTML = build();
    scrim.appendChild(box);
    /* Click the scrim to close, but NOT a click that started inside the box: a
       drag to select text ends its mouseup on the scrim and would dismiss the
       panel mid-selection, which on a list of names people want to copy is the
       one interaction that matters. */
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    box.querySelector('#assetCreditsClose').addEventListener('click', close);
    document.body.appendChild(scrim);
    return scrim;
  }

  function close() { if (scrim) scrim.classList.remove('open'); }

  function open() { ensure().classList.add('open'); }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  window.openAssetCredits = open;
  window.closeAssetCredits = close;
  // Exposed so the check can read the roster without a browser, and so a future
  // about-page or credits crawl has one source rather than parsing markup.
  window.ASSET_CREDITS = CREDITS;
})();
