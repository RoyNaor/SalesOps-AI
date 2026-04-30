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

## 2. Configure the lab profile

Use the temporary AWS lab credentials from the student lab portal.

```bash
aws configure --profile salesops-lab
```

Use:

- Region: `us-east-1`
- Output format: `json`

Verify access:

```bash
aws sts get-caller-identity --profile salesops-lab
```

## 3. Deploy the health API

From the repo root:

```bash
npm install
npm run sam:build
npm run sam:deploy:guided
```

This SAM template uses the AWS Academy-provided `LabRole` for Lambda, because the student lab usually blocks creating new IAM roles.

During guided deploy, keep:

- Stack name: `salesops-ai-dev`
- Region: `us-east-1`
- Profile: `salesops-lab`
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

Open the app and check the login screen. The health panel should show backend status after `VITE_API_BASE_URL` is set.

## 5. Secrets rule

Do not commit AWS credentials, OpenAI keys, Gemini keys, or `.env.local`.

Later, store LLM provider keys in AWS Secrets Manager under a name like:

```text
salesops/dev/llm-api-keys
```
