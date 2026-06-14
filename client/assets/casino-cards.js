/* casino-cards.js — shared pixel-art poker deck renderer.
 * Backs blackjack + poker (and any future card surface) with the
 * sprite sheet at assets/cards/poker-deck.png instead of text glyphs.
 *
 * Sheet geometry (measured): 880x464, cell 48x80, stride 64x96, origin 0,0.
 * Suit order across each rank group is clubs, spades, hearts, diamonds.
 * Joker = row4 col0, card back = row4 col1.
 */
(function(){
'use strict';
if (window.FMPokerCard) return; // idempotent

var SHEET = 'assets/cards/poker-deck.png';
var SW = 880, SH = 464, CW = 48, CH = 80, STRIDE_X = 64, STRIDE_Y = 96;

// rank -> [row, baseCol] of the clubs card in that group
var RANK_POS = {
  '5':[0,2], '10':[0,6],
  '4':[1,2], '9':[1,6],
  '3':[2,2], '8':[2,6], 'K':[2,10],
  '2':[3,2], '7':[3,6], 'Q':[3,10],
  'A':[4,2], '6':[4,6], 'J':[4,10]
};
var SUIT_OFF = { '\u2663':0,'\u2660':1,'\u2665':2,'\u2666':3, C:0,S:1,H:2,D:3,c:0,s:1,h:2,d:3 };

function normRank(r){
  r = String(r).toUpperCase();
  if (r === 'T') return '10';
  if (r === '1') return 'A';
  return r;
}

// Resolve a rank/suit (or 'back'/'joker') to a sheet [row,col]
function cellFor(rank, suit){
  if (rank === 'back')  return [4,1];
  if (rank === 'joker') return [4,0];
  var r = normRank(rank);
  var base = RANK_POS[r];
  var off  = SUIT_OFF[suit];
  if (!base || off == null) return [4,1]; // unknown -> back, never crash
  return [base[0], base[1] + off];
}

// Inject CSS once
function ensureCss(){
  if (document.getElementById('fm-pcard-css')) return;
  var st = document.createElement('style');
  st.id = 'fm-pcard-css';
  st.textContent =
    '.fm-pcard{display:inline-block;background-image:url(' + SHEET + ');' +
    'background-repeat:no-repeat;image-rendering:pixelated;image-rendering:crisp-edges;' +
    'border-radius:5px;vertical-align:top;box-shadow:0 2px 6px rgba(0,0,0,.35);' +
    'filter:drop-shadow(0 0 1px rgba(0,0,0,.4))}';
  document.head.appendChild(st);
}

// Build inline style string for a given target width
function styleFor(rank, suit, w){
  w = w || 52;
  var scale = w / CW;
  var cell = cellFor(rank, suit);
  var x = -(cell[1] * STRIDE_X) * scale;
  var y = -(cell[0] * STRIDE_Y) * scale;
  var h = CH * scale;
  return 'width:' + Math.round(w) + 'px;height:' + Math.round(h) + 'px;' +
         'background-size:' + Math.round(SW*scale) + 'px ' + Math.round(SH*scale) + 'px;' +
         'background-position:' + Math.round(x) + 'px ' + Math.round(y) + 'px;';
}

// DOM element form
function FMPokerCard(rank, suit, opts){
  ensureCss();
  opts = opts || {};
  var w = opts.w || 52;
  var d = document.createElement('div');
  d.className = 'fm-pcard' + (opts.className ? ' ' + opts.className : '');
  if (opts.faceDown){ rank = 'back'; suit = null; }
  d.setAttribute('style', styleFor(rank, suit, w));
  return d;
}

// HTML string form (for template literals / innerHTML)
function FMPokerCardHTML(rank, suit, opts){
  ensureCss();
  opts = opts || {};
  var w = opts.w || 52;
  if (opts.faceDown){ rank = 'back'; suit = null; }
  var cls = 'fm-pcard' + (opts.className ? ' ' + opts.className : '');
  return '<div class="' + cls + '" style="' + styleFor(rank, suit, w) + '"></div>';
}

window.FMPokerCard = FMPokerCard;
window.FMPokerCardHTML = FMPokerCardHTML;
})();
