# SalesOps AI

AI-powered training and examination platform for sales and service representatives.

## Repo Layout

- `frontend/` - Vite, React, TypeScript app.
- `backend/` - AWS SAM app with Node.js Lambda functions.
- `docs/` - setup notes for AWS lab work.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- AWS CLI v2.
- AWS SAM CLI.
- AWS Academy temporary credentials loaded from local `.env`.

Docker is not required for the current workflow because backend verification targets the AWS lab.

## Quick Start

```bash
npm install
set -a; source .env; set +a
npm run dev
```

Frontend runs on Vite's local dev server. Backend deploy flow is documented in [docs/aws-lab-setup.md](docs/aws-lab-setup.md). Auth setup is documented in [docs/auth-setup.md](docs/auth-setup.md).

Project status and next steps live in [docs/milestones.md](docs/milestones.md).

## Useful Commands

```bash
npm run typecheck
npm run build
npm run smoke
npm run aws:whoami
npm run sam:build
npm run sam:deploy:guided
```

## Current Product Slice

- Managers create reusable personas in `/personas`.
- Managers create scenarios in `/scenarios`, set issue count, publish, and generate editable issues.
- Reps start timed scenario exams, answer released inbox issues, and receive AI scoring.
- Managers review users and performance dashboard data from completed exams.

Do not commit real AWS credentials, LLM keys, `.env`, or `.env.local` files.
