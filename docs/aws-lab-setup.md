# AWS Lab Setup

This project targets a student AWS lab first. It does not require Docker or `sam local start-api`.

## 1. Verify local tools

```bash
node -v
npm -v
aws --version
sam --version
```

Node must be 20 or newer. The repo was created with Node already present on the machine.

If AWS CLI or SAM CLI are missing, install them from official AWS docs or with Homebrew:

```bash
brew install awscli aws-sam-cli
```

## 2. Configure lab credentials

Use the temporary AWS lab credentials from the student lab portal.

```bash
aws configure
```

Preferred path: paste fresh temporary credentials into the ignored root `.env` file each lab session, then load them into the current shell. Do not set `AWS_PROFILE`; the temporary keys are the deploy identity. The SAM template already uses `LabRole` for Lambda runtime permissions.

```bash
set -a; source .env; set +a
```

Use:

- Region: `us-east-1`
- Output format: `json`

Verify access:

```bash
aws sts get-caller-identity
```

## 3. Deploy the health API

From the repo root:

```bash
npm install
npm run sam:build
npm run sam:deploy:guided
```

This SAM template uses the AWS Academy-provided `LabRole` for Lambda, because the student lab usually blocks creating new IAM roles. It also creates Cognito auth resources plus DynamoDB `Users`, `Personas`, and `Scenarios` tables. Scenario issue generation reads an OpenAI API key from Secrets Manager.

During guided deploy, keep:

- Stack name: `salesops-ai-dev`
- Region: `us-east-1`
- Profile: none. Use loaded `.env` credentials.
- Confirm changes before deploy: `Y`
- Allow SAM CLI IAM role creation: `N` if asked; the template uses `LabRole`.
- Save arguments to configuration file: `Y`

After deploy, copy the `ApiBaseUrl` output.

## 4. Connect frontend to AWS API

Create `frontend/.env.local`:

```bash
VITE_API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
```

Start frontend:

```bash
npm run dev
```

Open the app and check the login screen. Sign up, confirm the email code, then sign in to reach the protected app routes.

Managers can create reusable personas at `/personas`, then create scenarios at `/scenarios` by selecting a persona, setting issue count, publishing, and generating editable issues.

After deploy, continue from [milestones.md](milestones.md).

## 5. LLM secret

Do not commit AWS credentials, OpenAI keys, Gemini keys, `.env`, or `.env.local`.

Store the OpenAI key in AWS Secrets Manager before generating scenario issues:

```bash
aws secretsmanager create-secret \
  --name salesops/dev/llm-api-keys \
  --secret-string '{"OPENAI_API_KEY":"PASTE_OPENAI_API_KEY"}'
```

If the secret already exists, update it:

```bash
aws secretsmanager put-secret-value \
  --secret-id salesops/dev/llm-api-keys \
  --secret-string '{"OPENAI_API_KEY":"PASTE_OPENAI_API_KEY"}'
```
