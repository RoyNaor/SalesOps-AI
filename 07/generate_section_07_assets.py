from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

W, H = 1600, 950
BG = "#f4efe7"
INK = "#1f252b"
MUTED = "#65717b"
PANEL = "#fffdf8"
LINE = "#dfd3bd"
TEAL = "#2d6d5f"
TEAL_DARK = "#194f48"
AMBER = "#d7a13e"
RED = "#b85b3e"
BLUE = "#1f5f72"
GREEN_BG = "#e6f2ed"
AMBER_BG = "#fbf1d9"
RED_BG = "#f6e5dd"


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F = {
    "xs": font(18),
    "sm": font(22),
    "body": font(26),
    "body_b": font(26, True),
    "h3": font(30, True),
    "h2": font(42, True),
    "h1": font(58, True),
}


def rounded(draw, xy, fill, outline=None, width=1, radius=18):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, size="body", fill=INK, anchor=None):
    draw.text(xy, value, font=F[size], fill=fill, anchor=anchor)


def badge(draw, xy, label, fill=GREEN_BG, fg=TEAL_DARK):
    x, y = xy
    tw = draw.textlength(label, font=F["sm"])
    rounded(draw, (x, y, x + tw + 34, y + 38), fill=fill, outline=None, radius=19)
    text(draw, (x + 17, y + 7), label, "sm", fg)


def button(draw, xy, label, primary=False, danger=False, wide=0):
    x, y = xy
    tw = draw.textlength(label, font=F["body_b"])
    w = max(wide, int(tw + 52))
    fill = TEAL if primary else (RED_BG if danger else "#f9f5ec")
    fg = "white" if primary else (RED if danger else INK)
    outline = None if primary else LINE
    rounded(draw, (x, y, x + w, y + 52), fill=fill, outline=outline, radius=12)
    text(draw, (x + 26, y + 12), label, "body_b", fg)
    return w


def input_box(draw, xy, label, value="", w=420, h=74):
    x, y = xy
    text(draw, (x, y), label, "sm", MUTED)
    rounded(draw, (x, y + 30, x + w, y + 30 + h), fill="#ffffff", outline=LINE, radius=12)
    if value:
        text(draw, (x + 20, y + 52), value, "body", INK)


def sidebar(draw, role="manager"):
    rounded(draw, (30, 30, 300, H - 30), fill="#23323a", radius=24)
    rounded(draw, (62, 62, 114, 114), fill=TEAL, radius=14)
    text(draw, (75, 76), "SA", "h3", "white")
    text(draw, (130, 67), "SalesOps AI", "body_b", "white")
    text(draw, (130, 99), "Lab bootstrap", "sm", "#b7c2c7")
    y = 170
    items = ["Content Library", "Personas", "Scenarios", "Dashboard", "Users"] if role == "manager" else ["Scenario Exam"]
    for idx, item in enumerate(items):
        active = idx == 0 or item in {"Dashboard", "Scenario Exam"}
        fill = "#31454f" if active else None
        if fill:
            rounded(draw, (55, y - 10, 275, y + 42), fill=fill, radius=12)
        text(draw, (78, y), item, "body", "white" if active else "#d2dadf")
        y += 62
    text(draw, (70, H - 135), "Dana Cohen" if role == "manager" else "Riley Rep", "body_b", "white")
    text(draw, (70, H - 100), role, "sm", "#b7c2c7")
    text(draw, (70, H - 65), "Sign out", "body", "#d2dadf")


def page_base(title, eyebrow, role="manager"):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    sidebar(draw, role)
    text(draw, (350, 62), eyebrow, "sm", TEAL_DARK)
    text(draw, (350, 95), title, "h2", INK)
    return img, draw


def table(draw, xy, headers, rows, widths):
    x, y = xy
    row_h = 62
    total = sum(widths)
    rounded(draw, (x, y, x + total, y + row_h * (len(rows) + 1)), fill=PANEL, outline=LINE, radius=14)
    cx = x
    for h, w in zip(headers, widths):
        text(draw, (cx + 18, y + 18), h, "sm", MUTED)
        cx += w
    draw.line((x, y + row_h, x + total, y + row_h), fill=LINE, width=2)
    for r_idx, row in enumerate(rows):
        cy = y + row_h * (r_idx + 1)
        cx = x
        for cell, w in zip(row, widths):
            text(draw, (cx + 18, cy + 18), cell, "sm" if len(cell) > 18 else "body", INK)
            cx += w
        if r_idx < len(rows) - 1:
            draw.line((x, cy + row_h, x + total, cy + row_h), fill="#eee5d4", width=1)


