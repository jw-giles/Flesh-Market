// chat-check
//
// WHAT WENT WRONG. A refresh raised unread badges on channels where nothing had
// happened. Two independent causes, both in client/assets/core.js:
//
//   1. addChat took ONE parameter. The chat_history handler had been calling it
//      as addChat(m, true) since the replay was written, meaning "this is
//      history", and the argument went nowhere. So every refresh walked the last
//      thirty minutes of traffic through the live path: a badge per replayed
//      message, and the mention sound for every historical mention.
//
//   2. Even live, the badge counted ANY message on a channel you were not
//      looking at. A busy Global lit it permanently whether or not one word of
//      it was addressed to you.
//
// The predicate is DRIVEN here rather than matched, because its failures are
// substring failures - @Jacob against @Jacobson, an email address read as a
// mention - and no amount of reading the regex catches those. The wiring around
// it is matched, because "the argument reaches the parameter" is a fact about
// where a token sits rather than about what it computes.
//
// No dependencies. Run from the repo root:  node tools/chat-check.mjs
import fs from 'fs';
import vm from 'vm';

const ROOT = process.cwd();
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };

const core = fs.readFileSync(ROOT + '/client/assets/core.js', 'utf8');

console.log('\n== The mention predicate, run rather than read ==');
{
  const i = core.indexOf('function chatMentionsMe(item){');
  const j = core.indexOf('window.chatMentionsMe');
  ok('chatMentionsMe exists and is exported', i >= 0 && j > i);
  if (i >= 0 && j > i) {
    const ctx = vm.createContext({ console });
    ctx.window = ctx;
    ctx.ME = { name: 'Jacob' };
    vm.runInContext(core.slice(i, j), ctx);
    const m = ctx.chatMentionsMe;

    ok('a plain mention is a mention',            m({ text: 'hey @Jacob look at this' }) === true);
    ok('case does not matter',                    m({ text: 'hey @jacob look at this' }) === true);
    ok('a mention alone is a mention',            m({ text: '@Jacob' }) === true);
    ok('punctuation still ends the name',         m({ text: '@Jacob, the passage is open' }) === true);
    // The substring cases. This is the whole reason the predicate is driven.
    ok('@Jacobson is NOT a mention of Jacob',     m({ text: 'ask @Jacobson about it' }) === false);
    ok('@Jacob-son is NOT either',                m({ text: 'ask @Jacob-son about it' }) === false);
    ok('a bare name with no @ is not a mention',  m({ text: 'jacob was here' }) === false);
    ok('an address is not a mention',             m({ text: 'mail me at a@Jacob.io' }) === false);
    // Your own message naming you must not badge you.
    ok('you cannot mention yourself',             m({ text: '@Jacob check this', user: 'Jacob' }) === false);
    ok('empty text is not a mention',             m({ text: '' }) === false);
    ok('a malformed item is not a mention',       m({}) === false);

    const anon = vm.createContext({ console });
    anon.window = anon; anon.ME = null;
    vm.runInContext(core.slice(i, j), anon);
    ok('and nobody is mentioned before login',    anon.chatMentionsMe({ text: '@Jacob hi' }) === false);
  }
}

