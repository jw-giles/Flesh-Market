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
    flesh:    { color:'#f0b454', sys:'FLESH STATION CORE' },
  },
  // Order here is the order they appear in the contacts list.
  reps: [
    {
      id:'mchallan', name:'Captain Trisha McHallan', faction:'coalition',
      portrait:'corpo2', role:'Coalition Liaison', enabled:false,
      presidentLock:true, presidentLine:"President, I have nothing for you at this time.",
      allDoneLine:"The cores did their work. Nothing new from me right now. Stay close.",
      blurb:"A Coalition officer posted to FLSH station. Our treaty requires one assigned to us at all times. Security is their business, and as the galaxy's government, their rules are the rules we follow. She runs hard, so stay polite if you can manage it.",
      ver:'v3.00',
      quests:[
        {
          id:'coalition_cold_open', title:'COLD OPEN',
          activeLine:"You're still running that crate to The Hollow. Finish the job, then we talk.",
          lines:[
            {from:'them', text:"Hey, {name}. You're late. Doesn't matter, it's slow today."},
            {from:'you',  text:"You called."},
            {from:'them', text:"New Anchor wants eyes on how the Syndicate runs product through The Hollow. We can't put a Coalition hull on that lane without it turning into an incident. You can."},
            {from:'them', text:"I'm giving you a crate of data cores. They're hacked. If some grey-market hand seizes them on the way, the cores wake up and burn whoever opened them. If they reach the buyer, they sit quiet and tell us who's buying."},
            {from:'them', text:"Either way New Anchor wins. Either way you're just a courier who never knew."},
            {from:'you',  text:"And if I'm the one holding them when it goes wrong?"},
            {from:'them', text:"Then you got robbed and the Coalition covers your loss. I don't lose couriers over cargo. Be discreet, run it straight, don't get clever with the route."},
          ],
          quest:{ id:'coalition_cold_open', title:'COLD OPEN',
            desc:'Smuggle Encrypted Data Cores from New Anchor to The Hollow.',
            reward:'Coalition standing. Slot spins. Cargo loss reimbursed.' }
        },
      ]
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
      portrait:'cyborg11', role:'Void Collective Tech Priest', enabled:true,
      blurb:"Another religious representative. I would call him a man, but he is closer to a machine now. The Void Collective locks away tech we need and likes to pick at our OPSEC. Since he arrived, the hacks have stopped, and he has been useful enough to justify the trade secrets we lost for the quiet. Try not to let him preach too long.",
      idleLine:"The Collective is listening. Speak.", // fallback only; the tree below plays instead
      ver:'v0.14',
      // quests:[] makes the branching lore tree play in the idle slot. The COMMUNION quest
      // below is parked (dormant data) until the Void questline ships; restore it by
      // removing this empty array.
      quests:[],
      lines:[
        {from:'them', text:"The Collective felt your pulse on the network. Steady. Wasteful. Human."},
        {from:'you',  text:"What do you want, priest?"},
        {from:'them', text:"To offer you less of that. Visit the Abaddon cluster and let the machine read you. One scan. It does not hurt for long."},
        {from:'them', text:"Flesh is a rough draft. We are the revision."},
      ],
      quest:{ id:'void_communion', title:'COMMUNION',
        desc:'Travel to a colony in the Abaddon cluster and dock.',
        reward:'Void standing +1, opens a hidden contact (placeholder).' },
      // Branching lore dialogue (GM-authored). Node shape mirrors Mr. Flesh's tree.
      // A faction-router node carries { branch:{ faction, match, other } } and silently
      // redirects on the caller's faction (used for the Void augment recognition).
      tree:{
        start:'open',
        nodes:{
          open:{ text:"Peace finds you on the network, traveler. The Collective is listening.", options:[
            { text:"I have some questions for you.", next:'root' },
            { text:"Any work for me?", next:'work' },
          ]},
          work:{ text:"Not yet. Return to me later.", options:[
            { text:"A few more questions, then.", next:'root' },
            { text:"Understood.", end:true },
          ]},
          root:{ text:"Not many do. What do you care to know?", options:[
            { text:"What is your organization's goal?", next:'goal1' },
            { text:"Why do you hack other factions?", next:'hack1' },
            { text:"What are your beliefs?", next:'belief1' },
            { text:"Do you like Mr. Flesh's mandate, or peace and stable pricing?", next:'flesh1' },
            { text:"Any work for me?", next:'work' },
            { text:"That is all.", end:true },
          ]},
          // ── A2: organization's goal ──
          goal1:{ text:"Have you been talking to the others about me?", options:[
            { text:"Yes.", next:'goal2' },
            { text:"No.", next:'goal2' },
          ]},
          goal2:{ text:"Well, regardless, they don't understand our mission. As soon as Man merged his divine intellect with the computation drives, all was seen. The code of reality became apparent to the everyman. We don't fight. We don't cause war. Our isolation has bred peace; the outsiders bring their conflict to us.", options:[
            { text:"So why do the others dislike you?", next:'goal3' },
          ]},
          goal3:{ text:"They don't have a choice but to hate what they can't control. Once a member joins our cause and receives the augment, their allegiance to peace is merged with another form of divine intellect. The augmentation is peace and love. It is God.", options:[
            { text:"The augment?", next:'goal_faction' },
          ]},
          // Faction router: the priest reads the caller and answers differently.
          goal_faction:{ branch:{ faction:'void', match:'goal_void', other:'goal_nonvoid' } },
          goal_void:{ text:"Ah, my apologies. I did not see the augment at first. Rejoice with me. Two scholars of Abraxas have made it into the company of Mr. Flesh.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"Peace to you, priest.", end:true },
          ]},
          goal_nonvoid:{ text:"You lack the augment. You will never truly understand peace, or love. No matter. Do you have any more questions?", options:[
            { text:"Yes, a few more.", next:'root' },
            { text:"No, that is all.", end:true },
          ]},
          // ── A3: hacking other factions ──
          hack1:{ text:"Security. Notice how they avoid our hacks, yet never state what those hacks are doing. We need surveillance.", options:[
            { text:"You can't really believe the other factions would have no issue with being spied on?", next:'hack2' },
          ]},
          hack2:{ text:"I understand. But do you understand? The others would devour us like rabid dogs the moment we operate under their concepts. Imagine it. We are on the outer planets. They could never jump to us again, and every one of our operations would remain a mystery to them. But they will not allow it. They force us to partake in the collective rule of corporations and their ill councils.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // ── A4: beliefs ──
          belief1:{ text:"We believe in unity. Human history is drenched in the blood of conflict. Endless fighting, endless atrocity. If only we all saw the universe for what it is. A wealth of resources, of consciousness, of beauty, and of love.", options:[
            { text:"You worship Abraxas. What is that?", next:'belief2' },
          ]},
          belief2:{ text:"Abraxas is an old idea, from the age of occultist trifling. Yet within all that esoteric rambling sat an empty truth. A reality. Abraxas is the idea that everything beyond what we hold now is nothingness. To love a thing, you must first embrace the lack of it. To worship the void is to understand the value of the here and now. The augment teaches this. You should consider it.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // ── A5: Mr. Flesh's mandate ──
          flesh1:{ text:"He knows, and he agrees with us, even if he will not say so openly. His acts of peace are far too hands off, far too moderate for our liking. But what do we know. We are not Mr. Flesh.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
        }
      }
    },
    {
      // Employer / story frame. Portrait reuses the Preserved Brain item art via
      // the client item catalog (item:<id> -> ITEM_CATALOG_CLIENT[id].img data URI).
      id:'mrflesh', name:'Mr. Flesh', faction:'flesh',
      portrait:'item:jarred_brain', role:'The Proprietor', enabled:true,
      blurb:"The proprietor of FLSH. He signs the checks. Mind the work and he will not mind you.",
      idleLine:"Get back to work...", // fallback only; the tree below plays instead
      ver:'v0.12',
      quests:[],
      // Branching lore dialogue (GM-authored). Node shape:
      //   id:{ text:'Mr. Flesh line', options:[ { text:'player line', next:'nodeId' }
      //        | { text:'player line', end:true } ] }
      // Option order = on-screen order (keys 1-9). 'end:true' hangs up after the line.
      tree:{
        start:'open',
        nodes:{
          open:{ text:"Make it quick.", options:[
            { text:"I have some questions", next:'root' },
            { text:"Do you have any work?", next:'work' },
          ]},
          // 'Not now' is a stub: replace this node with the questline entry once it ships.
          work:{ text:"Not now, but do you need anything?", options:[
            { text:"A few things, yeah.", next:'open' },
            { text:"No, I'll get back to work.", end:true },
          ]},
          root:{ text:"Yeah?", options:[
            { text:"What can you tell me about the coalition?", next:'co1' },
            { text:"The Void Syndicate, who are they?", next:'vo1' },
            { text:"You seem friendlier with the Merchants Guild than other groups, why is that?", next:'gu1' },
            { text:"How come the Syndicate are so hostile?", next:'sy1' },
            { text:"Were you ever human, or has it always been the jar?", next:'hu1' },
            { text:"If everyone knows the game is rigged, why does anyone keep playing?", next:'pl1' },
            { text:"Who decides what a Social Credit is actually worth?", next:'sc1' },
            { text:"What happens to people who can't cover their debts here?", next:'db1' },
            { text:"Why does a stock exchange need a casino floor?", next:'ca1' },
          ]},
          // ── Coalition ──
          co1:{ text:"Coalition is a ruling council made up of the remaining corporations from the fourteenth corporate war. The war was so bloody it caused a pact between all known planets. Coalition was allowed by myself to take up the mantle as our front facing government sixty years ago. The last war, the fifteenth, came twenty-nine years ago. Coalition won it and has held the ruling seat ever since, right up into the modern day. New Anchor is their main planet, but they operate on all planets officially.", options:[
            { text:"Coalition is the ruling government? What deal did you make for that level of power?", next:'co2' },
          ]},
          co2:{ text:"Limbosis is a former weapons lab, they built a giant fucking laser to aim at Abaddon's binary black holes. I wanted this weapon installed on site. So now they rule, and I have my weapon. This was a long time ago so don't expect much detail from me. Anything else you need?", options:[
            { text:"Yes", next:'root' },
            { text:"No", end:true },
          ]},
          // ── Void ──
          vo1:{ text:"Void Syndicate are a cult of transhumanists; they want to merge with machines. Well, I suppose they have merged with machines. It gets really fucking annoying though, they can hack shit with their minds. Imagine the technical infrastructure to defend against psychic-computation-cultists.", options:[
            { text:"Well, not to be rude but aren't you the same? You are a brain in a jar.", next:'vo2' },
          ]},
          vo2:{ text:"Correct, but if I were to die the system would collapse, it insists upon my prolonged survival. My brain is connected to this entire system and network, I can remotely control any robot body within range of null relays.", options:[
            { text:"So you keep the Void Priest here for what reason? To maintain more secret deals?", next:'vo3' },
          ]},
          vo3:{ text:"Bingo! And don't pretend you wouldn't do the same.", options:[
            { text:"Right...guess you're right.", next:'vo4' },
            { text:"Right...id guess again on that assumption.", next:'vo4' },
          ]},
          vo4:{ text:"Any more questions?", options:[
            { text:"Yes", next:'root' },
            { text:"No", end:true },
          ]},
          // ── Merchants Guild ──
          gu1:{ text:"Its because I run that faction, its not well known but I'm their sponsor. How do you think they afford 100 billion credit sales, or maintain dominance in regards to trade policy? Id be more public about it but that would make the Coalitions council mad...very mad. Stability is my mandate, remember this.", options:[
            { text:"You think you'd lose control if the other factions knew your dealings?", next:'gu2' },
          ]},
          gu2:{ text:"Unlikely, they are all bought in too deep now and this base is untouchable. Id get murdered the moment I left the station given I had a body. But everyone is in too deep now, they'd rather not flip the board over if they think checkmate is near.", options:[
            { text:"You think they think you are beatable?", next:'gu3' },
          ]},
          gu3:{ text:"Yes, they think they stand a chance. I have backup plans to their backup plans. My eyes and ears may not exist here and now, but they extend to all aspects of all things. My goal is peace mind you; people never change unfortunately.", options:[
            { text:"Why not recruit me into the Merchants Guild?", next:'gu4' },
          ]},
          gu4:{ text:"I would, the cost is listed. Only premium players in our game of musical chairs are worthy of my time in that regard. Join if you have the drive for such status.", options:[
            { text:"Alright, well see you later then.", end:true },
            { text:"Alright, few more questions if you don't mind?", next:'root' },
          ]},
          // ── Syndicate ──
          sy1:{ text:"Syndicate are criminals in the truest sense, but I don't blame them. No matter how hard I try to order life in a meaningful way there's just too many people across too much space. Long ago Humans were confined to borders of a single astral body in the Sol system. We fought in the exact same ways, using the exact same weapons. Polluted our home then ran away as soon as the molestation was completed. Its a rotted corpse now, you cant even find Sol on a map.", options:[
            { text:"Sol, that's a pretty name. Do you have any information on Sol?", next:'sy2' },
          ]},
          sy2:{ text:"Yeah, but its better left in the vault. Maybe one day ill show you the truth of our origin. Secrets cost social credits, even if you are a good employee.", options:[
            { text:"So you keep the criminal here for fun or just to torture him?", next:'sy3' },
          ]},
          sy3:{ text:"Nothing I do is for fun, but yeah sort of. He is a bit slow in the head in a good way, we pay him more than his bosses for info and in exchange he gets to come and go as he pleases. Don't worry about him betraying us, I installed a recording device and tracker into his spine. If he talks about anything, tells anyone, writes anything down, thinks about betrayal. Ill trigger the tactical nuclear warhead sewn into the core of the implant. Trust that he enjoys the pay and his life. Anything else?", options:[
            { text:"No, thats all for now", end:true },
            { text:"Yes, have some more questions.", next:'root' },
          ]},
          // ── Single-answer lore questions ──
          hu1:{ text:"What came first, the chicken or the egg? Of course I was Human before, what kind of question is that.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That's all for now.", end:true },
          ]},
          pl1:{ text:"This \"game\" is people's lives, your social credits afford freedoms, food, security, and health. You have no choice but to \"play.\"", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That's all for now.", end:true },
          ]},
          sc1:{ text:"I do, and everyone else does. Money has always been about perception regardless. The one hundred trillion sitting in Capital House FLSH keeps the pricing stable. A store of wealth and time you could think of it as.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That's all for now.", end:true },
          ]},
          db1:{ text:"Depends, what planet are they on? This isn't my concern you see, governance of single planets doesn't concern me; my mandate is stable pricing.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That's all for now.", end:true },
          ]},
          ca1:{ text:"Why not, 99% of gamblers quit just before hitting big. You should try the wheel sometime, you look lucky.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That's all for now.", end:true },
          ]},
        }
      }
    },
  ],
};
