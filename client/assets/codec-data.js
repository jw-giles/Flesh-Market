// ═══════════════════════════════════════════════════════════════════════════════
// FM_CODEC — faction rep contacts + conversations (GM-authored DATA, layer 2).
// The codec engine (codec.js) plays these; it knows nothing about quests.
// Player-visible text: NO em dashes. Portraits are filenames in assets/portraits/.
// Rep portraits assigned from the selectable set; swap freely.
// ═══════════════════════════════════════════════════════════════════════════════
window.FM_CODEC = {
  factions: {
    coalition:{ color:'#4ecdc4', sys:'COALITION RELAY' },
    syndicate:{ color:'#e74c3c', sys:'SYNDICATE DARKLINE' },
    void:     { color:'#9b59b6', sys:'VOID COLLECTIVE NODE' },
    guild:    { color:'#2ecc71', sys:'GUILD LEDGERNET' },
  },
  // Order here is the order they appear in the contacts list.
  reps: [
    {
      id:'mchallan', name:'Captain Trisha McHallan', faction:'coalition',
      portrait:'corpo2', role:'Coalition Liaison',
      blurb:"A Coalition officer posted to FLSH station. Our treaty requires one assigned to us at all times. Security is their business, and as the galaxy's government, their rules are the rules we follow. She runs hard, so stay polite if you can manage it.",
      ver:'v2.01',
      lines:[
        {from:'them', text:"Trader. The Coalition has been reading your volume on the Aurora lanes."},
        {from:'you',  text:"And?"},
        {from:'them', text:"And we would rather you ran cargo for us than against us. Move medical stock to The Escrow before the cycle turns. Quiet, clean, on time."},
        {from:'them', text:"Do that and the Coalition counts you a friend. We are short on those."},
      ],
      quest:{ id:'coalition_cold_chain', title:'COLD CHAIN',
        desc:'Ship a load of medical cargo to The Escrow within one market cycle.',
        reward:'Coalition standing +1.' }
    },
    {
      id:'rahtan', name:'Rahtan', faction:'guild',
      portrait:'corpo7', role:'Merchant Guild Factor',
      blurb:"A religious representative of the Merchant Guild, posted here under our lane shipping agreements and the debts that come with them. He preaches, but the Guild holds our contracts, so we listen. Bring him S'weet wine when you get the chance.",
      ver:'v3.40',
      lines:[
        {from:'them', text:"You answer fast. The Guild appreciates a punctual debtor."},
        {from:'you',  text:"I am not in your debt."},
        {from:'them', text:"Not yet. Run a smuggling route through three colonies without losing the load and we will open a line for you. Consider it a credit check."},
        {from:'them', text:"The Guild remembers who delivers. It remembers the others longer."},
      ],
      quest:{ id:'guild_credit_check', title:'CREDIT CHECK',
        desc:'Complete a three hop smuggling route without an interception.',
        reward:'Guild standing +1, reduced wire fees (placeholder).' }
    },
    {
      id:'jaquet', name:'Jaquet', faction:'syndicate',
      portrait:'hacker1', role:'Syndicate Broker',
      blurb:"The Coalition hates having him here, but without him its read on Syndicate operations goes dark. He is a mole, a rat, a criminal. Pay a shady man well enough and he turns into an indispensable asset. Keep him on a need-to-know basis, for our sake.",
      ver:'v1.88',
      lines:[
        {from:'them', text:"You picked up. The Syndicate does not dial twice."},
        {from:'you',  text:"Talk."},
        {from:'them', text:"FLSH is sitting fat and proud. Open a short and hold it through the reset. We want the open to bleed before the Guild audit posts."},
        {from:'them', text:"The profit is yours. The chaos is ours. Fair split."},
      ],
      quest:{ id:'syndicate_bear_raid', title:'BEAR RAID',
        desc:'Hold an open FLSH short position through the next end of day reset.',
        reward:'Syndicate standing +1, Bear Betrayer title (placeholder).' }
    },
    {
      id:'xen', name:'Father Xen', faction:'void',
      portrait:'cyborg11', role:'Void Collective Tech Priest',
      blurb:"Another religious representative. I would call him a man, but he is closer to a machine now. The Void Collective locks away tech we need and likes to pick at our OPSEC. Since he arrived, the hacks have stopped, and he has been useful enough to justify the trade secrets we lost for the quiet. Try not to let him preach too long.",
      ver:'v0.13',
      lines:[
        {from:'them', text:"The Collective felt your pulse on the network. Steady. Wasteful. Human."},
        {from:'you',  text:"What do you want, priest?"},
        {from:'them', text:"To offer you less of that. Visit the Abaddon cluster and let the machine read you. One scan. It does not hurt for long."},
        {from:'them', text:"Flesh is a rough draft. We are the revision."},
      ],
      quest:{ id:'void_communion', title:'COMMUNION',
        desc:'Travel to a colony in the Abaddon cluster and dock.',
        reward:'Void standing +1, opens a hidden contact (placeholder).' }
    },
  ],
};
