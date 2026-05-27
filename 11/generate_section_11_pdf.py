from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "section-11-developer-reference.md"
OUTPUT = ROOT / "section-11-developer-reference.pdf"

TEAL = colors.HexColor("#1a5c4a")
TEAL_LIGHT = colors.HexColor("#c8e6df")
SLATE = colors.HexColor("#17324d")
MUTED = colors.HexColor("#5b6570")
CODE_BG = colors.HexColor("#f2f5f3")
CODE_FG = colors.HexColor("#1a3a28")
ROW_A = colors.HexColor("#f5faf8")
ROW_B = colors.white
GRID = colors.HexColor("#c5ddd7")
AMBER = colors.HexColor("#c87a10")


def inline_markup(text: str) -> str:
    safe = html.escape(text)
    safe = re.sub(r"`([^`]+)`", r'<font name="Courier" fontSize="8.4" color="#1a3a28">\1</font>', safe)
    safe = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", safe)
    safe = re.sub(r"\\\|", "|", safe)
    return safe


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("DocTitle", parent=base["Title"],
                                fontName="Helvetica-Bold", fontSize=22, leading=28,
                                textColor=SLATE, spaceAfter=10),
        "h2": ParagraphStyle("H2", parent=base["Heading2"],
                             fontName="Helvetica-Bold", fontSize=14, leading=18,
                             textColor=TEAL, spaceBefore=18, spaceAfter=6, keepWithNext=True),
        "h3": ParagraphStyle("H3", parent=base["Heading3"],
                             fontName="Helvetica-Bold", fontSize=11.5, leading=14.5,
                             textColor=SLATE, spaceBefore=12, spaceAfter=5, keepWithNext=True),
        "body": ParagraphStyle("Body", parent=base["BodyText"],
                               fontName="Helvetica", fontSize=9.2, leading=12,
                               textColor=colors.HexColor("#20252b"), spaceAfter=4),
        "bullet": ParagraphStyle("Bullet", parent=base["BodyText"],
                                 fontName="Helvetica", fontSize=9.0, leading=11.5,
                                 leftIndent=16, firstLineIndent=-8,
                                 textColor=colors.HexColor("#20252b"), spaceAfter=2.5),
        "number": ParagraphStyle("Number", parent=base["BodyText"],
                                 fontName="Helvetica", fontSize=9.0, leading=11.5,
                                 leftIndent=22, firstLineIndent=-13,
                                 textColor=colors.HexColor("#20252b"), spaceAfter=2),
        "code": ParagraphStyle("Code", parent=base["BodyText"],
                               fontName="Courier", fontSize=8.0, leading=10.5,
                               leftIndent=10, rightIndent=10,
                               textColor=CODE_FG, backColor=CODE_BG,
                               spaceAfter=1, spaceBefore=1),
        "caption": ParagraphStyle("Caption", parent=base["BodyText"],
                                  fontName="Helvetica-Oblique", fontSize=8.0, leading=10,
                                  alignment=1, textColor=MUTED, spaceBefore=2, spaceAfter=6),
        "small": ParagraphStyle("Small", parent=base["BodyText"],
                                fontName="Helvetica", fontSize=8.0, leading=10,
                                textColor=MUTED, spaceAfter=3),
        "th": ParagraphStyle("TH", parent=base["BodyText"],
                              fontName="Helvetica-Bold", fontSize=8.4, leading=11,
                              textColor=colors.white),
        "td": ParagraphStyle("TD", parent=base["BodyText"],
                              fontName="Helvetica", fontSize=8.2, leading=10.5,
                              textColor=colors.HexColor("#20252b")),
        "td_code": ParagraphStyle("TDCode", parent=base["BodyText"],
                                  fontName="Courier", fontSize=7.8, leading=10,
                                  textColor=CODE_FG),
    }


