#!/usr/bin/env python3
"""Generates public/components-map.svg: Startup Funding Pulse as a swimlane "Components Map"
(lanes = who/what does the work, columns = Trigger / Input / Context / Processing / AI / Output).
   python3 scripts/build-components-map.py"""
from pathlib import Path
from xml.sax.saxutils import escape

LABEL_W, COL_W, TOP, HEAD_H, PAD = 168, 214, 64, 40, 24
COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"]
SLOT = 102  # box height + gap
LANES = [  # (name, subtitle, slots, band colour)
    ("Scheduler", "(Vercel Cron)", 2, "#e4e7fb"),
    ("News sources", "(RSS / roundups)", 3, "#dcf0ee"),
    ("System", "(Vercel + Supabase)", 3, "#fbf1cf"),
    ("AI models", "(Gemini Flash)", 3, "#e2f2df"),
    ("Email service", "(Resend)", 1, "#fbe1e6"),
    ("Aarav", "(Venture scout)", 1, "#fde8d6"),
]
FILL = {0: ("#c9cffa", "#5a63c8"), 1: ("#bfe6e1", "#2a8f86"), 2: ("#f6e29a", "#b58a00"),
        3: ("#c9e8c2", "#3f8f33"), 4: ("#f7c3cd", "#c2415d"), 5: ("#f9d0ae", "#c0661a")}
BW, BH, BGAP = 188, 84, 12

def lane_h(slots): return 128 if slots == 1 else slots * SLOT + 12
lane_y, y = [], TOP + HEAD_H
for _, _, n, _ in LANES:
    lane_y.append(y); y += lane_h(n)
H = y + 78
W = LABEL_W + COL_W * len(COLS) + PAD

boxes = {}
def box(id_, lane, col, lines, slot=0):
    n = LANES[lane][2]
    by = lane_y[lane] + (lane_h(n) - BH) / 2 if n == 1 else lane_y[lane] + BGAP + slot * SLOT
    boxes[id_] = dict(x=LABEL_W + col * COL_W + (COL_W - BW) / 2, y=by, lane=lane, col=col, lines=lines)

# Scheduler
box("S1", 0, 0, ["Daily cron, 06:00 IST", "ingest every day; Sunday", "reconciles, Monday briefs"], 0)
box("S2", 0, 0, ["Monday retry, 07:00 IST", "sends the brief only if", "the 06:00 run did not"], 1)
# News sources
box("R1", 1, 1, ["Tier 1: Indian media", "Inc42, YourStory, Entrackr,", "ET Tech: RSS + full text"], 0)
box("R2", 1, 1, ["Tier 2: Google News", "queries built from Aarav's", "sectors + watchlist names"], 1)
box("R3", 1, 2, ["Tier 3: weekly roundups", "Entrackr report, Inc42 Galore:", "verification, never ingested"], 2)
# System
box("Y1", 2, 2, ["Config + watchlist", "edited by Aarav in /config,", "applied on the next ingest"], 0)
box("Y2", 2, 3, ["Pre-filter + enrich", "funding-signal regex, robots-", "aware full text, URL cache"], 0)
box("Y6", 2, 3, ["Reconcile (Sunday)", "match roundup deals, add the", "missed, coverage % per week"], 1)
box("Y3", 2, 5, ["Normalise + dedupe", "FX + units in code, IST weeks,", "name / amount / date merge"], 0)
box("Y4", 2, 5, ["Deals stored + ranked", "confidence, score vs config,", "Realtime feed to dashboard"], 1)
box("Y5", 2, 5, ["Brief built + archived", "stats in code, HTML + text,", "one stored copy per week"], 2)
# AI
box("G1", 3, 4, ["Extraction", "structured JSON, temp 0; quotes", "must be verbatim; roundups"], 0)
box("G2", 3, 4, ["Adjacency + tie-breaks", "competitor / adjacent vs the", "watchlist; sector; same-deal"], 1)
box("G3", 3, 4, ["Pattern narration", "numbers computed in code;", "ungrounded insights dropped"], 2)
# Email + user
box("E1", 4, 5, ["Monday digest", "HTML + plain text, numbered", "sources, watchlist alerts"])
box("A1", 5, 0, ["Sets his focus (/config)", "sectors, stages, cheque range,", "watchlist, weights; passcode"])
box("A2", 5, 5, ["Reads brief, explores", "inbox before 8 AM; terminal UI,", "3D capital map, command bar"])

def pt(b, side):
    b = boxes[b]; x, y = b["x"], b["y"]
    return {"r": (x + BW, y + BH / 2), "l": (x, y + BH / 2), "t": (x + BW / 2, y), "b": (x + BW / 2, y + BH)}[side]
def bnd(col): return LABEL_W + col * COL_W  # x of the boundary at the left edge of a column
GUT = lambda k: W - PAD / 2 - k

