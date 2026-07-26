from PIL import Image
import os, json

SRC = {'mas':'ships/mas', 'vdf':'ships/vdf'}
OUT = 'Flesh-Market-main/client/assets/space/ships/fleet'
os.makedirs(OUT, exist_ok=True)

# Source art is nose UP. The map draws along atan2(dy,dx) with 0 = right, and the
# existing sprites are nose RIGHT, so every hull rotates 90 degrees clockwise.
def prep(path, map_w, detail_w):
    im = Image.open(path).convert('RGBA')
    im = im.crop(im.getbbox())                 # trim the transparent margin first
    im = im.rotate(-90, expand=True)           # nose up -> nose right
    ar = im.size[1] / im.size[0]
    mw = map_w;      mh = max(6, round(mw * ar))
    dw = detail_w;   dh = max(24, round(dw * ar))
    return (im.resize((mw, mh), Image.NEAREST),
            im.resize((dw, dh), Image.NEAREST))

# name -> (source pack, file, map width, detail width)
FLEET = {
  # Merchant hulls. These replace the old yellow v1/v2/v3 art.
  'star_traveller':  ('mas','StarTravellerFreighter.png',      22,  150),
  'astral_pioneer':  ('mas','AstralPioneerFreighter.png',      26,  170),
  'aureole':         ('mas','AureoleClassFreighter.png',       24,  160),
  'phoebe':          ('mas','PhoebeClassFreighter.png',        30,  185),
  'nomad':           ('mas','NomadClassFreighter.png',         30,  185),
  'canyonback':      ('mas','CanyonbackClassFreighter.png',    34,  200),
  'cicada':          ('mas','CicadaClassFreighter.png',        40,  215),
  'titans_burden':   ('mas','TitansBurdenClassFreighter.png',  42,  225),
  'titans_fist':     ('mas','TitansFistClassPocketCarrier2.png',38, 210),
  # Scoundrels. Ambient only, never carry cargo, never intercepted.
  'scoundrel':       ('mas','ScoundrelCorvette.png',           20,  140),
  'scoundrel_ew':    ('mas','ScoundrelEWCorvette.png',         22,  145),
  # Changzheng family, Jade Circuit. Registry keys were renamed in 1.6.0.2;
  # these filenames are the art pack's originals and are resolved via FLEET_HULLS[key].f
  'envoy':           ('vdf','EnvoyClassCorvette.png',          18,  130),
  'conciliator':     ('vdf','ConciliatorClassFrigate.png',     24,  155),
  'intercessor':     ('vdf','IntercessorClassFrigate.png',     24,  155),
  'mediator':        ('vdf','MediatorClassDestroyer.png',      28,  170),
  'negotiator':      ('vdf','NegotiatorClassDestroyer.png',    30,  175),
  'herald':          ('vdf','HeraldClassCruiser.png',          34,  195),
  'emissary':        ('vdf','EmissaryClassCruiser.png',        34,  195),
  'diplomat':        ('vdf','DiplomatClassHeavyCruiser.png',   40,  215),
  'consular':        ('vdf','ConsularClassCarrier.png',        46,  235),
}

meta = {}
for key, (pack, fn, mw, dw) in FLEET.items():
    m, d = prep(os.path.join(SRC[pack], fn), mw, dw)
    m.save(os.path.join(OUT, key + '_map.png'))
    d.save(os.path.join(OUT, key + '_detail.png'))
    meta[key] = {'mw': m.size[0], 'mh': m.size[1], 'dw': d.size[0], 'dh': d.size[1]}
    print(f'  {key:16s} map {m.size[0]:3d}x{m.size[1]:<3d}  detail {d.size[0]:3d}x{d.size[1]:<3d}')

print(json.dumps(meta))
open('fleet_meta.json','w').write(json.dumps(meta, indent=1))
