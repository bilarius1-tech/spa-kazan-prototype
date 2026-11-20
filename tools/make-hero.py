#!/usr/bin/env python3
"""Пересобрать картинку первого экрана из исходника (PNG/JPG).
Использование: python3 tools/make-hero.py путь/к/исходнику.png
Создаёт images/hero-1920.(webp|jpg) и images/hero-960.(webp|jpg). Нужен Pillow."""
import sys, os
from PIL import Image
src = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "images")
im = Image.open(src).convert("RGB")
for w in (1920, 960):
    h = round(im.height * w / im.width)
    r = im.resize((w, h), Image.LANCZOS)
    r.save(os.path.join(out, f"hero-{w}.webp"), "WEBP", quality=74, method=6)
    r.save(os.path.join(out, f"hero-{w}.jpg"), "JPEG", quality=76, optimize=True, progressive=True)
    print("ok", w, h)
