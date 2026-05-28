from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT   = Path(__file__).resolve().parent
OUTPUT = ROOT / "section-06-sizing-rationale.pdf"

TEAL   = colors.HexColor("#1a5c4a")
TEAL_L = colors.HexColor("#c8e6df")
SLATE  = colors.HexColor("#17324d")
MUTED  = colors.HexColor("#5b6570")
ROW_A  = colors.HexColor("#f5faf8")
ROW_B  = colors.white


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DocTitle", parent=base["Title"],
            fontName="Helvetica-Bold", fontSize=22, leading=28,
            textColor=SLATE, spaceAfter=10),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"],
            fontName="Helvetica-Bold", fontSize=14, leading=18,
            textColor=TEAL, spaceBefore=18, spaceAfter=6, keepWithNext=True),
        "h3": ParagraphStyle(
            "H3", parent=base["Heading3"],
            fontName="Helvetica-Bold", fontSize=11.5, leading=14.5,
            textColor=SLATE, spaceBefore=12, spaceAfter=5, keepWithNext=True),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"],
            fontName="Helvetica", fontSize=9.2, leading=12.5,
            textColor=colors.HexColor("#20252b"), spaceAfter=6),
        "th": ParagraphStyle(
            "TH", parent=base["BodyText"],
            fontName="Helvetica-Bold", fontSize=8.6, leading=11,
            textColor=colors.white),
        "td": ParagraphStyle(
            "TD", parent=base["BodyText"],
            fontName="Helvetica", fontSize=8.4, leading=11,
            textColor=colors.HexColor("#20252b")),
        "td_b": ParagraphStyle(
            "TDB", parent=base["BodyText"],
            fontName="Helvetica-Bold", fontSize=8.4, leading=11,
            textColor=SLATE),
    }


def hdr_ftr(canvas, doc):
    canvas.saveState()
    w, h = LETTER
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, h - 0.40 * inch,
                      "Group - E  |  SalesOps AI  |  Section 06")
    canvas.drawRightString(w - doc.rightMargin, 0.40 * inch, f"Page {doc.page}")
    canvas.setStrokeColor(TEAL_L)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, h - 0.48 * inch, w - doc.rightMargin, h - 0.48 * inch)
    canvas.restoreState()


