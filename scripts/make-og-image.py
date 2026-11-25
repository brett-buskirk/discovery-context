"""Draws public/og-image.png, the 1200x630 preview image shown when the site's link is shared.

Not part of the build: run it by hand when the design changes. Needs Pillow and the Lato font
(fonts-lato on Debian/Ubuntu):

    python3 -m venv /tmp/ogvenv && /tmp/ogvenv/bin/pip install pillow
    /tmp/ogvenv/bin/python scripts/make-og-image.py

The colours are the site's dark theme. The bars are the "long order history" recording's real input
tokens per call, so the picture shows the actual growth the site is about.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
PAPER, SHEET, INK, MUTED, LINE = "#0F1E2C", "#162A3C", "#E6EDF3", "#9DB0C0", "#33495C"
RESENT, NEW = "#1b64be", "#84b9f3"  # the dark theme's validated chart ramp
FONTS = Path("/usr/share/fonts/truetype/lato")

# Input tokens per call from src/recordings/sonnet-long-order-history.json.
CALLS = [1685, 1790, 2347, 2995, 3380, 3641, 3924]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def main() -> None:
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # Text, left column.
    d.text((72, 92), "AI DISCOVERY SERIES", font=font("Lato-Bold.ttf", 26), fill=MUTED)
    title = font("Lato-Black.ttf", 80)
    d.text((72, 128), "Context", font=title, fill=INK)
    d.text((72, 216), "Discovery", font=title, fill=INK)
    body = font("Lato-Regular.ttf", 32)
    for i, line in enumerate(["See what an AI agent actually", "sends and receives, one API", "call at a time."]):
        d.text((72, 336 + i * 44), line, font=body, fill=INK)
    d.text((72, 520), "brett-buskirk.github.io/discovery-context", font=font("Lato-Medium.ttf", 24), fill=MUTED)

    # Chart card, right column: each bar is one API call; the light top is what's new, the rest is resent.
    card = (680, 92, 1128, 560)
    d.rounded_rectangle(card, radius=18, fill=SHEET, outline=LINE, width=2)
    d.text((712, 118), "Input tokens per API call", font=font("Lato-Bold.ttf", 24), fill=INK)
    left, right, top, base = 716, 1092, 180, 500
    d.line((left, base, right, base), fill=MUTED, width=2)
    slot = (right - left) / len(CALLS)
    bar_w = slot * 0.62
    peak = 4000
    previous = 0
    for i, tokens in enumerate(CALLS):
        x0 = left + slot * i + (slot - bar_w) / 2
        x1 = x0 + bar_w
        h_total = (tokens / peak) * (base - top)
        h_resent = (previous / peak) * (base - top)
        if h_resent:
            d.rectangle((x0, base - h_resent, x1, base), fill=RESENT)
        # The new part sits on top with a surface gap, and carries the rounded end.
        d.rounded_rectangle((x0, base - h_total, x1, base - h_resent - (3 if h_resent else 0)), radius=5, fill=NEW)
        previous = tokens
    legend = font("Lato-Regular.ttf", 20)
    d.rectangle((716, 522, 732, 538), fill=RESENT)
    d.text((740, 517), "resent", font=legend, fill=MUTED)
    d.rectangle((830, 522, 846, 538), fill=NEW)
    d.text((854, 517), "new", font=legend, fill=MUTED)

    out = Path(__file__).resolve().parent.parent / "public" / "og-image.png"
    img.save(out, optimize=True)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
