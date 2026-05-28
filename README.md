# SalesOps AI — Deployment Guide

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Repository Layout](#3-repository-layout)
4. [Step 1 — Obtain the Source Code](#step-1--obtain-the-source-code)
5. [Step 2 — Install Dependencies](#step-2--install-dependencies)
6. [Step 3 — Configure AWS Credentials](#step-3--configure-aws-credentials)
7. [Step 4 — Deploy the Backend with AWS SAM](#step-4--deploy-the-backend-with-aws-sam)
8. [Step 5 — Create the OpenAI Secret in Secrets Manager](#step-5--create-the-openai-secret-in-secrets-manager)
9. [Step 6 — Configure the Frontend](#step-6--configure-the-frontend)
10. [Step 7 — Build and Host the Frontend](#step-7--build-and-host-the-frontend)
11. [Step 8 — Create the First Manager Account](#step-8--create-the-first-manager-account)
12. [Step 9 — Verify the Deployment](#step-9--verify-the-deployment)
13. [Reference — SAM Outputs](#reference--sam-outputs)
14. [Reference — Environment Variables](#reference--environment-variables)
15. [Reference — DynamoDB Table Structure](#reference--dynamodb-table-structure)
16. [Teardown](#teardown)
17. [Troubleshooting](#troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│          React + TypeScript + Vite                          │
│          Hosted on S3 + CloudFront (or localhost)           │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (VITE_API_BASE_URL)
┌──────────────────────────▼──────────────────────────────────┐
│                  API Gateway (REST, Regional)                │
│          CognitoAuthorizer on all protected routes          │
└──┬──────────────┬──────────────┬────────────────────────────┘
   │              │              │
   ▼              ▼              ▼
auth.js      content.js      health.js          Node.js 22 Lambdas
(Cognito)  (personas /        (GET /health)
           scenarios /
           exam / dashboard)
   │              │
   ▼              ▼
Amazon Cognito   DynamoDB (4 tables)   SQS   Secrets Manager
User Pool        Users / Personas /         (OpenAI key)
                 Scenarios / ExamSessions
```

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, React Router, TanStack Query |
| API | AWS API Gateway (REST, Regional) |
| Compute | AWS Lambda (Node.js 22.x) |
| Auth | Amazon Cognito User Pool — email/password, email confirmation required |
| Database | Amazon DynamoDB (on-demand billing, 4 tables) |
| Async | Amazon SQS — timed release of exam issues to reps |
| AI | OpenAI API (`gpt-4o-mini` by default) via Secrets Manager |
| IaC | AWS SAM (`backend/template.yaml`) |

---

## 2. Prerequisites

Install all of the following on the machine you will deploy from before starting.

| Tool | Minimum Version | Install Reference |
|---|---|---|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| npm | 10.x | Bundled with Node.js 20 |
| AWS CLI v2 | 2.x | [AWS CLI install](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| AWS SAM CLI | 1.x | [SAM CLI install](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| OpenAI API key | — | [platform.openai.com](https://platform.openai.com/api-keys) |

**Verify your tools:**

```bash
node --version          # v20.x.x or higher
npm --version           # 10.x.x or higher
aws --version           # aws-cli/2.x.x
sam --version           # SAM CLI, version 1.x.x
```

### IAM / Role Note

The SAM template hard-codes the Lambda execution role as:

```
arn:aws:iam::<AccountId>:role/LabRole
```

This role is pre-created in **AWS Academy** (Learner Lab) environments and grants the Lambdas access to DynamoDB, Cognito, SQS, and Secrets Manager.

**If you are deploying to a personal or corporate AWS account (not AWS Academy):**
You must create a role named `LabRole` in your account, or edit `backend/template.yaml` to replace every `LabRole` reference with the ARN of an execution role that has the following managed or inline permissions:

- `AmazonDynamoDBFullAccess` (or scoped to the four tables)
- `AmazonCognitoPowerUser`
- `AmazonSQSFullAccess` (or scoped to the queue)
- `SecretsManagerReadWrite` (or scoped to the `salesops/dev/llm-api-keys` secret)
- `AWSLambdaBasicExecutionRole` (for CloudWatch Logs)

---

## 3. Repository Layout

```
salesops-ai/
├── backend/                   # SAM project (IaC + Lambda handlers)
│   ├── template.yaml          # SAM template — all AWS resources defined here
│   ├── samconfig.toml         # SAM deploy defaults (stack name, region, etc.)
│   ├── package.json
│   └── src/
│       └── handlers/
│           ├── auth.js        # signup, confirm, signin, refresh, me, …
│           ├── content.js     # personas, scenarios, exam, dashboard
│           └── health.js      # GET /health
├── frontend/                  # Vite + React app
│   ├── src/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── scripts/
│   └── smoke.mjs              # Automated smoke-test against deployed API
├── package.json               # npm workspaces root
└── 09/
    └── README.md              # This file
```

---

## Step 1 — Obtain the Source Code

**Option A — Clone from GitHub:**

```bash
git clone https://github.com/roynaor/salesops-ai.git
cd salesops-ai
```

**Option B — Unzip the submission archive:**

```bash
unzip salesops-ai.zip
cd salesops-ai
```

All subsequent commands are run from the repository root unless otherwise noted.

---

## Step 2 — Install Dependencies

The repository uses **npm workspaces**. A single install at the root pulls dependencies for both the frontend and backend packages.

```bash
npm install
```

This installs:
- Frontend packages (`react`, `vite`, `typescript`, `axios`, `react-router-dom`, `@tanstack/react-query`, `lucide-react`)
- Backend packages (`@aws-sdk/client-cognito-identity-provider`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-sqs`)

---

## Step 3 — Configure AWS Credentials

The SAM CLI and AWS CLI both read credentials from the standard credential chain.

**AWS Academy / Learner Lab:**

Copy the credentials provided in the Learner Lab console and paste them into `~/.aws/credentials`:

```ini
[default]
aws_access_key_id     = <from lab>
aws_secret_access_key = <from lab>
aws_session_token     = <from lab>
```

**Personal / corporate account:**

```bash
aws configure
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region name:   us-east-1
# Default output format: json
```

**Verify access:**

```bash
npm run aws:whoami
# or: aws sts get-caller-identity
```

A successful response shows your Account ID, UserId, and ARN. If this command fails, fix your credentials before proceeding.

---

## Step 4 — Deploy the Backend with AWS SAM

All AWS resources (API Gateway, Lambda functions, Cognito, DynamoDB tables, SQS queue) are created by this single SAM deployment.

### 4a. Build

```bash
npm run sam:build
# equivalent to: cd backend && sam build
```

SAM packages each Lambda handler and its dependencies into the `.aws-sam/build/` directory.

### 4b. Deploy (first time — guided)

```bash
npm run sam:deploy:guided
# equivalent to: cd backend && sam deploy --guided --region us-east-1
```

The guided wizard will prompt you for values. The `samconfig.toml` file provides these defaults — you can accept them by pressing Enter:

| Prompt | Default | Notes |
|---|---|---|
| Stack Name | `salesops-ai-dev` | Accept default |
| AWS Region | `us-east-1` | Accept default |
| Parameter `StageName` | `dev` | Accept default |
| Parameter `LlmSecretName` | `salesops/dev/llm-api-keys` | Accept default |
| Parameter `OpenAiModel` | `gpt-4o-mini` | Change if desired |
| Confirm changeset | `Y` | Review and confirm |
| Allow SAM to create IAM roles | `Y` | Required |
| Save arguments to `samconfig.toml` | `Y` | Saves settings for future deploys |

Deployment takes approximately 3–5 minutes. When it finishes you will see a table of **Outputs**. Copy these values — you will need them in subsequent steps.

### 4c. Subsequent deploys (after `samconfig.toml` is saved)

```bash
cd backend && sam deploy
```

---

## Step 5 — Create the OpenAI Secret in Secrets Manager

The AI-powered features (scenario issue generation, exam evaluation) require an OpenAI API key. The Lambdas read it from AWS Secrets Manager at runtime.

**Create the secret:**

```bash
aws secretsmanager create-secret \
  --name "salesops/dev/llm-api-keys" \
  --secret-string '{"OPENAI_API_KEY":"sk-...your-key-here..."}' \
  --region us-east-1
```

> **Important:** The secret name must exactly match the `LlmSecretName` SAM parameter (default: `salesops/dev/llm-api-keys`) and the JSON key must be `OPENAI_API_KEY`.

**If the secret already exists and you need to update the key:**

```bash
aws secretsmanager update-secret \
  --secret-id "salesops/dev/llm-api-keys" \
  --secret-string '{"OPENAI_API_KEY":"sk-...new-key..."}' \
  --region us-east-1
```

---

## Step 6 — Configure the Frontend

The frontend needs to know the API Gateway URL. Copy the `ApiBaseUrl` value from the SAM deploy outputs.

Create the file `frontend/.env.local`:

```bash
# Replace the URL below with the actual ApiBaseUrl from your SAM outputs
echo 'VITE_API_BASE_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev' \
  > frontend/.env.local
```

Or create the file manually:

```
# frontend/.env.local
VITE_API_BASE_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev
```

> Do **not** add a trailing slash to the URL.

---

## Step 7 — Build and Host the Frontend

### Option A — Local development server (quickest)

```bash
npm run dev
# or: cd frontend && npm run dev
```

The app is served at [http://localhost:5173](http://localhost:5173). Use this option for demos and testing.

### Option B — Production build + S3 + CloudFront (recommended for production)

**7-1. Build the static assets:**

```bash
cd frontend && npm run build
# Output goes to frontend/dist/
```

**7-2. Create an S3 bucket:**

```bash
# Replace <YOUR_BUCKET_NAME> with a globally unique name, e.g. salesops-ai-frontend-<accountid>
aws s3 mb s3://<YOUR_BUCKET_NAME> --region us-east-1
```

**7-3. Upload the build:**

```bash
aws s3 sync frontend/dist/ s3://<YOUR_BUCKET_NAME>/ --delete
```

**7-4. Create a CloudFront distribution:**

Use the AWS Console (**CloudFront → Create distribution**) or the CLI:

```bash
aws cloudfront create-distribution \
  --origin-domain-name <YOUR_BUCKET_NAME>.s3.us-east-1.amazonaws.com \
  --default-root-object index.html
```

For a single-page application to handle client-side routing correctly, configure a custom error response in CloudFront: **Error code 403/404 → Response page path `/index.html` → HTTP Response code 200**.

> **CORS note:** The API Gateway template already allows `AllowOrigin: '*'`. For a production deployment you should restrict the CloudFront domain.

---

## Step 8 — Create the First Manager Account

All users who register through the UI are assigned the `rep` role by default. To bootstrap a manager account, register normally and then promote the user in DynamoDB.

### 8a. Register via the UI

Open the app (localhost:5173 or your CloudFront URL) and sign up with your email. Check your inbox for the Cognito confirmation email and complete the verification step.

### 8b. Find the user's `userId`

After confirming, look up the user's record. The `userId` is the Cognito sub (UUID):

```bash
# Replace table name with the UsersTableName from SAM outputs
# Replace <email@example.com> with the address you registered with
aws dynamodb query \
  --table-name "salesops-ai-dev-Users" \
  --index-name EmailIndex \
  --key-condition-expression "emailLower = :email" \
  --expression-attribute-values '{":email":{"S":"<email@example.com>"}}' \
  --region us-east-1 \
  --query "Items[0].userId.S" \
  --output text
```

### 8c. Promote the user to manager

```bash
# Replace <USER_ID> with the UUID returned above
aws dynamodb update-item \
  --table-name "salesops-ai-dev-Users" \
  --key '{"userId":{"S":"<USER_ID>"}}' \
  --update-expression "SET #r = :manager" \
  --expression-attribute-names '{"#r":"role"}' \
  --expression-attribute-values '{":manager":{"S":"manager"}}' \
  --region us-east-1
```

Sign out and sign back in. The UI will now display the manager dashboard with access to persona management, scenario authoring, and analytics.

---

## Step 9 — Verify the Deployment

### 9a. Run the automated smoke test

```bash
npm run smoke
```

The smoke test (`scripts/smoke.mjs`) reads `VITE_API_BASE_URL` from `frontend/.env.local` and runs the following checks:

| Check | Expected |
|---|---|
| `GET /health` | `200 {"status":"ok"}` |
| `GET /personas` without token | `401 Unauthorized` |
| `GET /exam/scenarios` without token | `401 Unauthorized` |
| `GET /dashboard` without token | `401 Unauthorized` |
| `POST /auth/signin` with empty body | `400 Bad Request` |

All five checks must print `OK` for the deployment to be considered healthy.

### 9b. Manual health check

Visit the `HealthUrl` from the SAM outputs in your browser or with curl:

```bash
curl https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/health
# Expected: {"status":"ok","stage":"dev","service":"salesops-ai"}
```

---

## Reference — SAM Outputs

After `sam deploy` completes, the following outputs are printed. These are also available at any time via:

```bash
aws cloudformation describe-stacks \
  --stack-name salesops-ai-dev \
  --region us-east-1 \
  --query "Stacks[0].Outputs"
```

| Output Key | Description | Used By |
|---|---|---|
| `ApiBaseUrl` | Root URL for all API calls | `frontend/.env.local` as `VITE_API_BASE_URL` |
| `HealthUrl` | Direct URL for `GET /health` | Smoke tests, uptime monitoring |
| `UserPoolId` | Cognito User Pool ID | Debugging / Cognito Console |
| `UserPoolClientId` | Cognito App Client ID | Auth Lambda env vars |
| `UsersTableName` | DynamoDB Users table name | DynamoDB Console, CLI commands |
| `PersonasTableName` | DynamoDB Personas table name | DynamoDB Console |
| `ScenariosTableName` | DynamoDB Scenarios table name | DynamoDB Console |
| `ExamSessionsTableName` | DynamoDB ExamSessions table name | DynamoDB Console |
| `ExamIssueReleaseQueueUrl` | SQS queue URL for exam issue timing | CreateExamSession Lambda |

---

## Reference — Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Full API Gateway base URL from SAM `ApiBaseUrl` output. No trailing slash. |

### Backend Lambda (set automatically by SAM via `template.yaml`)

These are injected by the SAM template into each Lambda at deploy time. You do not set these manually.

| Variable | Description |
|---|---|
| `USER_POOL_CLIENT_ID` | Cognito App Client ID — used by auth Lambdas |
| `USERS_TABLE_NAME` | DynamoDB Users table name |
| `PERSONAS_TABLE_NAME` | DynamoDB Personas table name |
| `SCENARIOS_TABLE_NAME` | DynamoDB Scenarios table name |
| `EXAM_SESSIONS_TABLE_NAME` | DynamoDB ExamSessions table name |
| `EXAM_ISSUE_RELEASE_QUEUE_URL` | SQS queue URL for timed issue releases |
| `LLM_SECRET_NAME` | Secrets Manager secret name (default: `salesops/dev/llm-api-keys`) |
| `OPENAI_MODEL` | OpenAI model ID (default: `gpt-4o-mini`) |
| `SERVICE_NAME` | Fixed to `salesops-ai` |
| `STAGE_NAME` | Deployment stage (default: `dev`) |
| `NODE_OPTIONS` | Fixed to `--enable-source-maps` |

### Smoke test overrides (optional)

| Variable | Description |
|---|---|
| `SMOKE_API_BASE_URL` | Override API URL for the smoke test without editing `.env.local` |

---

## Reference — DynamoDB Table Structure

All tables use **PAY_PER_REQUEST** (on-demand) billing. No capacity planning is required.

### `salesops-ai-dev-Users`

| Attribute | Type | Key | Notes |
|---|---|---|---|
| `userId` | String | Partition key (PK) | Cognito sub UUID |
| `emailLower` | String | GSI: `EmailIndex` PK | Lowercase email for case-insensitive lookup |
| `email` | String | — | Original-case email |
| `name` | String | — | Display name |
| `role` | String | — | `"rep"` or `"manager"` |
| `status` | String | — | `"active"` or `"suspended"` |
| `createdAt` | String | — | ISO-8601 timestamp |

### `salesops-ai-dev-Personas`

| Attribute | Type | Key | Notes |
|---|---|---|---|
| `personaId` | String | PK | UUID |
| `name` | String | — | Persona display name |
| `description` | String | — | Persona background / traits |
| `createdBy` | String | — | Manager `userId` |
| `createdAt` | String | — | ISO-8601 timestamp |

### `salesops-ai-dev-Scenarios`

| Attribute | Type | Key | Notes |
|---|---|---|---|
| `scenarioId` | String | PK | UUID |
| `title` | String | — | Scenario title |
| `status` | String | — | `"draft"`, `"published"`, `"archived"` |
| `personaId` | String | — | Linked persona |
| `issues` | List | — | Generated / edited inbox issues |
| `createdBy` | String | — | Manager `userId` |
| `createdAt` | String | — | ISO-8601 timestamp |

### `salesops-ai-dev-ExamSessions`

| Attribute | Type | Key | Notes |
|---|---|---|---|
| `sessionId` | String | PK | UUID |
| `recordId` | String | Sort key | Record type discriminator (e.g. `"META"`, `"ISSUE#<id>"`) |
| `userId` | String | — | Rep `userId` |
| `scenarioId` | String | — | Scenario being examined |
| `status` | String | — | `"active"`, `"completed"` |
| `startedAt` | String | — | ISO-8601 timestamp |
| `evaluation` | Map | — | AI scoring stored after evaluation Lambda runs |

---

## Teardown

To delete all AWS resources created by this project and avoid ongoing charges:

```bash
cd backend && sam delete --stack-name salesops-ai-dev --region us-east-1
```

SAM will prompt for confirmation before deleting the CloudFormation stack and all its resources (API Gateway, Lambda functions, Cognito User Pool, DynamoDB tables, SQS queue).

> **Note:** The Secrets Manager secret is not managed by SAM. Delete it separately:

```bash
aws secretsmanager delete-secret \
  --secret-id "salesops/dev/llm-api-keys" \
  --force-delete-without-recovery \
  --region us-east-1
```

If you created an S3 bucket for the frontend, empty and delete it:

```bash
aws s3 rm s3://<YOUR_BUCKET_NAME>/ --recursive
aws s3 rb s3://<YOUR_BUCKET_NAME>
```

---

## Troubleshooting

### Lambda logs via CloudWatch

Every Lambda function writes logs to CloudWatch Logs. The log group name follows the pattern `/aws/lambda/<FunctionName>`.

**Tail logs for a specific function:**

```bash
# Example: tail logs for the SignIn function
sam logs --stack-name salesops-ai-dev --name SignInFunction --tail --region us-east-1
```

**View all function log groups in the Console:**
CloudWatch → Log groups → filter by `/aws/lambda/salesops-ai-dev`

---

### Common Errors and Fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| `sam build` fails with "No such file or directory" | Running from wrong directory | Run from `backend/` or use `npm run sam:build` from root |
| `sam deploy` fails: "Role LabRole does not exist" | Not using AWS Academy, or role not created | Create the `LabRole` IAM role or update `template.yaml` with a valid role ARN |
| `GET /health` returns `403` or connection refused | Wrong `ApiBaseUrl`, trailing slash, or deploy not complete | Re-check the SAM output and `frontend/.env.local`; ensure no trailing slash |
| Frontend shows "Network Error" or CORS error | `VITE_API_BASE_URL` not set or pointing to wrong stage | Rebuild frontend after correcting `frontend/.env.local` |
| Sign-up succeeds but confirm code never arrives | Cognito email is blocked or in sandbox | Check spam folder; verify Cognito email identity in SES if in production |
| AI features return `500` | Secrets Manager secret missing or wrong key name | Run Step 5 and verify the secret name and JSON key `OPENAI_API_KEY` exactly |
| User logs in but sees rep UI after role promotion | Stale JWT token cached in browser | Sign out and sign back in to get a fresh token |
| Smoke test fails: `SMOKE_API_BASE_URL` not set | `frontend/.env.local` missing | Create the file per Step 6 or export `VITE_API_BASE_URL` before running |
| `sam delete` fails: "S3 bucket not empty" | SAM deployment bucket has artifacts | Empty the `aws-sam-cli-managed-default-*` bucket manually, then retry |

---

### Useful AWS CLI One-Liners

```bash
# List all Cognito users in the pool
aws cognito-idp list-users \
  --user-pool-id <UserPoolId> \
  --region us-east-1

# Scan the Users table (small tables only)
aws dynamodb scan \
  --table-name salesops-ai-dev-Users \
  --region us-east-1

# Check SQS queue depth
aws sqs get-queue-attributes \
  --queue-url <ExamIssueReleaseQueueUrl> \
  --attribute-names ApproximateNumberOfMessages \
  --region us-east-1

# Describe the CloudFormation stack
aws cloudformation describe-stacks \
  --stack-name salesops-ai-dev \
  --region us-east-1
```
