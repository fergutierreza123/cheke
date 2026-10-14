#!/usr/bin/env python3
"""Regenerates the app icons from the cheke mark and the exact brand-book colors.

    python3 scripts/make_app_icon.py

Needs Pillow (pip3 install pillow). Writes:
  public/app-icon.png          1024px — the one used for the stores / the demo banner
  public/app-icon-menta.png    1024px — brand-book alternative (navy + mint)
  src/app/icon.png             512px  — browser tab icon (Next.js file convention)
  src/app/apple-icon.png       180px  — iPhone "Add to Home Screen" icon
  src/app/favicon.ico          16/32/48px — classic browser tab icon

Brand book (Inventa Studio, 2026), primary palette:
  Azul oscuro #001037   Azul intenso #0043F8   Menta #52EBBB   Blanco #FFFFFF
Change MAIN below to pick which pair is the main icon.
"""
from PIL import Image

NAVY, BLUE, MINT, WHITE = (0, 16, 55), (0, 67, 248), (82, 235, 187), (255, 255, 255)

MAIN = (NAVY, BLUE)        # background, mark
ALT = (NAVY, MINT)

src = Image.open("public/logos/cheke-icon.png").convert("RGBA")
alpha = src.split()[3]


def make(bg, fg, size, frac=0.56):
    mark = Image.new("RGBA", src.size, fg + (0,))
    mark.putalpha(alpha)
    h = int(size * frac)
    w = int(mark.width * h / mark.height)
    mark = mark.resize((w, h), Image.LANCZOS)
    base = Image.new("RGBA", (size, size), bg + (255,))
    base.alpha_composite(mark, ((size - w) // 2, (size - h) // 2))
    return base.convert("RGB")


make(*MAIN, 1024).save("public/app-icon.png", optimize=True)
make(*ALT, 1024).save("public/app-icon-menta.png", optimize=True)
# Next.js insists these two are RGBA PNGs (fully opaque is fine).
make(*MAIN, 512).convert("RGBA").save("src/app/icon.png", optimize=True)
make(*MAIN, 180).convert("RGBA").save("src/app/apple-icon.png", optimize=True)
make(*MAIN, 256).convert("RGBA").save("src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("done")