def make_table(headers: list[str], rows: list[list[str]], styles_map: dict,
               avail_width: float = 6.4 * inch) -> Table:
    n = len(headers)
    col_w = avail_width / n

    def cell_style(text: str) -> ParagraphStyle:
        t = text.strip()
        if t.startswith("`") or t.startswith("/") or t.startswith("POST") or t.startswith("GET") \
                or t.startswith("PUT") or t.startswith("salesops") or t.startswith("aws") \
                or t.startswith('"') or t.startswith("ISSUE"):
            return styles_map["td_code"]
        return styles_map["td"]

    data = [[Paragraph(inline_markup(h), styles_map["th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(inline_markup(c), cell_style(c)) for c in row])

    t = Table(data, colWidths=[col_w] * n, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [ROW_A, ROW_B]),
        ("GRID", (0, 0), (-1, -1), 0.35, GRID),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def parse_markdown(markdown: str, styles_map: dict) -> list:
    story = []
    in_code = False
    in_table = False
    table_headers: list[str] = []
    table_rows: list[list[str]] = []

    def flush_table():
        nonlocal in_table, table_headers, table_rows
        if table_headers:
            story.append(Spacer(1, 0.04 * inch))
            story.append(make_table(table_headers, table_rows, styles_map))
            story.append(Spacer(1, 0.07 * inch))
        table_headers.clear()
        table_rows.clear()
        in_table = False

    for raw in markdown.splitlines():
        line = raw.rstrip()

        if line.startswith("```"):
            if in_table:
                flush_table()
            if in_code:
                story.append(Spacer(1, 0.04 * inch))
                in_code = False
            else:
                in_code = True
                story.append(Spacer(1, 0.03 * inch))
            continue

        if in_code:
            story.append(Paragraph(html.escape(line) if line else " ", styles_map["code"]))
            continue

        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if all(re.match(r"^[-: ]+$", c) for c in cells):
                continue
            if not in_table:
                in_table = True
                table_headers = cells
            else:
                table_rows.append(cells)
            continue

        if in_table:
            flush_table()

        if not line:
            story.append(Spacer(1, 0.035 * inch))
            continue

        if line == "---":
            story.append(HRFlowable(width="100%", thickness=0.5, color=TEAL_LIGHT,
                                    spaceAfter=6, spaceBefore=10))
            continue

        m_img = re.match(r"^!\[(.*?)\]\((.*?)\)$", line)
        if m_img:
            continue

        if line.startswith("# "):
            story.append(Paragraph(inline_markup(line[2:]), styles_map["title"]))
            story.append(Spacer(1, 0.04 * inch))
            continue

        if line.startswith("## "):
            story.append(Paragraph(inline_markup(line[3:]), styles_map["h2"]))
            continue

        if line.startswith("### "):
            story.append(Paragraph(inline_markup(line[4:]), styles_map["h3"]))
            continue

        m_num = re.match(r"^(\d+)\.\s+(.*)$", line)
        if m_num:
            story.append(Paragraph(inline_markup(m_num.group(2)), styles_map["number"],
                                   bulletText=f"{m_num.group(1)}."))
            continue

        if line.startswith("- "):
            story.append(Paragraph(inline_markup(line[2:]), styles_map["bullet"],
                                   bulletText="–"))
            continue

        style = "small" if line.startswith(("Source of truth:", "Audience:")) else "body"
        story.append(Paragraph(inline_markup(line), styles_map[style]))

    if in_table:
        flush_table()

    return story


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = LETTER
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, h - 0.40 * inch, "SalesOps AI — Section 11 Developer Reference")
    canvas.drawRightString(w - doc.rightMargin, 0.40 * inch, f"Page {doc.page}")
    canvas.setStrokeColor(TEAL_LIGHT)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, h - 0.48 * inch, w - doc.rightMargin, h - 0.48 * inch)
    canvas.restoreState()


def main():
    markdown = SOURCE.read_text(encoding="utf-8")
    styles_map = build_styles()
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=0.70 * inch,
        leftMargin=0.70 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.64 * inch,
        title="SalesOps AI Section 11 Developer Reference",
        author="SalesOps AI Team",
        subject="Final project submission section 11",
    )
    doc.build(parse_markdown(markdown, styles_map),
              onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