def draw_login():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    text(draw, (130, 120), "SA", "h2", TEAL)
    text(draw, (130, 180), "SalesOps AI", "sm", TEAL_DARK)
    text(draw, (130, 230), "Rep readiness starts with a verified workspace.", "h1", INK)
    text(draw, (135, 330), "Sign in to launch exams, manage scenarios, and review coaching data.", "body", MUTED)
    rounded(draw, (120, 400, 690, 475), fill=GREEN_BG, radius=18)
    text(draw, (155, 425), "Cognito session, DynamoDB profile, protected app routes.", "body", TEAL_DARK)
    rounded(draw, (930, 120, 1430, 780), fill=PANEL, outline=LINE, radius=26)
    text(draw, (985, 180), "Sign in", "h2", INK)
    text(draw, (987, 235), "Use your confirmed SalesOps AI account.", "body", MUTED)
    input_box(draw, (985, 305), "Email", "manager@salesops.ai", 390)
    input_box(draw, (985, 435), "Password", "Password", 390)
    button(draw, (985, 600), "Continue", primary=True, wide=390)
    text(draw, (985, 690), "Forgot password?", "body", TEAL_DARK)
    text(draw, (985, 735), "New here? Create account", "body", MUTED)
    img.save(ASSETS / "01-login.png")


def draw_dashboard():
    img, draw = page_base("Rep performance", "Management dashboard")
    metrics = [("Attempts", "42"), ("Pass score", "80"), ("Avg success", "84%"), ("Needs evaluation", "3")]
    x = 350
    for label, value in metrics:
        rounded(draw, (x, 165, x + 245, 270), fill=PANEL, outline=LINE, radius=16)
        text(draw, (x + 24, 188), label, "sm", MUTED)
        text(draw, (x + 24, 222), value, "h3", INK)
        x += 270
    rounded(draw, (350, 310, 930, 645), fill=PANEL, outline=LINE, radius=18)
    text(draw, (390, 345), "Success bands", "h3", INK)
    draw.ellipse((470, 405, 700, 635), outline=TEAL, width=42)
    draw.arc((470, 405, 700, 635), 250, 360, fill=AMBER, width=42)
    draw.arc((470, 405, 700, 635), 20, 75, fill=RED, width=42)
    text(draw, (560, 492), "42", "h2", INK)
    text(draw, (534, 545), "Attempts", "sm", MUTED)
    badge(draw, (745, 420), "Passed 62%", GREEN_BG, TEAL_DARK)
    badge(draw, (745, 475), "Coaching 24%", AMBER_BG, "#7a5614")
    badge(draw, (745, 530), "At risk 7%", RED_BG, RED)
    rounded(draw, (970, 310, 1510, 645), fill=PANEL, outline=LINE, radius=18)
    text(draw, (1010, 345), "Coaching queue", "h3", INK)
    for i, (name, focus, score) in enumerate([
        ("Maya Levi", "Improve resolution clarity", "72"),
        ("Noam Bar", "Evaluation pending", "-"),
        ("Lior Katz", "Add proactive next steps", "78"),
    ]):
        y = 405 + i * 72
        text(draw, (1015, y), name, "body_b", INK)
        text(draw, (1015, y + 32), focus, "sm", MUTED)
        badge(draw, (1390, y + 6), score, AMBER_BG if score != "-" else "#eee5d4", "#7a5614")
    table(
        draw,
        (350, 695),
        ["Rep", "Attempts", "Avg", "Latest", "Pass", "Coaching focus"],
        [
            ["Maya Levi", "5", "72", "70", "40%", "Resolution clarity"],
            ["Riley Rep", "4", "88", "91", "75%", "Maintain approach"],
            ["Lior Katz", "3", "78", "80", "67%", "Helpful ideas"],
        ],
        [260, 135, 120, 130, 120, 370],
    )
    img.save(ASSETS / "02-dashboard.png")


