#!/usr/bin/env python3
"""Deterministic Skilit identity assets.

The S silhouette was reconstructed from the founder-approved two-logo
reference on 2026-10-17. The points below are editable vector source data,
not a reference to an external branding library.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
WORDMARK = json.loads((ROOT / "docs/brand/wordmark-inter-tight-600.json").read_text())
WORDMARK_PATH = WORDMARK["path"]
PUBLIC = ROOT / "apps/web/public/brand"
PUBLIC.mkdir(parents=True, exist_ok=True)

# Approved organic S outline, relative to its 281 x 377 source box.
POINTS = [
    (267, 6), (248, 0), (226, 1), (149, 27), (68, 68), (22, 105),
    (12, 124), (11, 144), (28, 169), (69, 188), (144, 204),
    (151, 209), (145, 218), (56, 252), (14, 279), (1, 300),
    (0, 320), (6, 334), (23, 351), (46, 363), (89, 374),
    (131, 376), (157, 369), (170, 358), (173, 341), (165, 331),
    (134, 318), (130, 306), (146, 295), (243, 255),
    (268, 234), (276, 218), (277, 199), (271, 184),
    (257, 169), (229, 154), (134, 127), (126, 119),
    (132, 110), (265, 60), (280, 38), (279, 20),
]

ORANGE = "#FF6A1F"
ORANGE_FIELD = "#FF782D"
CREAM = "#FAF8F5"
INK = "#0F0F0F"

def outline():
    coords = POINTS
    n = len(coords)
    parts = [f"M {coords[0][0]} {coords[0][1]}"]
    for i in range(n):
        a, b, c, dd = (coords[(i - 1) % n], coords[i], coords[(i + 1) % n], coords[(i + 2) % n])
        c1 = (b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6)
        c2 = (c[0] - (dd[0] - b[0]) / 6, c[1] - (dd[1] - b[1]) / 6)
        parts.append(f"C {c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {c[0]} {c[1]}")
    return " ".join(parts) + " Z"

PATH = outline()
def svg(view_box, children, label):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" role="img" '
        f'aria-label="{label}">\n{children}\n</svg>\n'
    )

for name, color in [("skilit-mark-orange.svg", ORANGE), ("skilit-mark-black.svg", INK)]:
    (PUBLIC / name).write_text(svg("0 0 281 377", f'<path d="{PATH}" fill="{color}"/>', "Skilit S mark"))

# Both official full lockups share the exact geometry: no shadows/gradients.
for name, background, mark, text_color in [
    ("skilit-lockup-light.svg", CREAM, ORANGE, INK),
    ("skilit-lockup-orange.svg", ORANGE_FIELD, INK, INK),
]:
    children = (
        f'<rect width="1024" height="384" fill="{background}"/>\n'
        f'<path d="{PATH}" transform="translate(126 78) scale(.60)" fill="{mark}"/>\n'
        f'<path d="{WORDMARK_PATH}" transform="translate(364 241)" '
        f'data-wordmark="skilit" fill="{text_color}"/>'
    )
    (PUBLIC / name).write_text(svg("0 0 1024 384", children, "Skilit logo"))

icon = (
    f'<rect x="0" y="0" width="64" height="64" rx="14" fill="{CREAM}"/>'
    f'<path d="{PATH}" transform="translate(17 7) scale(.13)" fill="{ORANGE}"/>'
)
(ROOT / "apps/web/app/icon.svg").write_text(svg("0 0 64 64", icon, "Skilit app icon"))


# Exact shape + palette also drive social/repository preview images.
# These are brand *compositions*, not new marks: the logo never changes.
for name, background, mark, foreground, secondary in [
    ("skilit-social-light.svg", CREAM, ORANGE, INK, "#5C5F61"),
    ("skilit-social-orange.svg", ORANGE_FIELD, INK, INK, "#49372E"),
]:
    children = (
        f'<rect width="1200" height="630" fill="{background}"/>\n'
        f'<path d="{PATH}" transform="translate(146 106) scale(1.08)" fill="{mark}"/>\n'
        f'<path d="{WORDMARK_PATH}" transform="translate(540 295)" '
        f'data-wordmark="skilit" fill="{foreground}"/>\n'
        f'<rect x="546" y="322" width="522" height="2" fill="{foreground}" opacity=".16"/>\n'
        f'<text x="547" y="377" font-family="Arial, Helvetica, sans-serif" '
        f'font-size="22" font-weight="700" letter-spacing="4" fill="{foreground}">DESIGN INTELLIGENCE</text>\n'
        f'<text x="547" y="427" font-family="Arial, Helvetica, sans-serif" '
        f'font-size="25" font-weight="400" fill="{secondary}">For humans and AI agents</text>\n'
        f'<text x="547" y="533" font-family="Arial, Helvetica, sans-serif" '
        f'font-size="17" letter-spacing="2" fill="{secondary}">LOCAL-FIRST  /  AGENT-READY</text>'
    )
    (PUBLIC / name).write_text(svg("0 0 1200 630", children, "Skilit social preview"))

print("Generated 7 consistent, flat Skilit brand SVG assets")