def build_pdf():
    S = build_styles()
    story = []

    story.append(Paragraph(
        "Academic Lab Sizing &amp; Baseline Assumptions Document", S["title"]))
    story.append(Spacer(1, 0.06 * inch))
    story.append(Paragraph(
        "This document outlines the operational sizing calculations and architectural assumptions "
        "for the SalesOps AI cloud infrastructure. Designed as an academic lab deployment in the "
        "US East (N. Virginia) (us-east-1) region, these derivations mathematically justify the "
        "baseline parameters configured within the companion AWS Pricing Calculator configuration.",
        S["body"]))

    # ── Section 1 ──────────────────────────────────────────────────────────────
    story.append(Paragraph("1. Core Target Roles &amp; User Scale", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=TEAL_L, spaceAfter=6))
    story.append(Paragraph(
        "The infrastructure sizing model is dimensioned around an active deployment serving a "
        "baseline of 1,000 Monthly Active Users (MAU). The system targets two primary operational "
        "roles: <b>Reps (Sales or Service Representatives):</b> Users who participate in interactive "
        "customer simulation exams and receive AI-driven coaching and feedback. "
        "<b>Managers (Training Managers or Admins):</b> Users responsible for creating personas, "
        "simulation scenarios, and reviewing analytics dashboards.",
        S["body"]))

    # ── Section 2 ──────────────────────────────────────────────────────────────
    story.append(Paragraph("2. Architectural Sizing Calculations", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=TEAL_L, spaceAfter=6))

    story.append(Paragraph(
        "A. Amazon API Gateway &amp; AWS Lambda Invocations", S["h3"]))
    story.append(Paragraph(
        "The application exposes REST API endpoints through Amazon API Gateway connected to AWS "
        "Lambda serverless compute handlers. During active simulation exams, the client application "
        "performs periodic background synchronization requests to monitor session state and retrieve "
        "inbox events.",
        S["body"]))
    story.append(Paragraph(
        "<b>Operational Assumptions:</b> Each representative performs an average of 5 active "
        "simulation exams per month. Each exam session lasts approximately 180 seconds (3 minutes). "
        "The frontend executes a synchronization request every 2 seconds during active sessions. "
        "<b>Metric Derivation:</b> 180 seconds / 2-second polling interval = 90 synchronization "
        "requests per exam. Approximately 110 additional API transactions occur per exam for "
        "authentication, scenario retrieval, answer submission, evaluation, and analytics processing. "
        "Total: 200 API transactions per exam session. 1,000 users × 5 exams × 200 API "
        "transactions = 1,000,000 monthly API requests and Lambda invocations. Lambda sizing is "
        "configured at 512 MB memory allocation.",
        S["body"]))

    story.append(Paragraph("B. Amazon DynamoDB Database Provisioning", S["h3"]))
    story.append(Paragraph(
        "The system stores operational data across several entities including users, personas, "
        "scenarios, exam sessions, evaluations, and analytics records.",
        S["body"]))
    story.append(Paragraph(
        "<b>Storage Assumptions:</b> Each active user generates approximately 1 MB of JSON-based "
        "operational and evaluation data per month. 1,000 users × 1 MB = 1 GB raw data storage. "
        "An additional overhead multiplier is included for indexes, archived records, and "
        "semester-long retained datasets, resulting in a 5 GB allocation target. "
        "<b>Throughput Assumptions:</b> Continuous polling operations generate read activity. Answer "
        "submissions and evaluation updates generate write activity. The system therefore assumes "
        "1,000,000 read requests and 1,000,000 write requests per month.",
        S["body"]))

    story.append(Paragraph("C. Amazon SQS Asynchronous Queue Sizing", S["h3"]))
    story.append(Paragraph(
        "The architecture uses Amazon SQS to support asynchronous processing and delayed inbox-style "
        "message delivery during active simulations.",
        S["body"]))
    story.append(Paragraph(
        "Each simulation interaction generates queue operations including message creation, polling, "
        "and deletion, resulting in an estimated 1,000,000 SQS requests per month.",
        S["body"]))

    story.append(Paragraph("D. AWS Secrets Manager Token Record Allocation", S["h3"]))
    story.append(Paragraph(
        "To maintain secure serverless deployment practices, application secrets and external API "
        "credentials are separated entirely from source code. AWS Secrets Manager is used to securely "
        "store authentication tokens, deployment secrets, and external OpenAI API credentials "
        "powering the AI evaluation engine.",
        S["body"]))
    story.append(Paragraph(
        "The infrastructure sizing assumes 5 securely stored secrets.",
        S["body"]))

    # ── Section 3 — summary table ──────────────────────────────────────────────
    story.append(Paragraph("3. AWS Pricing Calculator Mapping Summary", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=TEAL_L, spaceAfter=6))

    avail = 6.4 * inch
    col_w = [1.9 * inch, 1.9 * inch, avail - 3.8 * inch]

    rows = [
        ["Amazon API Gateway",   "HTTP REST API Requests",           "1,000,000 Requests / Month"],
        ["AWS Lambda",           "Serverless Compute Invocations",   "1,000,000 Invocations / Month (512 MB)"],
        ["Amazon DynamoDB",      "Payload Throughput Units",         "1,000,000 Read / 1,000,000 Write Requests"],
        ["Amazon DynamoDB",      "Cumulative Data Storage",          "5 GB Allocated Storage Volume"],
        ["Amazon SQS",           "Asynchronous Queue Messages",      "1,000,000 Requests / Month"],
        ["AWS Secrets Manager",  "Cryptographic Secret Records",     "5 Stored Secrets"],
    ]

    table_data = [[
        Paragraph("AWS Infrastructure Component", S["th"]),
        Paragraph("Sizing Metric Cap",            S["th"]),
        Paragraph("Provisioned Configuration",    S["th"]),
    ]]
    for component, metric, config in rows:
        table_data.append([
            Paragraph(component, S["td_b"]),
            Paragraph(metric,    S["td"]),
            Paragraph(config,    S["td"]),
        ])

    t = Table(table_data, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0), SLATE),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [ROW_A, ROW_B]),
        ("GRID",          (0, 0), (-1, -1), 0.35, TEAL_L),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=0.70 * inch,
        leftMargin=0.70 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.64 * inch,
        title="Group - E | SalesOps AI | Section 06",
        author="Group E",
        subject="Section 06 Academic Lab Sizing & Baseline Assumptions",
    )
    doc.build(story, onFirstPage=hdr_ftr, onLaterPages=hdr_ftr)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
