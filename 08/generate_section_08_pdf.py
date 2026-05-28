from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "section-08-admin-guide.md"
OUTPUT = ROOT / "section-08-admin-guide.pdf"


def inline_markup(text: str) -> str:
    safe = html.escape(text)
    safe = re.sub(r"`([^`]+)`", r'<font name="Courier" fontSize="9">\1</font>', safe)
    safe = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", safe)
    return safe


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DocTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=29,
            textColor=colors.HexColor("#17324d"),
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#1a5c4a"),
            spaceBefore=16,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "Heading3Custom",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11.8,
            leading=14.8,
            textColor=colors.HexColor("#17324d"),
            spaceBefore=12,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=12.2,
            textColor=colors.HexColor("#20252b"),
            spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=11.8,
            leftIndent=18,
            firstLineIndent=-9,
            bulletIndent=7,
            textColor=colors.HexColor("#20252b"),
            spaceAfter=3,
        ),
        "number": ParagraphStyle(
            "Number",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=11.8,
            leftIndent=24,
            firstLineIndent=-15,
            bulletIndent=8,
            textColor=colors.HexColor("#20252b"),
            spaceAfter=2.5,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["BodyText"],
            fontName="Courier",
            fontSize=8.4,
            leading=11,
            leftIndent=14,
            textColor=colors.HexColor("#1a3a1a"),
            backColor=colors.HexColor("#f0f5f0"),
            spaceAfter=2,
            spaceBefore=2,
        ),
        "caption": ParagraphStyle(
            "Caption",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.2,
            leading=10,
            alignment=1,
            textColor=colors.HexColor("#5b6570"),
            spaceBefore=3,
            spaceAfter=8,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=10.2,
            textColor=colors.HexColor("#5b6570"),
            spaceAfter=3,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.8,
            leading=11,
            textColor=colors.HexColor("#ffffff"),
        ),
        "table_cell": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.6,
            leading=11,
            textColor=colors.HexColor("#20252b"),
        ),
        "table_code": ParagraphStyle(
            "TableCode",
            parent=base["BodyText"],
            fontName="Courier",
            fontSize=8.0,
            leading=10,
            textColor=colors.HexColor("#1a3a1a"),
        ),
    }


def image_flowable(path: Path):
    max_width = 6.4 * inch
    max_height = 3.8 * inch
    img = Image(str(path))
    scale = min(max_width / img.imageWidth, max_height / img.imageHeight)
    img.drawWidth = img.imageWidth * scale
    img.drawHeight = img.imageHeight * scale
    img.hAlign = "CENTER"
    return img


def build_markdown_table(header_row: list[str], data_rows: list[list[str]], styles_map: dict):
    col_count = len(header_row)
    avail = 6.4 * inch
    col_w = avail / col_count

    table_data = [[Paragraph(h, styles_map["table_header"]) for h in header_row]]
    for row in data_rows:
        style = styles_map["table_code"] if any(
            c.startswith("`") or c.startswith("aws ") or c.startswith("/aws/") or c.startswith("https://")
            for c in row
        ) else styles_map["table_cell"]
        table_data.append([Paragraph(inline_markup(c), style) for c in row])

    t = Table(table_data, colWidths=[col_w] * col_count, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a5c4a")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f5faf8"), colors.HexColor("#ffffff")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c5ddd7")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def parse_markdown(markdown: str):
    styles = build_styles()
    story = []
    in_code_block = False
    in_table = False
    table_headers: list[str] = []
    table_rows: list[list[str]] = []

    def flush_table():
        nonlocal in_table, table_headers, table_rows
        if table_headers:
            story.append(Spacer(1, 0.05 * inch))
            story.append(build_markdown_table(table_headers, table_rows, styles))
            story.append(Spacer(1, 0.08 * inch))
        table_headers = []
        table_rows = []
        in_table = False

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()

        if line.startswith("```"):
            if in_table:
                flush_table()
            if in_code_block:
                story.append(Spacer(1, 0.05 * inch))
                in_code_block = False
            else:
                in_code_block = True
                story.append(Spacer(1, 0.04 * inch))
            continue

        if in_code_block:
            display = line if line else " "
            story.append(Paragraph(html.escape(display), styles["code"]))
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
            story.append(Spacer(1, 0.04 * inch))
            continue

        if line == "---":
            story.append(PageBreak())
            continue

        image_match = re.match(r"^!\[(.*?)\]\((.*?)\)$", line)
        if image_match:
            alt, rel_path = image_match.groups()
            img_path = (ROOT / rel_path).resolve()
            if img_path.exists():
                story.append(Spacer(1, 0.07 * inch))
                story.append(image_flowable(img_path))
                story.append(Paragraph(inline_markup(alt), styles["caption"]))
            continue

        if line.startswith("# "):
            story.append(Paragraph(inline_markup(line[2:]), styles["title"]))
            story.append(Spacer(1, 0.05 * inch))
            continue

        if line.startswith("## "):
            story.append(Paragraph(inline_markup(line[3:]), styles["h2"]))
            continue

        if line.startswith("### "):
            story.append(Paragraph(inline_markup(line[4:]), styles["h3"]))
            continue

        number_match = re.match(r"^(\d+)\.\s+(.*)$", line)
        if number_match:
            story.append(
                Paragraph(
                    inline_markup(number_match.group(2)),
                    styles["number"],
                    bulletText=f"{number_match.group(1)}.",
                )
            )
            continue

        if line.startswith("- "):
            story.append(Paragraph(inline_markup(line[2:]), styles["bullet"], bulletText="-"))
            continue

        if line.startswith(("Source of truth:", "Audience:", "Language:", "Project:", "Prepared:")):
            continue
        story.append(Paragraph(inline_markup(line), styles["body"]))

    if in_table:
        flush_table()

    return story


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = LETTER
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5b6570"))
    canvas.drawString(doc.leftMargin, height - 0.42 * inch, "Group - E  |  SalesOps AI  |  Section 08")
    canvas.drawRightString(width - doc.rightMargin, 0.42 * inch, f"Page {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#c5ddd7"))
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, height - 0.50 * inch, width - doc.rightMargin, height - 0.50 * inch)
    canvas.restoreState()


def main():
    markdown = SOURCE.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=0.72 * inch,
        leftMargin=0.72 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.66 * inch,
        title="Group - E | SalesOps AI | Section 08",
        author="Group E",
        subject="Section 08 System Administrator Guide",
    )
    doc.build(parse_markdown(markdown), onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