def arrow(a, b, via=None):
    A, B = boxes[a], boxes[b]
    if A["col"] < B["col"]:
        (x1, y1), (x2, y2) = pt(a, "r"), pt(b, "l")
        mx = via if via is not None else (x1 + x2) / 2
        d = f"M{x1:.0f},{y1:.0f} H{mx:.0f} V{y2:.0f} H{x2:.0f}"
    else:
        down = B["y"] > A["y"]
        (x1, y1), (x2, y2) = pt(a, "b" if down else "t"), pt(b, "t" if down else "b")
        d = f"M{x1:.0f},{y1:.0f} V{y2:.0f}"
    return f'<path d="{d}" fill="none" stroke="#5f5f5f" stroke-width="1.6" stroke-dasharray="6 4" marker-end="url(#ah)"/>'

def gutter(a, b, k):  # out of A's right edge, down the right gutter, into B's right edge
    (x1, y1), (x2, y2) = pt(a, "r"), pt(b, "r")
    d = f"M{x1:.0f},{y1:.0f} H{GUT(k):.0f} V{y2:.0f} H{x2 + 1:.0f}"
    return f'<path d="{d}" fill="none" stroke="#5f5f5f" stroke-width="1.6" stroke-dasharray="6 4" marker-end="url(#ah)"/>'

o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">',
     '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#5f5f5f"/></marker></defs>',
     f'<rect width="{W}" height="{H}" fill="#f8f4ed"/>',
     f'<text x="{W/2}" y="40" text-anchor="middle" font-size="23" font-weight="700" fill="#2b211a">Startup Funding Pulse · Components Map</text>']
for i, (name, sub, n, col) in enumerate(LANES):
    h = lane_h(n)
    o.append(f'<rect x="{LABEL_W}" y="{lane_y[i]}" width="{COL_W*len(COLS)}" height="{h}" fill="{col}"/>')
    o.append(f'<rect x="{PAD/2}" y="{lane_y[i]}" width="{LABEL_W-PAD/2}" height="{h}" fill="#5b4a3b"/>')
    cx = PAD / 2 + (LABEL_W - PAD / 2) / 2
    o.append(f'<text x="{cx}" y="{lane_y[i]+h/2-2}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">{escape(name)}</text>')
    o.append(f'<text x="{cx}" y="{lane_y[i]+h/2+16}" text-anchor="middle" font-size="11" fill="#e8dccf">{escape(sub)}</text>')
o.append(f'<rect x="{PAD/2}" y="{TOP}" width="{W-PAD}" height="{HEAD_H}" fill="#5b4a3b"/>')
o.append(f'<text x="{PAD/2+(LABEL_W-PAD/2)/2}" y="{TOP+25}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">Actor</text>')
for c, name in enumerate(COLS):
    cx = LABEL_W + c * COL_W
    o.append(f'<text x="{cx+COL_W/2}" y="{TOP+25}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">{name}</text>')
    if c: o.append(f'<line x1="{cx}" y1="{TOP+HEAD_H}" x2="{cx}" y2="{y}" stroke="#fff" stroke-width="2"/>')

# arrows first so boxes sit on top
arrows = [
    arrow("S1", "R1"), arrow("S1", "R2"),
    arrow("R1", "Y2", via=bnd(3) - 8), arrow("R2", "Y2", via=bnd(3) - 8), arrow("Y1", "Y2"),
    arrow("R3", "Y6", via=bnd(3) + 8), arrow("Y2", "G1", via=bnd(4) - 4),
    arrow("G1", "Y3", via=bnd(5) - 8), arrow("G2", "Y4", via=bnd(5) + 2), arrow("Y6", "Y4"),
    arrow("Y3", "Y4"), arrow("Y4", "Y5"), arrow("Y5", "E1"), arrow("G3", "E1", via=bnd(5) + 10),
    arrow("E1", "A2"), arrow("A1", "Y1", via=bnd(2) - 6),
    gutter("S2", "Y5", 8), gutter("Y4", "A2", 22),
]
o += arrows
lane_of = lambda b: boxes[b]["lane"]
for id_, b in boxes.items():
    fill, stroke = FILL[b["lane"]]
    o.append(f'<rect x="{b["x"]:.0f}" y="{b["y"]:.0f}" width="{BW}" height="{BH}" rx="9" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
    for k, line in enumerate(b["lines"]):
        o.append(f'<text x="{b["x"]+BW/2:.0f}" y="{b["y"]+26+k*19:.0f}" text-anchor="middle" font-size="{14 if k==0 else 11.5}" font-weight="{700 if k==0 else 400}" fill="#2b211a">{escape(line)}</text>')
foot = ["Accuracy: headlines discover, full articles describe, roundups verify. Gemini never converts currency or computes stats; every quoted evidence sentence is checked as a verbatim substring.",
        "Honesty: rumoured deals are excluded from totals; coverage only counts deals with a non-roundup source; week-on-week is shown only when the prior week has 5+ deals. Dashed arrows = data / control flow."]
for i, t in enumerate(foot):
    o.append(f'<text x="{PAD/2}" y="{y+30+i*20}" font-size="12" fill="#4a3d33">{escape(t)}</text>')
o.append("</svg>")
out = Path(__file__).resolve().parent.parent / "public" / "components-map.svg"
out.parent.mkdir(exist_ok=True); out.write_text("\n".join(o)); print("wrote", out, f"{W}x{H}")