def draw_personas():
    img, draw = page_base("Personas", "Manager library")
    rounded(draw, (350, 170, 1035, 235), fill="#fff", outline=LINE, radius=16)
    text(draw, (380, 188), "Search persona, description, or behavior", "body", MUTED)
    button(draw, (1280, 170), "Add persona", primary=True, wide=210)
    table(
        draw,
        (350, 285),
        ["Persona", "Status", "Description", "Behavior notes", "Updated"],
        [
            ["Frustrated finance manager", "ACTIVE", "Owns renewal approvals", "Direct, time-sensitive", "May 24"],
            ["Expansion champion", "ACTIVE", "Needs value proof", "Curious, optimistic", "May 22"],
            ["Billing skeptic", "ACTIVE", "Challenges invoices", "Precise and impatient", "May 19"],
        ],
        [340, 150, 310, 330, 130],
    )
    rounded(draw, (1030, 620, 1490, 850), fill=PANEL, outline=LINE, radius=20)
    text(draw, (1070, 655), "Create persona", "h3", INK)
    input_box(draw, (1070, 705), "Name", "Frustrated finance manager", 360, 54)
    input_box(draw, (1070, 805), "Behavior notes", "Expects ownership and clear next step.", 360, 54)
    img.save(ASSETS / "03-personas.png")


