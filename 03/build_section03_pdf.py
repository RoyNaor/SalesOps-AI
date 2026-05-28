#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)
from reportlab.pdfbase.pdfmetrics import stringWidth


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "section-03-architecture-explanation.md"
OUTPUT = ROOT / "section-03-architecture-explanation.pdf"


ACCENT = colors.HexColor("#1a5c4a")
SLATE  = colors.HexColor("#17324d")
TEXT   = colors.HexColor("#20252b")
MUTED  = colors.HexColor("#5b6570")
RULE   = colors.HexColor("#c8e6df")


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def inline_markup(text: str) -> str:
    text = escape(text)
    text = re.sub(r"`([^`]+)`", r"<font face='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def make_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            textColor=SLATE,
            spaceAfter=10,
            alignment=TA_LEFT,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13.2,
            leading=16,
            textColor=ACCENT,
            spaceBefore=11,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.6,
            leading=13.2,
            textColor=TEXT,
            spaceAfter=6,
        ),
        "lead": ParagraphStyle(
            "Lead",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10.4,
            leading=14.4,
            textColor=TEXT,
            spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=12.6,
            textColor=TEXT,
            leftIndent=15,
            firstLineIndent=-8,
            bulletIndent=2,
            spaceAfter=3.5,
        ),
    }


def split_long_code_spans(line: str, max_width: float, font_size: float) -> str:
    parts = []
    for token in line.split(" "):
        clean = token.strip("`")
        if stringWidth(clean, "Courier", font_size) > max_width:
            token = token.replace("/", "/ ").replace("-", "- ")
        parts.append(token)
    return " ".join(parts)


def markdown_to_story(markdown: str):
    styles = make_styles()
    story = []
    paragraph_lines: list[str] = []
    first_para_after_title = True

    def flush_paragraph():
        nonlocal first_para_after_title
        if not paragraph_lines:
            return
        text = " ".join(paragraph_lines).strip()
        style = styles["lead"] if first_para_after_title else styles["body"]
        story.append(Paragraph(inline_markup(text), style))
        paragraph_lines.clear()
        first_para_after_title = False

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        if not line:
            flush_paragraph()
            continue

        if line.startswith(("Source of truth:", "Audience:", "Language:")):
            continue

        if line.startswith("# "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[2:].strip()), styles["title"]))
            story.append(Spacer(1, 0.12 * cm))
            continue

        if line.startswith("## "):
            flush_paragraph()
            text = line[3:].strip()
            if text.startswith("1. High-Level Architecture"):
                story.append(Spacer(1, 0.08 * cm))
            story.append(Paragraph(inline_markup(text), styles["h2"]))
            continue

        if line.startswith("- "):
            flush_paragraph()
            bullet_text = split_long_code_spans(line[2:].strip(), 8.5 * cm, 9.3)
            story.append(Paragraph(inline_markup(bullet_text), styles["bullet"], bulletText="-"))
            continue

        if re.match(r"^\d+\. ", line):
            flush_paragraph()
            number, text = line.split(". ", 1)
            story.append(Paragraph(inline_markup(text), styles["bullet"], bulletText=f"{number}."))
            continue

        paragraph_lines.append(line)

    flush_paragraph()
    return story


def footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 1.45 * cm, width - doc.rightMargin, 1.45 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 1.05 * cm, "Group - E  |  SalesOps AI  |  Section 03")
    canvas.drawRightString(width - doc.rightMargin, 1.05 * cm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf():
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=1.65 * cm,
        leftMargin=1.65 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.85 * cm,
        title="Group - E | SalesOps AI | Section 03",
        author="Group E",
        subject="Section 03 Architecture Explanation",
    )
    story = markdown_to_story(SOURCE.read_text(encoding="utf-8"))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
