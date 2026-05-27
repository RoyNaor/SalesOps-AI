from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

W, H = 1600, 950
BG = "#1a1e24"
BG_LIGHT = "#232830"
BG_PANEL = "#2a303a"
INK = "#e8edf2"
MUTED = "#8a96a2"
LINE = "#363e4a"
TEAL = "#2d9d7e"
TEAL_DARK = "#1d6f58"
AMBER = "#d9a73a"
RED = "#c0503a"
BLUE = "#2d6fbd"
GREEN = "#3aad6e"
GREEN_BG = "#1a3028"
AMBER_BG = "#312a14"
RED_BG = "#2e1a14"
BLUE_BG = "#14233c"
PROMPT_GREEN = "#3aad6e"


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F = {
    "xs": font(16),
    "sm": font(20),
    "body": font(24),
    "body_b": font(24, True),
    "mono": font(22),
    "mono_b": font(22, True),
    "h3": font(28, True),
    "h2": font(40, True),
    "h1": font(54, True),
}


def rounded(draw, xy, fill, outline=None, width=1, radius=14):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, size="body", fill=INK, anchor=None):
    draw.text(xy, value, font=F[size], fill=fill, anchor=anchor)


def badge(draw, xy, label, fill=GREEN_BG, fg=GREEN):
    x, y = xy
    tw = draw.textlength(label, font=F["sm"])
    rounded(draw, (x, y, x + tw + 28, y + 34), fill=fill, outline=None, radius=17)
    text(draw, (x + 14, y + 6), label, "sm", fg)


def terminal_base(title="Terminal"):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    rounded(draw, (60, 60, W - 60, H - 60), fill=BG_LIGHT, outline=LINE, radius=20)
    draw.rectangle((60, 60, W - 60, 115), fill="#1e2530")
    rounded(draw, (60, 60, W - 60, 115), fill="#1e2530", outline=LINE, radius=14)
    for i, col in enumerate(["#c0503a", "#d9a73a", "#3aad6e"]):
        draw.ellipse((100 + i * 32, 80, 120 + i * 32, 100), fill=col)
    text(draw, (W // 2, 77), title, "sm", MUTED, anchor="ma")
    return img, draw


def console_base(title="AWS Console"):
    img = Image.new("RGB", (W, H), "#f0f2f5")
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, W, 60), fill="#232f3e")
    text(draw, (40, 14), "AWS", "h3", "#ff9900")
    text(draw, (110, 18), "Management Console", "body_b", "#ffffff")
    text(draw, (W - 220, 18), "us-east-1", "body", "#aab7c2")
    rounded(draw, (30, 80, W - 30, H - 30), fill="#ffffff", outline="#d5d9de", radius=10)
    text(draw, (60, 105), title, "h3", "#232f3e")
    draw.line((30, 145, W - 30, 145), fill="#d5d9de", width=1)
    return img, draw


def draw_tools():
    img, draw = terminal_base("Terminal — tool verification")
    y = 145
    lines = [
        ("$ node -v", PROMPT_GREEN, "mono_b"),
        ("v20.15.0", INK, "mono"),
        ("$ npm -v", PROMPT_GREEN, "mono_b"),
        ("10.8.0", INK, "mono"),
        ("$ aws --version", PROMPT_GREEN, "mono_b"),
        ("aws-cli/2.17.0 Python/3.12.4 Darwin/23.5.0 botocore/2.0.0", INK, "mono"),
        ("$ sam --version", PROMPT_GREEN, "mono_b"),
        ("SAM CLI, version 1.120.0", INK, "mono"),
        ("", INK, "mono"),
        ("$ # All required tools are installed and ready.", MUTED, "mono"),
    ]
    for line_text, color, size in lines:
        text(draw, (100, y), line_text, size, color)
        y += 48

    rounded(draw, (80, y + 20, W - 80, y + 145), fill=GREEN_BG, outline=TEAL_DARK, radius=12)
    text(draw, (110, y + 40), "All tools verified", "body_b", GREEN)
    text(draw, (110, y + 80), "Node 20+  •  npm 10+  •  AWS CLI v2  •  SAM CLI latest", "body", MUTED)
    img.save(ASSETS / "01-tools.png")


