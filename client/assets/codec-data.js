// ═══════════════════════════════════════════════════════════════════════════════
// FM_CODEC - faction rep contacts + conversations (GM-authored DATA, layer 2).
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
      portrait:'corpo2', role:'Coalition Liaison', enabled:true,
      // presidentLock short-circuits BEFORE the tree, so it is off while the tree is
      // the only content. Restore it (with a president router node) when COLD OPEN ships.
      presidentLine:"President, I have nothing for you at this time.",
      allDoneLine:"The cores did their work. Nothing new from me right now. Stay close.",
      blurb:"A Coalition officer posted to FLSH station. Our treaty requires one assigned to us at all times. Security is their business, and as the galaxy's government, their rules are the rules we follow. She runs hard, so stay polite if you can manage it.",
      ver:'v3.00',
      // Tree plays in the idle slot; COLD OPEN is parked (dormant data) until the
      // Coalition questline ships. Restore by renaming parkedQuests back to quests.
      quests:[],
      parkedQuests:[
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
      ],
      // Branching lore dialogue (GM-authored). Node shape mirrors Mr. Flesh's tree.
      // Faction-router node on the proprietor question: Coalition members get the
      // candid answer, everyone else gets the official position.
      tree:{
        start:'open',
        nodes:{
          open:{ text:"McHallan. Line's clean on my end. What do you need, {name}?", options:[
            { text:"I have some questions.", next:'root' },
            { text:"Any work for me?", next:'work' },
          ]},
          work:{ text:"Nothing on the board for you. New Anchor's been sitting on three requisitions since last month, so don't hold your breath.", options:[
            { text:"Questions, then.", next:'root' },
            { text:"Copy that.", end:true },
          ]},
          root:{ text:"Go ahead.", options:[
            { text:"What is the Coalition, exactly?", next:'co1' },
            { text:"Why does the Coalition keep an officer on this station?", next:'post1' },
            { text:"There is a Syndicate broker walking these decks. How is that allowed?", next:'jaq1' },
            { text:"The fifteenth war was twenty nine years ago. Is there a sixteenth?", next:'war1' },
            { text:"What happened at Limbosis?", next:'lim1' },
            { text:"What do you make of Mr. Flesh?", next:'flesh1' },
            { text:"Any work for me?", next:'work' },
            { text:"That is all.", end:true },
          ]},
          // -- Coalition --
          co1:{ text:"Nine corporations that still had a board when the fourteenth ended. They pushed some tables together and called it a council. That's the founding story. That's all of it.", options:[
            { text:"That is a government by attrition.", next:'co2' },
          ]},
          co2:{ text:"Sure. Won the fifteenth, kept the chair. Somebody wins the sixteenth, they get the chair. Everything else we publish is commentary.", options:[
            { text:"Do the colonies actually accept that?", next:'co3' },
          ]},
          co3:{ text:"They accept the lanes. They accept arbitration because the other way of settling it involves guns. Whether they'd accept us if you asked them straight, I don't know. Nobody's asked and I'm not volunteering to be first.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Why a liaison --
          post1:{ text:"Treaty. One Coalition officer aboard at all times, ever since the station got recognised as neutral ground.", options:[
            { text:"Neutral ground with a permanent government presence.", next:'post2' },
          ]},
          post2:{ text:"Yeah. I know. Write that one down, it's the most useful thing you'll hear today. Officially I'm here to guarantee the treaty. What actually happened is New Anchor can't sleep unless somebody with a rank can see the floor.", options:[
            { text:"So you're a watchman.", next:'post3' },
          ]},
          post3:{ text:"Watchman implies I'd stop something. Mostly I just have to have been present. If this place ever does something the council can't survive, the inquiry asks what the liaison saw, then it asks why she didn't stop it. I'd like both answers short.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Jaquet --
          jaq1:{ text:"Jaquet. Yeah. I file on him every quarter and it gets denied every quarter. Honestly I'd be put out if it ever went through. I'd have to find a new hobby.", options:[
            { text:"Then why keep filing?", next:'jaq2' },
          ]},
          jaq2:{ text:"Because the file has to exist. And because he's the only clean read anybody has on Syndicate movement. We don't own an asset that deep. FLSH does. So we buy it secondhand and write cooperation on the line item.", options:[
            { text:"Would you arrest him if you could?", next:'jaq3' },
          ]},
          jaq3:{ text:"In a heartbeat, and he knows it. He waves at me in the corridor. I wave back. My predecessor thought that was disgraceful. My predecessor lasted eleven months.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- The sixteenth war --
          war1:{ text:"You did the subtraction. Most people don't.", options:[
            { text:"Fourteen, fifteen, about thirty years apart. It is late.", next:'war2' },
          ]},
          war2:{ text:"It's an average, not a timetable. Analysts who treat it like a timetable end up on ice moons, I've signed two of those transfers myself. But yeah. We're inside the window. Everybody knows we're inside the window, and that alone is moving more money right now than anything I could put in a threat assessment.", options:[
            { text:"So who starts it?", next:'war3' },
          ]},
          war3:{ text:"Nobody. That's the part the histories get wrong. Somebody misses a payment. Somebody else grabs cargo to cover the hole. An escort fires on the grab. Three lanes are dead before a council votes on anything, and then we write it up afterwards like it was a decision somebody made.", options:[
            { text:"Then what stops it?", next:'war4' },
          ]},
          war4:{ text:"Liquidity. I know how that sounds coming from a uniform. But if everyone can cover their positions then nobody has to take anything by force. Took me about six years aboard to stop rolling my eyes at the proprietor's mandate. Bear that in mind next time you decide to break something on my floor.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Limbosis --
          lim1:{ text:"Limbosis. Weapons lab. Stopped being a lab the day we agreed to build what was on the drawings.", options:[
            { text:"A laser aimed at the binary black holes at Abaddon.", next:'lim2' },
          ]},
          lim2:{ text:"You've been talking to the proprietor. Yeah, that was the price of the seat. Council delivered the instrument, he delivered the mandate. Neither half is in any record you can pull.", options:[
            { text:"What is it for?", next:'lim3' },
          ]},
          lim3:{ text:"Above my clearance and I've made my peace with it. I'll tell you what I've actually seen, which is a firing corridor kept to spec for sixty years and never once test fired. You don't service a thing that long out of sentiment.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Mr. Flesh (faction router) --
          flesh1:{ text:"Carefully.", options:[
            { text:"That is not an answer.", next:'flesh2' },
          ]},
          flesh2:{ text:"It's most of one. He predates the council. He allowed the council. Sixty years back a brain in a tank decided we could be the face of human government, and every rank I hold traces to that. I work for a government that exists because somebody let it.", options:[
            { text:"Does that bother you?", next:'flesh_faction' },
          ]},
          flesh_faction:{ branch:{ faction:'coalition', match:'flesh_co', other:'flesh_other' } },
          flesh_co:{ text:"Same colours, so I'll say it once. Yeah. Every day. The council can dissolve a corporation, sanction a colony, end a war. It can't open a door on this station that he wants shut. Keep that between us and keep your filings clean.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"Understood, Captain.", end:true },
          ]},
          flesh_other:{ text:"You're not Coalition, so you get the position. The proprietor is a valued partner of the council, the arrangement has held sixty years, and it continues to serve the stability of all member colonies. Next.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
        }
      }
    },
    {
      id:'rahtan', name:'Rahtan', faction:'guild',
      portrait:'corpo7', role:'Merchant Guild Factor', enabled:true,
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
        reward:'Guild standing +1, reduced wire fees (placeholder).' },
      // quests:[] parks CREDIT CHECK (dormant data) and hands the idle slot to the
      // tree. Restore the questline by removing this empty array.
      quests:[],
      tree:{
        start:'open',
        nodes:{
          open:{ text:"Ah, {name}. Sit, sit. You've caught me between manifests and I would much rather talk than count. What is it?", options:[
            { text:"I have some questions.", next:'root' },
            { text:"Any work for me?", next:'work' },
          ]},
          work:{ text:"Nothing on the lane today worth your hull. Come back when the ledger opens up and I'll find you something. Bring the wine either way.", options:[
            { text:"A few questions, then.", next:'root' },
            { text:"Balance keep you.", end:true },
          ]},
          root:{ text:"Ask. The Guild has never charged for an answer, only for what you do with it.", options:[
            { text:"What is the Merchants Guild?", next:'gu1' },
            { text:"Why can no colony simply trade around you?", next:'lane1' },
            { text:"You are called a religious representative. What do you worship?", next:'faith1' },
            { text:"What does the Guild believe about debt?", next:'debt1' },
            { text:"Who owns the Guild?", next:'own1' },
            { text:"I hear you drink S'weet wine.", next:'wine1' },
            { text:"Any work for me?", next:'work' },
            { text:"That is all.", end:true },
          ]},
          // -- What the Guild is --
          gu1:{ text:"A clearing house that outlived the men who built it. Look. Every colony you can name hates two others, and every one of them still wants grain off the people they hate. Fuel. Medicine. Parts. Somebody has to stand in the middle and get hated evenly, and we've been very good at that for a very long time.", options:[
            { text:"And that is you.", next:'gu2' },
          ]},
          gu2:{ text:"That's us. We don't keep a fleet worth fearing, never needed one. We hold the arbitration, the escrow and the record. Break a Guild contract and no lane prices you again. You can shoot a man once. A closed ledger keeps working.", options:[
            { text:"Has nobody ever tried to break you?", next:'gu3' },
          ]},
          gu3:{ text:"Constantly. It runs the same every time. They form a compact, they trade among friends, and then somebody needs a drug that only three worlds make. Second year they're back at the counter paying reinstatement. We keep that fee ugly so the lesson stays where we put it.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- The lane --
          lane1:{ text:"They can. For a while. A lane isn't a road, understand, nobody owns the vacuum. What we own is the agreement about who gets paid when the cargo lands. Move goods without us all you like. Getting paid twice is the trick.", options:[
            { text:"Smugglers seem to manage.", next:'lane2' },
          ]},
          lane2:{ text:"Smugglers are ours. Not on the roll, but ours. We price interception into every honest freight rate, so the risk you're carrying out there is the margin we're collecting in here. No judgement in that, I mean it. The lane wants both kinds of hand. I've stamped paper for men who'd have been shot on New Anchor and I slept fine.", options:[
            { text:"That is convenient for you.", next:'lane3' },
          ]},
          lane3:{ text:"It is, isn't it. That part came later, as a gift.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Faith --
          faith1:{ text:"The Balance. Not a god with a face, before you ask. Everyone asks.", options:[
            { text:"Then what is it?", next:'faith2' },
          ]},
          faith2:{ text:"A condition. Every account closes. What's owed gets answered, in coin or in kind or in the ruin of the man who owed it, and nothing is ever forgiven, it only moves. Your people call that accounting because the word is smaller and you can sleep after saying it.", options:[
            { text:"That is a bleak religion.", next:'faith3' },
          ]},
          faith3:{ text:"You think so? There's a line in the third book of the Reckoning, on the closing of accounts. Nobody arrives at the scale carrying a surprise. That's the comfort, and it's a real one. Your faiths promise the ledger gets torn up at the end. Ours promises it gets read out loud. I know which one I'd rather have time to prepare for.", options:[
            { text:"What about a man who dies owing?", next:'faith4' },
          ]},
          faith4:{ text:"Then it seats itself on whoever ate well off him. Widow, partner, colony, station. People hear that and decide we're cruel. We're not doing anything to him, he's dead. We're declining to pretend the value went up in smoke because the man did.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Debt --
          debt1:{ text:"Best relationship two men can have, and I mean that plainly. Friendship has no price on it, so you never know what you're holding. A debt tells you the amount, the date, and what happens if you miss. Where else in your life do you get that?", options:[
            { text:"It also ruins people.", next:'debt2' },
          ]},
          debt2:{ text:"So does weather. Nobody sermonises at weather, they build for it. A debt only ruins the man who arranged his life pretending it would never come due, and we have never once collected a surprise.", options:[
            { text:"And when he cannot pay?", next:'debt3' },
          ]},
          debt3:{ text:"Then he pays in time instead of coin. Labour. Lane hours. A seat on his colony board. His name on our roll for three generations, which sounds worse than it is, half our chapter came in that way. There's always a price that clears. Men are frightened of insolvency because nobody ever sat down and showed them the rate.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Ownership (faction router) --
          own1:{ text:"The Guild owns the Guild. Factors hold seats, factors answer to the chapter, the chapter answers to the lane.", options:[
            { text:"That is a circle, not an answer.", next:'own2' },
          ]},
          own2:{ text:"You noticed. Good, I like you. Here's what a factor is allowed to say. There is capital behind us that has never appeared on a chapter roll and has never once asked for a vote. It asks for stability. It gets stability. Forty years I've held this seat and it has not put a single request to me I'd have turned down.", options:[
            { text:"You are describing a silent partner.", next:'own_faction' },
          ]},
          own_faction:{ branch:{ faction:'guild', match:'own_guild', other:'own_other' } },
          own_guild:{ text:"You wear the mark, so one more step and not a second one. When you're stood on this station wondering why the proprietor has never asked to see our books, don't read that as a man who isn't interested. Ask who'd be auditing whom. Then don't ask it out loud again.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"Balance keep you, factor.", end:true },
          ]},
          own_other:{ text:"I'm describing a factor who likes his posting. Have you eaten? No. Of course not. Ask me something else and let me get you a plate.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Wine --
          wine1:{ text:"Somebody's been talking. Yes. S'weet, off the low terraces, and the vintage matters a great deal more than the sellers will admit to you. They'll swear it all comes off one hill. It does not come off one hill.", options:[
            { text:"A priest with a vice.", next:'wine2' },
          ]},
          wine2:{ text:"A factor with an account. I've carried cargo I wouldn't name to you and stamped contracts I wouldn't sign under my own name, and at the end of a lane I sit down with a glass and let the day close. The Balance has never once objected to pleasure. It objects to pretending it came free.", options:[
            { text:"I will remember that.", next:'wine3' },
          ]},
          wine3:{ text:"Do. A factor who's had wine off you reads your contract twice before he stamps it. That isn't corruption, {name}. That's the discount for being remembered.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
        }
      }
    },
    {
      id:'jaquet', name:'Jaquet', faction:'syndicate',
      portrait:'hacker1', role:'Syndicate Broker', enabled:true,
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
        reward:'Syndicate standing +1, Bear Betrayer title (placeholder).' },
      // quests:[] parks BEAR RAID (dormant data) and hands the idle slot to the tree.
      // Restore the questline by removing this empty array.
      quests:[],
      tree:{
        start:'open',
        nodes:{
          open:{ text:"You called ME? Hah. Nobody calls me first. Sit down, sit down, this is already a good day.", options:[
            { text:"I have some questions.", next:'root' },
            { text:"Any work for me?", next:'work' },
          ]},
          work:{ text:"Nothing yet. When the Syndicate wants something moved they do not send a calendar invite. Keep the line open and stay boring for a while.", options:[
            { text:"A few questions, then.", next:'root' },
            { text:"Later, Jaquet.", end:true },
          ]},
          root:{ text:"Ask me anything. Seriously. Almost nothing gets me in trouble any more.", options:[
            { text:"Who do you actually work for?", next:'loyal1' },
            { text:"What is the Syndicate, really?", next:'syn1' },
            { text:"How are you still walking around this station?", next:'free1' },
            { text:"Is there something in your spine?", next:'spine1' },
            { text:"What happens to you if the sixteenth war starts?", next:'war1' },
            { text:"What do you think of Mr. Flesh?", next:'flesh1' },
            { text:"Any work for me?", next:'work' },
            { text:"That is all.", end:true },
          ]},
          // -- Loyalty --
          loyal1:{ text:"Everybody. That is not a joke, that is the business model.", options:[
            { text:"Pick one.", next:'loyal2' },
          ]},
          loyal2:{ text:"Fine. The Syndicate pays me to sit here and watch the money. FLSH pays me more to say what I saw. The Coalition pays me nothing at all, they just read what FLSH writes down and feel very clean about it. Three employers, one chair. I am the most efficient man on this station.", options:[
            { text:"Your bosses have not noticed?", next:'loyal3' },
          ]},
          loyal3:{ text:"My bosses budgeted for an informant betraying them a little. What they did not budget for is that the proprietor pays better than the crime, so I have no reason to lie to him and every reason to lie to them. Loyalty is just the highest bid, friend. Nobody outbids a brain in a jar.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- The Syndicate --
          syn1:{ text:"Not what you think. There is no throne. No boss of bosses waiting for you at the end of the level.", options:[
            { text:"Then what is it?", next:'syn2' },
          ]},
          syn2:{ text:"A price. Anything the Coalition makes illegal earns a premium, and the premium organises people. That is all we are. Take away the law and the Syndicate evaporates inside a month, and the same men sell the same crates with a licence and a slightly worse margin.", options:[
            { text:"So the Coalition creates you.", next:'syn3' },
          ]},
          syn3:{ text:"Every year, on schedule, in writing. And they know it. I have sat across from Coalition officers who understand the mechanism better than I do. They keep the law anyway, because a market they cannot see frightens them more than one they can price.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Why he is free --
          free1:{ text:"Because I am useful, I am cheap, and I have never once been ambitious. Ambition is what gets people spaced.", options:[
            { text:"That is it?", next:'free2' },
          ]},
          free2:{ text:"That is most of it. The rest is that everyone here has a reason to keep me. The Coalition needs the read. The proprietor needs the leverage. My own people need somebody on the floor who can tell them which way the wind blew today. Three parties who agree on nothing all agree on Jaquet. No honest man will ever have job security like it.", options:[
            { text:"It sounds exhausting.", next:'free3' },
          ]},
          free3:{ text:"It is the most restful life I have had. I stopped choosing sides and my sleep improved that same week. You should try it. No, actually, do not try it. Two of me and the whole arrangement collapses.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- The implant --
          spine1:{ text:"Ah.", options:[
            { text:"You went quiet.", next:'spine2' },
          ]},
          spine2:{ text:"There is a unit at the base of my neck. Medical, they told me. Monitors the heart, flags a stroke, calls for help if I go down somewhere stupid. I signed for it the week I came aboard and I did not read all of it.", options:[
            { text:"Do you believe that?", next:'spine3' },
          ]},
          spine3:{ text:"On good days. On bad days I notice it has never needed a battery in eleven years, and that the technician who fitted it was not a medic, and that nobody has ever once called me in for a check up.", options:[
            { text:"You could have it removed.", next:'spine4' },
          ]},
          spine4:{ text:"I could. And then I would be a man who used to be trusted, standing in a corridor, carrying nothing anybody wants kept alive. No. Whatever it is, it is the reason I still get paid. Leave it in. Ask me something lighter.", options:[
            { text:"Something lighter, then.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- The war --
          war1:{ text:"Then I get very rich or very dead, and I have never once been able to work out the odds.", options:[
            { text:"Explain.", next:'war2' },
          ]},
          war2:{ text:"In a war, information stops being gossip and becomes ordnance. My price goes up tenfold overnight. So does the number of people who would prefer I stopped talking permanently. Those two lines cross somewhere and I do not know which side of the crossing I am standing on.", options:[
            { text:"You could leave first.", next:'war3' },
          ]},
          war3:{ text:"And go where. This station is the only place in the galaxy where all three of my problems sit in one building watching each other. The moment I am somewhere with only one of them, there is nobody left to object when they take me. My safety is that everyone can see me. It is a strange way to live and I do recommend it.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
          // -- Mr. Flesh (faction router) --
          flesh1:{ text:"I love him. Say that back to whoever asks. Write it down, spell it correctly.", options:[
            { text:"That was quick.", next:'flesh2' },
          ]},
          flesh2:{ text:"It was rehearsed. Look. The man has kept his word to me for eleven years and nobody else ever has. He pays on time, he does not moralise, and he has never once asked me to hurt anybody. Next to my last three employers he is a saint in a fish tank.", options:[
            { text:"And when he stops needing you?", next:'flesh_faction' },
          ]},
          flesh_faction:{ branch:{ faction:'syndicate', match:'flesh_syn', other:'flesh_other' } },
          flesh_syn:{ text:"You are one of ours, so listen properly. Do not run product through this station thinking I will look the other way, because I will not, and it will not be personal. And if you ever hear my name spoken in a room back home, you tell me. That is not a favour, that is a trade, and I will pay for it.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"Understood.", end:true },
          ]},
          flesh_other:{ text:"Then I stop. Everybody on this station is rented, friend. The traders, the officers, the priest, me. The only difference is that I got my terms in writing and they did not.", options:[
            { text:"I have more questions.", next:'root' },
            { text:"That is all.", end:true },
          ]},
        }
      }
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