def draw_scenarios():
    img, draw = page_base("Scenarios", "Manager workflow")
    rounded(draw, (350, 170, 990, 235), fill="#fff", outline=LINE, radius=16)
    text(draw, (380, 188), "Search scenario or persona", "body", MUTED)
    button(draw, (1265, 170), "Add scenario", primary=True, wide=225)
    table(
        draw,
        (350, 285),
        ["Scenario", "Status", "Persona", "Target", "Generated", "Updated"],
        [
            ["Q2 renewal pressure test", "PUBLISHED", "Finance manager", "5", "5", "May 24"],
            ["Billing mismatch drill", "DRAFT", "Billing skeptic", "4", "0", "May 22"],
            ["Expansion objection practice", "ARCHIVED", "Champion", "6", "6", "May 18"],
        ],
        [360, 175, 260, 115, 140, 150],
    )
    rounded(draw, (700, 560, 1500, 875), fill=PANEL, outline=LINE, radius=22)
    text(draw, (740, 595), "Q2 renewal pressure test", "h3", INK)
    text(draw, (740, 635), "Reusable published scenario with generated inbox issues.", "body", MUTED)
    for i, label in enumerate(["Persona selected", "Published", "Issues generated", "Issue count matched", "Ready for reps"]):
        badge(draw, (740 + (i % 3) * 240, 700 + (i // 3) * 55), label, GREEN_BG, TEAL_DARK)
    button(draw, (740, 815), "Edit scenario", wide=190)
    button(draw, (950, 815), "Clone", wide=120)
    button(draw, (1090, 815), "Archive", danger=True, wide=140)
    button(draw, (1250, 815), "Regenerate issues", primary=True, wide=230)
    img.save(ASSETS / "04-scenarios.png")


def draw_users():
    img, draw = page_base("Users", "Manager access")
    rounded(draw, (350, 170, 970, 235), fill="#fff", outline=LINE, radius=16)
    text(draw, (380, 188), "Search name, email, or user ID", "body", MUTED)
    table(
        draw,
        (350, 285),
        ["User", "Role", "Status", "User ID", "Created", "Updated"],
        [
            ["Dana Cohen", "manager", "ACTIVE", "sub_manager_001", "May 10", "May 24"],
            ["Riley Rep", "rep", "ACTIVE", "sub_rep_001", "May 14", "May 23"],
            ["Noam Bar", "rep", "SUSPENDED", "sub_rep_002", "May 18", "May 22"],
        ],
        [300, 145, 170, 300, 140, 140],
    )
    rounded(draw, (1010, 565, 1490, 830), fill=PANEL, outline=LINE, radius=22)
    text(draw, (1050, 600), "Edit user access", "h3", INK)
    text(draw, (1050, 640), "riley.rep@salesops.ai", "body", MUTED)
    input_box(draw, (1050, 700), "Role", "Rep", 180, 54)
    input_box(draw, (1260, 700), "Status", "Active", 180, 54)
    button(draw, (1260, 780), "Save access", primary=True, wide=180)
    img.save(ASSETS / "05-users.png")


def draw_exam_start():
    img, draw = page_base("Start Scenario Exam", "Rep exam", role="rep")
    text(draw, (350, 150), "Choose scenario, review brief, then start when ready.", "body", MUTED)
    rounded(draw, (350, 240, 870, 650), fill=PANEL, outline=LINE, radius=22)
    text(draw, (390, 280), "Scenario setup", "h3", INK)
    input_box(draw, (390, 350), "Scenario", "Q2 renewal pressure test", 420, 58)
    button(draw, (390, 530), "Start", primary=True, wide=420)
    rounded(draw, (930, 240, 1480, 650), fill=PANEL, outline=LINE, radius=22)
    text(draw, (970, 280), "Exam brief", "sm", TEAL_DARK)
    text(draw, (970, 320), "Q2 renewal pressure test", "h3", INK)
    text(draw, (970, 380), "Rep handles renewal friction, billing concerns, and expansion pressure.", "body", MUTED)
    badge(draw, (970, 500), "Time to complete: 3 minutes", AMBER_BG, "#7a5614")
    img.save(ASSETS / "06-exam-start.png")


def draw_exam_inbox():
    img, draw = page_base("Inbox", "Active exam", role="rep")
    rounded(draw, (350, 160, 720, 830), fill=PANEL, outline=LINE, radius=22)
    text(draw, (390, 200), "Q2 renewal pressure test", "body_b", INK)
    for i, (state, title, customer) in enumerate([
        ("Done", "Renewal concern", "Amit Finance"),
        ("Medium", "Billing follow-up", "Nora Billing"),
        ("Hard", "Expansion question", "Lee Operations"),
    ]):
        y = 270 + i * 125
        rounded(draw, (385, y, 685, y + 92), fill="#f9f5ec" if i else GREEN_BG, outline=LINE, radius=16)
        text(draw, (410, y + 15), state, "sm", TEAL_DARK if i == 0 else MUTED)
        text(draw, (410, y + 43), title, "body_b", INK)
        text(draw, (410, y + 72), customer, "sm", MUTED)
    rounded(draw, (760, 160, 1500, 830), fill=PANEL, outline=LINE, radius=22)
    text(draw, (800, 198), "Billing follow-up", "h3", INK)
    badge(draw, (1345, 190), "1:42", AMBER_BG, "#7a5614")
    rounded(draw, (815, 270, 1450, 385), fill="#f9f5ec", radius=18)
    text(draw, (845, 292), "Nora Billing", "sm", MUTED)
    text(draw, (845, 328), "I see a billing mismatch and need timing for resolution.", "body", INK)
    rounded(draw, (965, 430, 1450, 520), fill=GREEN_BG, radius=18)
    text(draw, (995, 452), "I will review the invoice and send an update today.", "body", TEAL_DARK)
    rounded(draw, (815, 595, 1450, 710), fill="#ffffff", outline=LINE, radius=16)
    text(draw, (845, 635), "Draft representative response...", "body", MUTED)
    button(draw, (1010, 745), "Submit response", primary=True, wide=245)
    button(draw, (1280, 745), "Done", wide=140)
    img.save(ASSETS / "07-exam-inbox.png")


def draw_results():
    img, draw = page_base("Final score", "Exam evaluation", role="rep")
    rounded(draw, (1230, 95, 1445, 310), fill=PANEL, outline=LINE, radius=110)
    text(draw, (1290, 145), "86", "h1", TEAL_DARK)
    text(draw, (1335, 220), "/100", "h3", MUTED)
    rounded(draw, (350, 190, 910, 520), fill=PANEL, outline=LINE, radius=22)
    text(draw, (390, 230), "Rubric", "h3", INK)
    for i, (label, score) in enumerate([
        ("Kindness", 90),
        ("Professionalism", 88),
        ("Resolution", 82),
        ("Clarity", 84),
        ("Helpful ideas", 78),
    ]):
        y = 290 + i * 42
        text(draw, (390, y), label, "sm", INK)
        rounded(draw, (610, y + 5, 820, y + 25), fill="#eadfc7", radius=10)
        rounded(draw, (610, y + 5, 610 + int(210 * score / 100), y + 25), fill=TEAL, radius=10)
        text(draw, (845, y - 2), str(score), "sm", INK)
    rounded(draw, (950, 360, 1490, 705), fill=PANEL, outline=LINE, radius=22)
    text(draw, (990, 400), "Growth areas", "h3", INK)
    text(draw, (1015, 465), "- Add exact timeline for next update.", "body", INK)
    text(draw, (1015, 515), "- Offer one prevention idea after solving issue.", "body", INK)
    text(draw, (1015, 565), "- Use shorter first sentence in tense replies.", "body", INK)
    rounded(draw, (350, 570, 910, 820), fill=PANEL, outline=LINE, radius=22)
    text(draw, (390, 610), "Per-inquiry coaching", "h3", INK)
    text(draw, (390, 675), "Billing follow-up", "body_b", INK)
    text(draw, (390, 715), "Good ownership. Add concrete resolution window.", "body", MUTED)
    img.save(ASSETS / "08-results.png")


def main():
    draw_login()
    draw_dashboard()
    draw_personas()
    draw_scenarios()
    draw_users()
    draw_exam_start()
    draw_exam_inbox()
    draw_results()
    print(f"Wrote screenshots to {ASSETS}")


if __name__ == "__main__":
    main()