def draw_credentials():
    img, draw = terminal_base("Terminal — AWS credential verification")
    y = 145
    lines = [
        ("$ set -a; source .env; set +a", PROMPT_GREEN, "mono_b"),
        ("$ aws sts get-caller-identity", PROMPT_GREEN, "mono_b"),
        ("{", INK, "mono"),
        ('    "UserId": "AROA5EXAMPLE:LabRole",', INK, "mono"),
        ('    "Account": "123456789012",', INK, "mono"),
        ('    "Arn": "arn:aws:sts::123456789012:assumed-role/LabRole/session"', INK, "mono"),
        ("}", INK, "mono"),
        ("", INK, "mono"),
        ("$ # Credentials valid — LabRole confirmed.", MUTED, "mono"),
    ]
    for line_text, color, size in lines:
        text(draw, (100, y), line_text, size, color)
        y += 48

    rounded(draw, (80, y + 20, W - 80, y + 180), fill=BG_PANEL, outline=LINE, radius=12)
    text(draw, (110, y + 38), ".env credential fields", "body_b", INK)
    for i, field in enumerate(["AWS_ACCESS_KEY_ID=...", "AWS_SECRET_ACCESS_KEY=...", "AWS_SESSION_TOKEN=..."]):
        text(draw, (110, y + 82 + i * 34), field, "mono", AMBER)
    img.save(ASSETS / "02-credentials.png")


def draw_outputs():
    img, draw = terminal_base("Terminal — SAM deploy outputs")
    y = 140
    header_lines = [
        ("$ npm run sam:deploy", PROMPT_GREEN, "mono_b"),
        ("", INK, "mono"),
        ("        Managed S3 bucket: aws-sam-cli-managed-default-samclisourcebucket", MUTED, "mono"),
        ("        Deploying with following values", MUTED, "mono"),
        ("        Stack name    : salesops-ai-dev", INK, "mono"),
        ("        Region        : us-east-1", INK, "mono"),
        ("", INK, "mono"),
    ]
    for line_text, color, size in header_lines:
        text(draw, (100, y), line_text, size, color)
        y += 38

    rounded(draw, (80, y, W - 80, y + 350), fill=BG_PANEL, outline=LINE, radius=12)
    text(draw, (110, y + 18), "CloudFormation Outputs", "body_b", TEAL)
    outputs = [
        ("ApiBaseUrl", "https://abc123def.execute-api.us-east-1.amazonaws.com/dev"),
        ("HealthUrl", "https://abc123def.execute-api.us-east-1.amazonaws.com/dev/health"),
        ("UserPoolId", "us-east-1_Abc123Def"),
        ("UserPoolClientId", "3abc123def456ghi789jkl"),
        ("UsersTableName", "salesops-ai-dev-Users"),
        ("ExamSessionsTableName", "salesops-ai-dev-ExamSessions"),
    ]
    for i, (key, val) in enumerate(outputs):
        oy = y + 60 + i * 46
        text(draw, (110, oy), key, "mono_b", AMBER)
        text(draw, (460, oy), val, "mono", INK)
    img.save(ASSETS / "03-outputs.png")


def draw_secret():
    img, draw = console_base("AWS Secrets Manager — salesops/dev/llm-api-keys")

    text(draw, (60, 175), "Secret name", "sm", "#5f6b7a")
    text(draw, (60, 205), "salesops/dev/llm-api-keys", "body_b", "#232f3e")

    text(draw, (500, 175), "Secret ARN", "sm", "#5f6b7a")
    text(draw, (500, 205), "arn:aws:secretsmanager:us-east-1:123456789012:secret:salesops/dev/llm-api-keys", "sm", "#232f3e")

    text(draw, (60, 265), "Secret value", "body_b", "#232f3e")
    rounded(draw, (60, 300, W - 60, 430), fill="#f7f8fa", outline="#d5d9de", radius=8)
    text(draw, (90, 340), '{ "OPENAI_API_KEY": "sk-••••••••••••••••••••••••••••••" }', "mono", "#232f3e")
    text(draw, (90, 385), "Key is stored securely. Value is masked in the console.", "sm", "#5f6b7a")

    text(draw, (60, 465), "AWS CLI command — create secret", "body_b", "#232f3e")
    rounded(draw, (60, 500, W - 60, 700), fill="#1a1e24", outline="#363e4a", radius=8)
    cli_lines = [
        "aws secretsmanager create-secret \\",
        "  --name salesops/dev/llm-api-keys \\",
        '  --secret-string \'{"OPENAI_API_KEY":"PASTE_YOUR_KEY_HERE"}\' \\',
        "  --region us-east-1",
    ]
    for i, line in enumerate(cli_lines):
        text(draw, (90, 520 + i * 44), line, "mono", AMBER)

    badge(draw, (60, 730), "Secret active", GREEN_BG, GREEN)
    badge(draw, (230, 730), "Never committed to version control", AMBER_BG, AMBER)
    img.save(ASSETS / "04-secret.png")


