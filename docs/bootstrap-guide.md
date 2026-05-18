# SalesOps AI Bootstrap Guide

This guide explains what was created, how the frontend and backend connect, what AWS resources exist in the student lab, and what to do next.

For current status and next checklist, use [milestones.md](milestones.md).

## 1. What You Have Now

You now have a new npm workspace project:

```text
salesops-ai/
  frontend/   React + TypeScript app
  backend/    AWS SAM serverless backend
  docs/       project and AWS setup notes
  .github/    basic CI workflow
```

The first cloud backend is deployed and working in AWS Academy:

```text
AWS account: 388974895652
Region: us-east-1
Stack: salesops-ai-dev
API base URL: https://w4l1kyeotc.execute-api.us-east-1.amazonaws.com/dev
Health URL: https://w4l1kyeotc.execute-api.us-east-1.amazonaws.com/dev/health
```

The health endpoint was tested successfully:

```text
HTTP 200
{"status":"ok","service":"salesops-ai","stage":"dev"}
```

## 2. Frontend

The frontend is in `frontend/`.

It uses:

- Vite for local React development.
- React + TypeScript.
- `react-router-dom` for pages/routes.
- TanStack Query for API fetching and cache state.
- No Redux Toolkit yet.

Initial frontend routes:

```text
/login
/signup
/personas
/exam/start
/exam/:sessionId
/scenarios
/users
/dashboard
```

The frontend has a small API client that reads this environment variable:

```text
VITE_API_BASE_URL
```

I created `frontend/.env.local` with:

```text
VITE_API_BASE_URL=https://w4l1kyeotc.execute-api.us-east-1.amazonaws.com/dev
```

That file is intentionally not committed. It is local machine config.

To run the frontend:

```bash
npm run dev
```

Then open the Vite URL from your terminal. The app should call the deployed `/health` endpoint from AWS.

## 3. Backend

The backend is in `backend/`.

It uses AWS SAM with the `nodejs24.x` Lambda runtime, which deploys serverless AWS apps with CloudFormation.

Current backend pieces:

- `template.yaml`: infrastructure definition.
- `src/handlers/health.js`: Lambda handler for `GET /health`.
- `src/handlers/auth.js`: Lambda handlers for Cognito auth and DynamoDB user profiles.
- `src/handlers/content.js`: Lambda handlers for manager personas and scenarios.
- `samconfig.toml`: saved SAM deploy settings.

The first public backend endpoint is:

```text
GET /health
```

Auth endpoints are documented in [auth-setup.md](auth-setup.md):

```text
POST /auth/signup
POST /auth/confirm
POST /auth/signin
POST /auth/refresh
GET /auth/me
```

It returns a simple JSON payload:

```json
{
  "status": "ok",
  "service": "salesops-ai",
  "stage": "dev",
  "timestamp": "..."
}
```

This endpoint is only for proving that:

- AWS credentials work.
- SAM deploy works.
- API Gateway can call Lambda.
- The frontend can reach AWS.

## 4. AWS Things Created

SAM/CloudFormation created these AWS resources:

- CloudFormation stack: `salesops-ai-dev`
- API Gateway REST API
- API Gateway stage: `dev`
- Lambda function: `HealthFunction`
- Lambda functions for signup, confirm, signin, refresh, and me
- Lambda functions for persona and scenario management
- Cognito User Pool and web client
- DynamoDB table: `salesops-ai-dev-Users`
- DynamoDB table: `salesops-ai-dev-Personas`
- DynamoDB table: `salesops-ai-dev-Scenarios`
- DynamoDB table: `salesops-ai-dev-ExamSessions`
- SQS queue: `salesops-ai-dev-exam-issue-release`
- Lambda permission so API Gateway can invoke the function
- SAM managed S3 bucket for deployment artifacts

Important: the student lab blocked creating new IAM roles.

The first deploy failed because SAM tried to create a Lambda execution role:

```text
iam:CreateRole denied
```

To fix that, I changed the SAM template so Lambda uses the existing AWS Academy role:

```yaml
Role: !Sub "arn:aws:iam::${AWS::AccountId}:role/LabRole"
```

That means:

- We do not create IAM users.
- We do not create IAM roles.
- We use the lab-provided `LabRole`.
- This matches AWS Academy restrictions.

## 5. What I Did During Deploy

1. Verified AWS CLI and SAM CLI were installed.
2. Verified your AWS credentials worked:

```bash
aws sts get-caller-identity --region us-east-1
```

3. Confirmed account matched the lab:

```text
388974895652
```

4. Ran SAM build:

```bash
npm run sam:build
```

5. Ran SAM deploy:

```bash
npm run sam:deploy:guided
```

6. First deploy failed because AWS Academy denied `iam:CreateRole`.
7. Updated backend to use `LabRole`.
8. Deleted the failed `ROLLBACK_COMPLETE` CloudFormation stack.
9. Redeployed successfully.
10. Tested the deployed health endpoint with `curl`.
11. Connected the frontend by writing `frontend/.env.local`.
12. Verified frontend production build works.

## 6. Useful Commands

Check AWS identity:

```bash
aws sts get-caller-identity --region us-east-1
```

Build backend:

```bash
npm run sam:build
```

Deploy backend:

```bash
npm run sam:deploy:guided
```

Show deployed URLs:

```bash
aws cloudformation describe-stacks \
  --stack-name salesops-ai-dev \
  --region us-east-1 \
  --query "Stacks[0].Outputs" \
  --output table
```

Test backend:

```bash
curl -i https://w4l1kyeotc.execute-api.us-east-1.amazonaws.com/dev/health
```

Run frontend:

```bash
npm run dev
```

Build frontend:

```bash
npm run build --workspace frontend
```

## 7. Lab Rules To Remember

AWS Academy credentials are temporary.

When the lab session expires or restarts, you may need to copy fresh AWS CLI credentials from:

```text
AWS Academy Learner Lab -> AWS Details -> AWS CLI: Show
```

Do not paste AWS secrets into chat.

Do not commit:

- AWS access keys
- AWS session token
- `.env.local`
- OpenAI/Gemini/LLM API keys

You do not need:

- Docker
- EC2
- SSH key
- PEM file
- IAM user
- AWS Organizations
- Production security setup yet

## 8. What Is Next

Use [milestones.md](milestones.md). It has current checklist, blocked items, immediate deploy steps, and next product milestone.
