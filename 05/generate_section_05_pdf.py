from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "section-05-features-use-cases.md"
OUTPUT = ROOT / "section-05-features-use-cases.pdf"


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
            fontSize=24,
            leading=29,
            textColor=colors.HexColor("#17324d"),
            spaceAfter=14,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#1f5f72"),
            spaceBefore=16,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "FeatureHeading",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12.4,
            leading=15.5,
            textColor=colors.HexColor("#17324d"),
            backColor=colors.HexColor("#eef6f8"),
            borderPadding=(5, 6, 5),
            spaceBefore=13,
            spaceAfter=8,
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
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=10.2,
            textColor=colors.HexColor("#5b6570"),
            spaceAfter=3,
        ),
    }


def parse_markdown(markdown: str):
    styles = build_styles()
    story = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()

        if not line:
            story.append(Spacer(1, 0.055 * inch))
            continue

        if line == "---":
            story.append(PageBreak())
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

        style_name = "small" if line.startswith("Source of truth:") else "body"
        story.append(Paragraph(inline_markup(line), styles[style_name]))

    return story


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = LETTER
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5b6570"))
    canvas.drawString(doc.leftMargin, height - 0.42 * inch, "SalesOps AI - Section 05 Feature and Use Case List")
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
        title="SalesOps AI Section 05 Feature and Use Case List",
        author="SalesOps AI Team",
        subject="Final project submission section 05",
    )
    doc.build(parse_markdown(markdown), onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