def draw_frontend_config():
    img, draw = terminal_base("Terminal — frontend environment configuration")
    y = 145
    lines = [
        ("$ cat frontend/.env.local", PROMPT_GREEN, "mono_b"),
        ("VITE_API_BASE_URL=https://abc123def.execute-api.us-east-1.amazonaws.com/dev", AMBER, "mono"),
        ("", INK, "mono"),
        ("$ npm run dev", PROMPT_GREEN, "mono_b"),
        ("", INK, "mono"),
        ("  VITE v5.2.0  ready in 312 ms", MUTED, "mono"),
        ("", INK, "mono"),
        ("  ➜  Local:   http://localhost:5173/", TEAL, "mono_b"),
        ("  ➜  Network: http://192.168.1.100:5173/", MUTED, "mono"),
    ]
    for line_text, color, size in lines:
        text(draw, (100, y), line_text, size, color)
        y += 48

    rounded(draw, (80, y + 20, W - 80, y + 220), fill=BG_PANEL, outline=LINE, radius=12)
    text(draw, (110, y + 40), "frontend/.env.local rules", "body_b", INK)
    rules = [
        "File is listed in .gitignore — never commit it.",
        "Update VITE_API_BASE_URL after every new SAM deploy.",
        "Restart npm run dev after changing the .env.local file.",
    ]
    for i, rule in enumerate(rules):
        text(draw, (130, y + 90 + i * 42), f"•  {rule}", "body", MUTED)
    img.save(ASSETS / "05-frontend-config.png")


def draw_smoke():
    img, draw = terminal_base("Terminal — smoke test")
    y = 145
    lines = [
        ("$ npm run smoke", PROMPT_GREEN, "mono_b"),
        ("", INK, "mono"),
        ("> salesops-ai@1.0.0 smoke", MUTED, "mono"),
        ("> node scripts/smoke.mjs", MUTED, "mono"),
        ("", INK, "mono"),
        ("GET https://abc123def.execute-api.us-east-1.amazonaws.com/dev/health", INK, "mono"),
        ("HTTP 200  OK", GREEN, "mono_b"),
        ('{"status":"ok","service":"salesops-ai","stage":"dev"}', INK, "mono"),
        ("", INK, "mono"),
        ("Smoke test passed.", GREEN, "mono_b"),
    ]
    for line_text, color, size in lines:
        text(draw, (100, y), line_text, size, color)
        y += 48

    rounded(draw, (80, y + 20, W - 80, y + 180), fill=GREEN_BG, outline=TEAL_DARK, radius=12)
    text(draw, (110, y + 42), "Health check confirms:", "body_b", GREEN)
    confirms = [
        "API Gateway is reachable",
        "Health Lambda is deployed and invokable",
        "Credentials and endpoint URL are correct",
    ]
    for i, item in enumerate(confirms):
        text(draw, (130, y + 90 + i * 38), f"✓  {item}", "body", INK)
    img.save(ASSETS / "06-smoke.png")


