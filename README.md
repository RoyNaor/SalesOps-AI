# SalesOps AI

AI-powered training and examination platform for sales and service representatives.

## Repo Layout

- `frontend/` - Vite, React, TypeScript app.
- `backend/` - AWS SAM app with Node.js 20 Lambda functions.
- `docs/` - setup notes for AWS lab work.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- AWS CLI v2.
- AWS SAM CLI.
- AWS lab profile named `salesops-lab`.

Docker is not required for the current workflow because backend verification targets the AWS lab.

## Quick Start

```bash
npm install
npm run dev
```

Frontend runs on Vite's local dev server. Backend deploy flow is documented in [docs/aws-lab-setup.md](docs/aws-lab-setup.md).

## Useful Commands

```bash
npm run typecheck
npm run build
npm run aws:whoami
npm run sam:build
npm run sam:deploy:guided
```

Do not commit real AWS credentials, LLM keys, or `.env.local` files.