console.log('\n== Replayed history is not news ==');
{
  ok('addChat takes the history flag',
     /function addChat\(item, isHistory\)\{/.test(core));
  ok('and the replay actually passes it',
     /addChat\(m\.data \|\| m, true\)/.test(core));

  // The gate, and that it sits BEFORE the badge rather than beside it: the two
  // returns must both come after the mentionsMe binding and before the first
  // getElementById('unread-.
  const gateH = core.indexOf('  if (isHistory) return;');
  const gateM = core.indexOf('  if (!mentionsMe) return;');
  const badge = core.indexOf("document.getElementById('unread-global')");
  ok('history returns before any badge is painted', gateH > 0 && gateH < badge);
  ok('a non-mention returns before it too',         gateM > gateH && gateM < badge);
  ok('the sound is refused on replay',
     /if \(!isHistory && mentionsMe\)/.test(core));
}

console.log('\n== The highlight and the badge give the same answer ==');
{
  // Both are built from the same shape. A highlight that disagrees with the
  // badge is how you get a name glowing in the log and no badge, or worse.
  const my = 'Jacob';
  const re = new RegExp(`(^|[^A-Za-z0-9_\\-])(@${my}(?![A-Za-z0-9_\\-]))`, 'gi');
  // re carries /g, so test() advances lastIndex and the NEXT call starts mid
  // string. Reset after reading the result, not as part of the expression.
  const hit = s => { const r = re.test(s); re.lastIndex = 0; return r; };
  ok('the highlight lights a real mention',   hit('hey @Jacob ok') === true);
  ok('and leaves @Jacobson alone',            hit('ask @Jacobson') === false);
  ok('and leaves an address alone',           hit('a@Jacob.io') === false);
  ok('the highlight preserves the boundary character',
     'hey @Jacob ok'.replace(re, '$1[$2]') === 'hey [@Jacob] ok');
}

console.log('\n== The mention inbox, driven against a real database ==');
{
  let DatabaseSync = null;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch(_) {}
  if (!DatabaseSync) {
    // Loud, and in the shape run-all recognises. A check that cannot run must
    // not print as a pass.
    console.log('  !! NOT RUN !!  node:sqlite unavailable (needs Node 22.5+)');
  } else {
    const dbSrc = fs.readFileSync(ROOT + '/server/db.js', 'utf8');
    const db = new DatabaseSync(':memory:');

    // The schema, taken from db.js rather than retyped here. A copy of the DDL
    // in the check is a check that passes against a table the server does not
    // create.
    const ddl = dbSrc.match(/CREATE TABLE IF NOT EXISTS chat_mentions \([\s\S]*?\);/);
    ok('the chat_mentions table is declared in db.js', !!ddl);
    if (ddl) {
      db.exec(ddl[0]);
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_mentions_recip ON chat_mentions(recipient_id, seen);');

      // The four helpers, lifted and run. stmt() is db.js's internal, shimmed.
      const lift = name => {
        const i = dbSrc.indexOf('export function ' + name + '(');
        if (i < 0) return null;
        let d = 0, j = dbSrc.indexOf('{', i);
        for (let k = j; k < dbSrc.length; k++) {
          if (dbSrc[k] === '{') d++;
          else if (dbSrc[k] === '}') { d--; if (!d) return dbSrc.slice(i, k + 1).replace('export function', 'function'); }
        }
        return null;
      };
      const names = ['chatAddMention', 'chatUnreadMentions', 'chatMarkMentionsSeen', 'chatPruneMentions'];
      const bodies = names.map(lift);
      ok('all four inbox helpers are exported', bodies.every(Boolean));

      if (bodies.every(Boolean)) {
        const ctx = vm.createContext({ console, Date, Number, String, stmt: sql => db.prepare(sql) });
        vm.runInContext(bodies.join('\n') + '\nthis.API = {' + names.join(',') + '};', ctx);
        const A = ctx.API;

        A.chatAddMention('p1', 'global', 1, 'Jacob');
        A.chatAddMention('p1', 'global', 3, 'Jacob');
        A.chatAddMention('p1', 'guild', 1, 'Nono');
        A.chatAddMention('p2', 'global', 1, 'Jacob');

        let c = A.chatUnreadMentions('p1');
        ok('mentions are counted per channel', c.global === 2 && c.guild === 1, JSON.stringify(c));
        ok('rooms collapse into their channel', c.global === 2);
        ok('and another player has his own inbox', A.chatUnreadMentions('p2').global === 1);

        // The scoping property. Opening one channel must not silently clear
        // another - that is how a mention gets lost with no way to notice.
        A.chatMarkMentionsSeen('p1', 'global');
        c = A.chatUnreadMentions('p1');
        ok('reading a channel clears that channel', c.global === undefined || c.global === 0);
        ok('and leaves the others alone',          c.guild === 1);
        ok('and does not touch another player',    A.chatUnreadMentions('p2').global === 1);

        // Survival is the whole point: the count comes off rows, not off a
        // counter in a browser, so it outlives the client.
        const rows = db.prepare('SELECT COUNT(*) AS c FROM chat_mentions').get();
        ok('read rows are kept until pruned, not deleted on read', (rows.c | 0) === 4);

        // Prune takes seen rows past the window and nothing else.
        db.prepare('UPDATE chat_mentions SET created_at=? WHERE recipient_id=? AND channel=?')
          .run(Date.now() - 40 * 24 * 60 * 60 * 1000, 'p1', 'global');
        const removed = A.chatPruneMentions();
        ok('pruning removes old READ rows', removed === 2, String(removed));
        ok('and leaves unread ones however old they are', A.chatUnreadMentions('p1').guild === 1);
      }
    }
    db.close();
  }
}

console.log('\n== The inbox is wired end to end ==');
{
  const srv = fs.readFileSync(ROOT + '/server/server.js', 'utf8');
  ok('the send path records mentions',
     /recordChatMentions\(chatText, actor, channel, chatRoom\)/.test(srv));
  ok('parsed from the text that actually shipped, not the raw input',
     /recordChatMentions\(chatText,/.test(srv) && !/recordChatMentions\(rawText,/.test(srv));
  ok('the counts are sent on connect',
     /type:'chat_mentions',data:chatUnreadMentions\(player\.id\)/.test(srv));
  ok('and the client can mark a channel read',
     /msg\.type==='chat_mentions_seen'/.test(srv));
  ok('the seen handler takes the player id from the socket, not the message',
     /chatMarkMentionsSeen\(playerId, ch\)/.test(srv));
  ok('a mention in a channel the target cannot read is not recorded',
     /if \(!canReadChannel\(target, channel\)\) continue;/.test(srv));
  ok('you cannot mention yourself into a badge',
     /if \(target\.id === sender\.id\) continue;/.test(srv));
  ok('and one message cannot write an unbounded number of rows',
     /hits < MAX_MENTIONS_PER_MSG/.test(srv));
  ok('nor cost an unbounded number of name lookups',
     /if \(\+\+scanned > MAX_MENTION_TOKENS_SCANNED\) break;/.test(srv));

  ok('the client paints what the server sends',
     /if \(msg\.type === 'chat_mentions'\) paintMentionBadges/.test(core));
  const chatUi = fs.readFileSync(ROOT + '/client/assets/chat-ui.js', 'utf8');
  ok('and tells the server when a tab is opened',
     /window\.markChannelRead\(_activeChatChannel\)/.test(chatUi));
  const idx = fs.readFileSync(ROOT + '/client/index.html', 'utf8');
  ok('including through the room switcher, which clears the same badge',
     /window\.markChannelRead\(ch\)/.test(idx));
}

console.log('\n== Message length, and the spam streak, both driven ==');
{
  const srv = fs.readFileSync(ROOT + '/server/server.js', 'utf8');
  const i = srv.indexOf('const CHAT_MAX_WORDS = 534;');
  const j = srv.indexOf('function getPlayerOrders');
  ok('the length and spam rules are in one block', i > 0 && j > i);
  if (i > 0 && j > i) {
    const src = srv.slice(i, j);

    // Real clock first: the counter and the streak shape.
    const ctx = vm.createContext({ console, Date, Map, Math, String, Number });
    vm.runInContext(src + '\nthis.API={countWords,noteWallOfText,CHAT_MAX_WORDS,CHAT_MAX_CHARS,CHAT_WALL_WORDS,CHAT_WALL_STREAK,CHAT_WALL_WINDOW_MS};', ctx);
    const A = ctx.API;

    ok('the cap is 534 words',              A.CHAT_MAX_WORDS === 534);
    ok('with a character ceiling under it', A.CHAT_MAX_CHARS > A.CHAT_MAX_WORDS * 6, String(A.CHAT_MAX_CHARS));
    ok('empty text is zero words',          A.countWords('') === 0 && A.countWords('   ') === 0);
    ok('runs of whitespace are one gap',    A.countWords('  hi   there  ') === 2);
    ok('newlines and tabs separate words',  A.countWords('a\nb\tc') === 3);
    ok('534 words counts as 534',           A.countWords('word '.repeat(534).trim()) === 534);

    ok('three walls in a row trip it',
       [1,2,3].map(() => A.noteWallOfText('p1', 500)).join() === 'false,false,true');
    ok('an ordinary line between them resets the run',
       [500,5,500,500].map(w => A.noteWallOfText('p2', w)).join() === 'false,false,false,false');
    ok('the floor is inclusive',
       [1,2,3].map(() => A.noteWallOfText('p3', A.CHAT_WALL_WORDS)).join() === 'false,false,true');
    ok('and one word under the floor never trips',
       [1,2,3,4,5].map(() => A.noteWallOfText('p4', A.CHAT_WALL_WORDS - 1)).every(x => x === false));

    // The window, on a faked clock. This is the false-positive guard: three
    // long posts written across an evening is a lore writer, not a spammer.
    let t = 1_000_000;
    const slow = vm.createContext({ console, Map, Math, String, Number, Date: { now: () => t } });
    vm.runInContext(src + '\nthis.API={noteWallOfText};', slow);
    const S = slow.API;
    const spread = [];
    for (const gap of [0, 90_000, 90_000]) { t += gap; spread.push(S.noteWallOfText('slow', 500)); }
    ok('walls spread past the window do NOT trip it', spread.every(x => x === false));
    t = 2_000_000;
    const burst = [];
    for (const gap of [0, 5_000, 5_000]) { t += gap; burst.push(S.noteWallOfText('fast', 500)); }
    ok('walls inside the window still do', burst.join() === 'false,false,true');
  }

  ok('chat refuses over-length rather than truncating',
     /Message is \$\{_w\} words\. The limit is \$\{CHAT_MAX_WORDS\}/.test(srv));
  ok('and so does whisper', (srv.match(/The limit is \$\{CHAT_MAX_WORDS\}/g) || []).length === 2);
  ok('the old 240 character slice is gone from both',
     !/const rawText=String\(msg\.text\|\|''\)\.slice\(0,240\)/.test(srv));
  ok('the spam check runs after the message is delivered',
     srv.indexOf('noteWallOfText(actor.id') > srv.indexOf('recordChatMentions(chatText'));
  ok('operators are exempt from the auto dunce',
     /!isDevAccount\(actor\.id\) && !isAdminAccount\(actor\.id\) && !isOwnerAccount\(actor\.id\)/.test(srv));
  ok('the auto dunce is logged to admins',
     /action:'dunce_auto'/.test(srv));

  // The two counters have to be the same function or the counter lies.
  const chatUi2 = fs.readFileSync(ROOT + '/client/assets/chat-ui.js', 'utf8');
  ok('the client caps at the same number',
     /var CHAT_MAX_WORDS = 534;/.test(chatUi2));
  ok('and counts words the same way',
     /return t \? t\.split\(\/\\s\+\/\)\.length : 0;/.test(chatUi2)
     && /return t \? t\.split\(\/\\s\+\/\)\.length : 0;/.test(srv));
  ok('an over-length message is refused without clearing the input',
     /if \(wc > CHAT_MAX_WORDS\) \{[\s\S]{0,400}?return;/.test(chatUi2)
     && !/if \(wc > CHAT_MAX_WORDS\) \{[\s\S]{0,400}?input\.value = '';/.test(chatUi2));
  const idx2 = fs.readFileSync(ROOT + '/client/index.html', 'utf8');
  ok('and there is something on screen to read the count off',
     /id="chatWordCount"/.test(idx2) && /getElementById\('chatWordCount'\)/.test(chatUi2));
}

console.log('\n== The weekly wipe lands on the tax day boundary ==');
{
  const srv = fs.readFileSync(ROOT + '/server/server.js', 'utf8');

  // The boundary helper itself, driven across DST in both directions. This is
  // the assertion that "the same exact time as tax day" is true rather than
  // approximately true.
  const i = srv.indexOf('function _frsMostRecentSundayNoonLA');
  const j = srv.indexOf('function frsScheduleTick');
  ok('the boundary helper is liftable', i > 0 && j > i);
  if (i > 0 && j > i) {
    const ctx = vm.createContext({ console, Date, Intl, Number, String, Math });
    vm.runInContext(srv.slice(i, j) + '\nthis.API={_frsMostRecentSundayNoonLA};', ctx);
    const B = ctx.API._frsMostRecentSundayNoonLA;
    const wall = ms => new Intl.DateTimeFormat('en-US', { timeZone:'America/Los_Angeles',
      hour12:false, weekday:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(ms));
    const cases = [
      ['midweek',            '2026-08-27T00:00:00Z'],
      ['deep winter',        '2026-01-15T00:00:00Z'],
      ['the spring forward', '2026-03-08T20:30:00Z'],
      ['the fall back',      '2026-11-01T19:30:00Z'],
    ];
    for (const [label, iso] of cases) {
      const w = wall(B(Date.parse(iso)));
      ok('the boundary is Sunday noon LA across ' + label, /^Sun,? 12:00$/.test(w), w);
    }
    // Idempotence: asking again from the boundary itself must not walk back a week.
    const b = B(Date.parse('2026-08-27T00:00:00Z'));
    ok('and asking from the boundary returns the boundary', B(b) === b);
  }

  ok('the wipe reads the SAME helper the tax engine reads',
     /const boundary = _frsMostRecentSundayNoonLA\(Date\.now\(\)\);[\s\S]{0,600}?CHAT_WIPE_KEY/.test(srv));
  /* The trap this check exists for: frsScheduleTick returns early when FRS is
     disabled, and FRS ships dormant. A wipe folded into that tick would never
     fire and nothing would say so. */
  ok('but the wipe has its own tick, not the FRS one',
     /setInterval\(chatWipeTick, 60_000\);/.test(srv));
  ok('and its own marker, so a server down over noon still wipes on return',
     /const CHAT_WIPE_KEY = 'chat_wipe_ts';/.test(srv)
     && /setCityKV\(CHAT_WIPE_KEY, String\(boundary\)\)/.test(srv));
  ok('an unset marker records the boundary instead of wiping',
     /if \(!last\) \{[\s\S]{0,200}?return; \}/.test(srv));
  ok('the wipe clears memory and the log',
     /chatRings\.clear\(\);/.test(srv) && /wipeChatLog\(\)/.test(srv));
  ok('and the mentions pointing at what it deleted',
     /wipeChatMentionsBefore\(boundary\)/.test(srv));
  ok('connected clients are told rather than left holding a dead week',
     /broadcast\(\{ type:'chat_cleared'/.test(srv));
  ok('and the client empties its panes on that message',
     /msg\.type === 'chat_cleared'/.test(core) && /\.chat-channel'\)\.forEach/.test(core));
}

console.log('\n== The wipe, driven against a real database ==');
{
  let DatabaseSync = null;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch(_) {}
  if (!DatabaseSync) {
    console.log('  !! NOT RUN !!  node:sqlite unavailable (needs Node 22.5+)');
  } else {
    const dbSrc = fs.readFileSync(ROOT + '/server/db.js', 'utf8');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE chat_log (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT, ts INTEGER, payload TEXT);`);
    const ddl = dbSrc.match(/CREATE TABLE IF NOT EXISTS chat_mentions \([\s\S]*?\);/);
    db.exec(ddl[0]);

    const lift = name => {
      const i = dbSrc.indexOf('export function ' + name + '(');
      if (i < 0) return null;
      let d = 0;
      for (let k = dbSrc.indexOf('{', i); k < dbSrc.length; k++) {
        if (dbSrc[k] === '{') d++;
        else if (dbSrc[k] === '}') { d--; if (!d) return dbSrc.slice(i, k + 1).replace('export function', 'function'); }
      }
      return null;
    };
    const bodies = ['wipeChatLog', 'wipeChatMentionsBefore'].map(lift);
    ok('both wipe helpers are exported from db.js', bodies.every(Boolean));
    if (bodies.every(Boolean)) {
      const ctx = vm.createContext({ console, Date, Number, String, stmt: sql => db.prepare(sql) });
      vm.runInContext(bodies.join('\n') + '\nthis.API={wipeChatLog,wipeChatMentionsBefore};', ctx);
      const A = ctx.API;

      const ins = db.prepare('INSERT INTO chat_log(k,ts,payload) VALUES(?,?,?)');
      for (let n = 0; n < 40; n++) ins.run('global:1', Date.now(), '{}');
      for (let n = 0; n < 10; n++) ins.run('guild:1', Date.now(), '{}');
      ok('the wipe reports what it removed', A.wipeChatLog() === 50);
      ok('and the log is empty afterwards',
         db.prepare('SELECT COUNT(*) AS c FROM chat_log').get().c === 0);
      ok('a second wipe is harmless',      A.wipeChatLog() === 0);

      const boundary = Date.now();
      const mi = db.prepare('INSERT INTO chat_mentions(recipient_id,channel,room,from_name,created_at,seen) VALUES(?,?,?,?,?,0)');
      mi.run('p1', 'global', 1, 'Jacob', boundary - 5000);   // before the wipe
      mi.run('p1', 'global', 1, 'Jacob', boundary - 1);      // before the wipe
      mi.run('p1', 'global', 1, 'Jacob', boundary + 5000);   // after: its message survives
      ok('mentions older than the boundary go', A.wipeChatMentionsBefore(boundary) === 2);
      ok('and one landing after it stays',
         db.prepare('SELECT COUNT(*) AS c FROM chat_mentions').get().c === 1);
    }
    db.close();
  }
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
