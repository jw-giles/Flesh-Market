// ═══════════════════════════════════════════════════════════════════════════
// serve.mjs — a static file server for client/, and nothing else.
//
//   node tools/serve.mjs [port]
//
// WHY THIS EXISTS AT ALL, since the game already has a server. Because
// server/server.js is the GAME: it opens a database, holds sockets, runs the
// market day and seeds accounts. Nothing on the bench pages needs any of that,
// and starting it to look at a battlefield means a running world with real
// state in it for a task that reads six PNGs and a JSON.
//
// AND file:// DOES NOT WORK, which is the part that keeps costing time. The
// sprite tint reads getImageData, and a canvas that has drawn an image from a
// file:// URL is TAINTED - the read throws and every faction comes out in the
// pack's own colours. The renderer survives it; the test does not, because a
// bench that silently shows the wrong uniforms is worse than one that refuses.
// Any http origin fixes it. This is the smallest one.
//
// ZERO DEPENDENCIES, deliberately. A test runner that cannot start until an
// install succeeds is a test runner that does not run on a fresh clone.
// ═══════════════════════════════════════════════════════════════════════════
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'client');
const AUTO = process.argv.includes('--auto');
let PORT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 8177);
let VERSION = '?';
try {
  VERSION = JSON.parse(fs.readFileSync(path.join(CLIENT, 'version.json'), 'utf8')).version;
} catch { /* a tree without a version.json is not fatal for a static server */ }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
};

if (!fs.existsSync(CLIENT)) {
  console.error('serve: no client/ next to tools/. Run from the repo root.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); return res.end('bad url'); }
  if (rel === '/') rel = '/citybattle-mock.html';

  /* Resolve first, then check containment. Comparing the STRING before
     resolving is how ..%2f gets through: the check passes on text that means
     something else once the path is normalised. */
  const abs = path.resolve(CLIENT, '.' + rel);
  if (abs !== CLIENT && !abs.startsWith(CLIENT + path.sep)) {
    res.writeHead(403); return res.end('outside client/');
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 ' + rel);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      // A bench is for looking at the file you just edited.
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(abs).pipe(res);
  });
});

/* ── The port squatter, which is a real failure and looked like nothing ────
   A SERVER LEFT RUNNING FROM AN EARLIER SESSION KEEPS SERVING THE FOLDER IT
   WAS STARTED IN. The old test.bat opened the browser BEFORE starting the
   server, so when the new one hit EADDRINUSE and exited, the tab that had just
   opened connected to the OLD process - happily serving last week's tree from
   a different directory. Every symptom pointed at caching and none of it was:
   the files were fine, the bust was fine, and a different server answered.

   So a busy port is no longer a one-line complaint. It asks the occupant what
   build it is serving and says so, because "something else is on this port" is
   not actionable and "the thing on this port is serving 1.7.6.0 from another
   folder" is. --auto steps to the next free port instead. */
server.on('error', async (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  if (AUTO && PORT < 8277) {
    console.log('serve: port ' + PORT + ' busy, trying ' + (PORT + 1) + '...');
    return listen(PORT + 1);
  }
  console.error('');
  console.error('  serve: PORT ' + PORT + ' IS ALREADY IN USE.');
  let who = null;
  try {
    const r = await fetch('http://localhost:' + PORT + '/version.json',
                          { cache: 'no-store' });
    who = await r.json();
  } catch { /* not one of ours, or not answering */ }
  if (who && who.version) {
    console.error('  Something is already serving a FleshMarket tree on it,');
    console.error('  and that tree is build ' + who.version + '.');
    console.error('  This tree is build ' + VERSION + '.');
    if (who.version !== VERSION) {
      console.error('');
      console.error('  *** THAT IS WHY YOUR BROWSER SHOWS AN OLD BUILD. ***');
      console.error('  It is not a cache. A server started from a DIFFERENT');
      console.error('  FOLDER is answering, and this one just failed to start.');
    }
  } else {
    console.error('  Something is on it that is not a FleshMarket server.');
  }
  console.error('');
  console.error('  Close the other window, or:  node tools/serve.mjs --auto');
  console.error('');
  process.exit(1);
});

function listen(port) {
  PORT = port;
  server.listen(port);
}
server.on('listening', () => {
  console.log('serve: client/ on http://localhost:' + PORT + '   build ' + VERSION);
  console.log('  serving ' + CLIENT);
  console.log('  city battlefield bench   http://localhost:' + PORT + '/citybattle-mock.html');
  console.log('  reach battle bench       http://localhost:' + PORT + '/battle-test.html');
  console.log('  the game                 http://localhost:' + PORT + '/index.html');
  console.log('    (index.html needs server/ running to do anything; the two');
  console.log('     benches do not, which is the point of them.)');
  console.log('ctrl-c to stop.');
});
listen(PORT);
