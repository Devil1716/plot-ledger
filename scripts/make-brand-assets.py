"""Build every icon / splash / brand image from the master logo.

Usage: python3 scripts/make-brand-assets.py path/to/logo.png && pnpm assets:generate
The master is a dark rounded tile on black; the tile box below was measured from it.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/logo-master.png"
TILE = (132, 131, 1117, 1095)  # tile bounds in the 1254px master
RADIUS = 249                   # tile corner radius in master pixels
INK = (11, 13, 16)             # splash / app background (#0b0d10)

src = Image.open(SRC).convert("RGB")
scale = src.size[0] / 1254
tile_box = tuple(round(v * scale) for v in TILE)
radius = RADIUS * scale


def rounded_mask(size, box, r, inset=0, ss=4):
    m = Image.new("L", (size[0] * ss, size[1] * ss), 0)
    x0, y0, x1, y1 = box
    ImageDraw.Draw(m).rounded_rectangle(
        ((x0 + inset) * ss, (y0 + inset) * ss, (x1 - inset) * ss, (y1 - inset) * ss), radius=(r - inset) * ss, fill=255
    )
    return m.resize(size, Image.LANCZOS)


# square crop centred on the tile
x0, y0, x1, y1 = tile_box
side = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
crop = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
local_box = (x0 - crop[0], y0 - crop[1], x1 - crop[0], y1 - crop[1])
square = src.crop(crop)

# 1) rounded tile with transparent corners (web icons, splash, in-app mark)
tile_rgba = square.convert("RGBA")
tile_rgba.putalpha(rounded_mask(square.size, local_box, radius))

# 2) full-bleed square (iOS AppIcon, legacy launcher, adaptive layers): drop the
#    thin bright rim and fill the corners with the tile's own edge colour
arr = np.asarray(square).astype(float)
s = square.size[0]
ring = np.concatenate([
    arr[int(s * 0.06):int(s * 0.08), int(s * 0.3):int(s * 0.7)].reshape(-1, 3),
    arr[int(s * 0.92):int(s * 0.94), int(s * 0.3):int(s * 0.7)].reshape(-1, 3),
    arr[int(s * 0.3):int(s * 0.7), int(s * 0.06):int(s * 0.08)].reshape(-1, 3),
    arr[int(s * 0.3):int(s * 0.7), int(s * 0.92):int(s * 0.94)].reshape(-1, 3),
])
fill = tuple(int(v) for v in np.median(ring, axis=0))
full = Image.new("RGBA", square.size, fill + (255,))
inner = square.convert("RGBA")
inner.putalpha(rounded_mask(square.size, local_box, radius, inset=10 * scale))
full.alpha_composite(inner)
full = full.convert("RGB")
print("edge fill", "#%02x%02x%02x" % fill)

os.makedirs("assets", exist_ok=True)
full.resize((1024, 1024), Image.LANCZOS).save("assets/icon-only.png")
Image.new("RGB", (1024, 1024), fill).save("assets/icon-background.png")

# capacitor-assets insets the adaptive foreground by 16.7% (it fills the 72dp visible
# area), so ~94% here keeps the wallet inside the launcher's safe circle
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
fs = int(1024 * 0.94)
yy, xx = np.mgrid[0:fs, 0:fs]
edge = np.minimum(np.minimum(xx, fs - 1 - xx), np.minimum(yy, fs - 1 - yy))
feather = Image.fromarray((np.clip(edge / 28, 0, 1) * 255).astype("uint8"))
fg.paste(full.resize((fs, fs), Image.LANCZOS), ((1024 - fs) // 2,) * 2, feather)
fg.save("assets/icon-foreground.png")

for name in ("splash.png", "splash-dark.png"):
    splash = Image.new("RGBA", (2732, 2732), INK + (255,))
    ts = 640
    splash.alpha_composite(tile_rgba.resize((ts, ts), Image.LANCZOS), ((2732 - ts) // 2,) * 2)
    splash.convert("RGB").save(f"assets/{name}")

os.makedirs("public", exist_ok=True)
tile_rgba.resize((512, 512), Image.LANCZOS).save("src/app/icon.png", optimize=True)
full.resize((180, 180), Image.LANCZOS).save("src/app/apple-icon.png", optimize=True)
tile_rgba.resize((256, 256), Image.LANCZOS).save("src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
tile_rgba.resize((160, 160), Image.LANCZOS).save("public/logo-mark.png", optimize=True)
os.makedirs("icons", exist_ok=True)
for n in (48, 72, 96, 128, 192, 256, 512):
    tile_rgba.resize((n, n), Image.LANCZOS).save(f"icons/icon-{n}.webp", quality=92)
