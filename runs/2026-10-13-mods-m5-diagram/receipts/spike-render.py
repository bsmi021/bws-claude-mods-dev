"""Render Raster cell words (JSON from a draw script) to a PNG the way a terminal paints them:
each cell is a glyph in its foreground colour over its background colour. Not a live terminal screenshot.

    python spike-render.py cells.json out.png
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

CW, CH = 10, 20
DEFAULT_FG, DEFAULT_BG = (204, 204, 204), (12, 12, 12)
FONT = ImageFont.truetype("C:/Windows/Fonts/CascadiaMono.ttf", 16)


def color(c: int, default):
    if c == 0x01000000:
        return default
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255)


def main(src: str, out: str) -> None:
    d = json.load(open(src, encoding="utf-8"))
    W, R, words = d["columns"], d["rows"], d["words"]
    img = Image.new("RGB", (W * CW, R * CH), DEFAULT_BG)
    g = ImageDraw.Draw(img)
    for r in range(R):
        for c in range(W):
            i = (r * W + c) * 3
            cp, fg, bg = words[i], color(words[i + 1], DEFAULT_FG), color(words[i + 2], DEFAULT_BG)
            x, y = c * CW, r * CH
            g.rectangle([x, y, x + CW - 1, y + CH - 1], fill=bg)
            if cp == 0x2580:  # upper half block: fg on the top half
                g.rectangle([x, y, x + CW - 1, y + CH // 2 - 1], fill=fg)
            elif cp != 0x20:
                g.text((x, y + 1), chr(cp), font=FONT, fill=fg)
    img.save(out)
    print(f"wrote {out} ({W}x{R} cells)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