def draw_admin_promote():
    img, draw = terminal_base("Terminal — first admin user promotion")
    y = 130
    lines = [
        ("$ # Step 1 — find Cognito sub by email", MUTED, "mono"),
        ("$ aws dynamodb query \\", PROMPT_GREEN, "mono_b"),
        ("    --table-name salesops-ai-dev-Users \\", INK, "mono"),
        ("    --index-name EmailIndex \\", INK, "mono"),
        ('    --key-condition-expression "emailLower = :email" \\', INK, "mono"),
        ("    --expression-attribute-values '{\":email\":{\"S\":\"admin@example.com\"}}' \\", INK, "mono"),
        ("    --region us-east-1", INK, "mono"),
        ('  → userId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"', AMBER, "mono_b"),
        ("", INK, "mono"),
        ("$ # Step 2 — promote to manager", MUTED, "mono"),
        ("$ aws dynamodb update-item --table-name salesops-ai-dev-Users \\", PROMPT_GREEN, "mono_b"),
        ('    --key \'{"userId":{"S":"a1b2c3d4-e5f6-7890-abcd-ef1234567890"}}\' \\', INK, "mono"),
        ("    --update-expression \"SET #role = :role, updatedAt = :updatedAt\" \\", INK, "mono"),
    ]
    for line_text, color, size in lines:
        text(draw, (100, y), line_text, size, color)
        y += 36

    rounded(draw, (80, y + 10, W - 80, y + 125), fill=GREEN_BG, outline=TEAL_DARK, radius=12)
    text(draw, (110, y + 28), "Promotion complete", "body_b", GREEN)
    text(draw, (110, y + 68), "Sign out and sign in again to activate manager navigation.", "body", MUTED)
    img.save(ASSETS / "07-admin-promote.png")


def draw_cloudwatch():
    img, draw = console_base("Amazon CloudWatch — Lambda log groups")

    headers = ["Log group name", "Retention", "Stored bytes", "Last event"]
    widths = [700, 150, 160, 250]
    col_x = [60, 760, 910, 1070]
    row_h = 52
    table_y = 175

    for i, (h, x) in enumerate(zip(headers, col_x)):
        text(draw, (x, table_y), h, "sm", "#5f6b7a")
    draw.line((60, table_y + 36, W - 60, table_y + 36), fill="#d5d9de", width=1)

    log_groups = [
        ("/aws/lambda/salesops-ai-dev-SignUpFunction", "Never", "142 KB", "2 min ago"),
        ("/aws/lambda/salesops-ai-dev-SignInFunction", "Never", "88 KB", "5 min ago"),
        ("/aws/lambda/salesops-ai-dev-GenerateScenarioIssuesFunction", "Never", "1.2 MB", "12 min ago"),
        ("/aws/lambda/salesops-ai-dev-CreateExamEvaluationFunction", "Never", "3.4 MB", "18 min ago"),
        ("/aws/lambda/salesops-ai-dev-GetDashboardFunction", "Never", "310 KB", "25 min ago"),
        ("/aws/lambda/salesops-ai-dev-ReleaseExamIssueFunction", "Never", "56 KB", "31 min ago"),
    ]

    for r_idx, (lg_name, retention, stored, last) in enumerate(log_groups):
        ry = table_y + 36 + (r_idx + 1) * row_h
        row_data = [lg_name, retention, stored, last]
        for cell, x in zip(row_data, col_x):
            color = BLUE if x == 60 else "#232f3e"
            text(draw, (x, ry + 14), cell, "sm", color)
        if r_idx < len(log_groups) - 1:
            draw.line((60, ry + row_h, W - 60, ry + row_h), fill="#edf0f4", width=1)

    cli_y = table_y + 36 + (len(log_groups) + 1) * row_h + 20
    text(draw, (60, cli_y), "View live logs via CLI", "body_b", "#232f3e")
    rounded(draw, (60, cli_y + 35, W - 60, cli_y + 135), fill="#1a1e24", outline="#363e4a", radius=8)
    text(draw, (90, cli_y + 55), "aws logs tail /aws/lambda/salesops-ai-dev-GenerateScenarioIssuesFunction \\", "mono", AMBER)
    text(draw, (90, cli_y + 95), "  --follow --region us-east-1", "mono", AMBER)
    img.save(ASSETS / "08-cloudwatch.png")


def main():
    draw_tools()
    draw_credentials()
    draw_outputs()
    draw_secret()
    draw_frontend_config()
    draw_smoke()
    draw_admin_promote()
    draw_cloudwatch()
    print(f"Wrote screenshots to {ASSETS}")


if __name__ == "__main__":
    main()
