from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "section-07-user-guide.md"
OUTPUT = ROOT / "section-07-user-guide.pdf"


def inline_markup(text: str) -> str:
    safe = html.escape(text)
    safe = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', safe)
    safe = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", safe)
    return safe


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DocTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=30,
            textColor=colors.HexColor("#17324d"),
            spaceAfter=14,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#1a5c4a"),
            spaceBefore=16,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "Heading3Custom",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12.4,
            leading=15.5,
            textColor=colors.HexColor("#17324d"),
            spaceBefore=12,
            spaceAfter=6,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.6,
            leading=12.4,
            textColor=colors.HexColor("#20252b"),
            spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=12,
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
            fontSize=9.4,
            leading=12,
            leftIndent=24,
            firstLineIndent=-15,
            bulletIndent=8,
            textColor=colors.HexColor("#20252b"),
            spaceAfter=2.5,
        ),
        "caption": ParagraphStyle(
            "Caption",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.4,
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
            fontSize=8.4,
            leading=10.4,
            textColor=colors.HexColor("#5b6570"),
            spaceAfter=3,
        ),
    }


def image_flowable(path: Path):
    max_width = 6.55 * inch
    max_height = 3.95 * inch
    img = Image(str(path))
    scale = min(max_width / img.imageWidth, max_height / img.imageHeight)
    img.drawWidth = img.imageWidth * scale
    img.drawHeight = img.imageHeight * scale
    img.hAlign = "CENTER"
    return img


def parse_markdown(markdown: str):
    styles = build_styles()
    story = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()

        if not line:
            story.append(Spacer(1, 0.045 * inch))
            continue

        if line == "---":
            story.append(PageBreak())
            continue

        image_match = re.match(r"^!\[(.*?)\]\((.*?)\)$", line)
        if image_match:
            alt, rel_path = image_match.groups()
            img_path = (ROOT / rel_path).resolve()
            story.append(Spacer(1, 0.08 * inch))
            story.append(image_flowable(img_path))
            story.append(Paragraph(inline_markup(alt), styles["caption"]))
            continue

        if line.startswith("# "):
            story.append(Paragraph(inline_markup(line[2:]), styles["title"]))
            story.append(Spacer(1, 0.06 * inch))
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

    return story


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = LETTER
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5b6570"))
    canvas.drawString(doc.leftMargin, height - 0.42 * inch, "Group - E  |  SalesOps AI  |  Section 07")
    canvas.drawRightString(width - doc.rightMargin, 0.42 * inch, f"Page {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#d7e3e7"))
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
        title="Group - E | SalesOps AI | Section 07",
        author="Group E",
        subject="Section 07 User Guide",
    )
    doc.build(parse_markdown(markdown), onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
