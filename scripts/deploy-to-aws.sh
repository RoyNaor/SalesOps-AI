#!/usr/bin/env bash
# SalesOps AI — Full AWS deployment script
# Run from the repository root after filling in .env with fresh lab credentials.
# Usage:  bash scripts/deploy-to-aws.sh [OPENAI_API_KEY]
# The OpenAI key argument is optional — if omitted the system runs in demo mode
# (scenario issues are generated as clearly-labelled stubs, AI evaluation is skipped).

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

##############################################################################
# 0. Load credentials from .env if present
##############################################################################
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
  echo "[env] Loaded credentials from .env"
fi

OPENAI_KEY="${1:-${OPENAI_API_KEY:-}}"

##############################################################################
# 1. Verify tools
##############################################################################
echo ""
echo "=== Step 1 — Verifying tools ==="
for cmd in aws sam node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found. Please install it and re-run." >&2
    exit 1
  fi
done
echo "node $(node --version)  npm $(npm --version)  $(aws --version 2>&1 | head -1)  $(sam --version 2>&1)"

##############################################################################
# 2. Verify AWS credentials
##############################################################################
echo ""
echo "=== Step 2 — Verifying AWS credentials ==="
IDENTITY=$(aws sts get-caller-identity --region us-east-1 --output json)
ACCOUNT_ID=$(echo "$IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])")
echo "Account: $ACCOUNT_ID"
echo "ARN:     $(echo "$IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Arn'])")"

##############################################################################
# 3. Install npm dependencies
##############################################################################
echo ""
echo "=== Step 3 — Installing npm dependencies ==="
npm install --silent

##############################################################################
# 4. Build and deploy backend (SAM)
##############################################################################
echo ""
echo "=== Step 4 — SAM build ==="
cd "$REPO_ROOT/backend"
sam build

echo ""
echo "=== Step 4b — SAM deploy ==="
sam deploy \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --region us-east-1

echo ""
echo "=== Step 4c — Reading SAM outputs ==="
cd "$REPO_ROOT"
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name salesops-ai-dev \
  --region us-east-1 \
  --query "Stacks[0].Outputs" \
  --output json)

get_output() {
  echo "$STACK_OUTPUTS" | python3 -c \
    "import sys,json; outputs={o['OutputKey']:o['OutputValue'] for o in json.load(sys.stdin)}; print(outputs['$1'])"
}

API_BASE_URL=$(get_output ApiBaseUrl)
USER_POOL_ID=$(get_output UserPoolId)
USERS_TABLE=$(get_output UsersTableName)
echo "API base URL:   $API_BASE_URL"
echo "User Pool ID:   $USER_POOL_ID"
echo "Users table:    $USERS_TABLE"

##############################################################################
# 5. Create / update OpenAI secret in Secrets Manager
##############################################################################
echo ""
echo "=== Step 5 — Secrets Manager (OpenAI key) ==="
SECRET_NAME="salesops/dev/llm-api-keys"
if [[ -n "$OPENAI_KEY" ]]; then
  SECRET_PAYLOAD="{\"OPENAI_API_KEY\":\"${OPENAI_KEY}\"}"
  if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region us-east-1 &>/dev/null; then
    aws secretsmanager put-secret-value \
      --secret-id "$SECRET_NAME" \
      --secret-string "$SECRET_PAYLOAD" \
      --region us-east-1 > /dev/null
    echo "Updated existing secret '$SECRET_NAME'."
  else
    aws secretsmanager create-secret \
      --name "$SECRET_NAME" \
      --secret-string "$SECRET_PAYLOAD" \
      --region us-east-1 > /dev/null
    echo "Created secret '$SECRET_NAME'."
  fi
else
  echo "No OpenAI key provided — AI features will run in demo/stub mode."
  DEMO_PAYLOAD="{\"OPENAI_API_KEY\":\"demo\"}"
  if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region us-east-1 &>/dev/null; then
    aws secretsmanager create-secret \
      --name "$SECRET_NAME" \
      --secret-string "$DEMO_PAYLOAD" \
      --region us-east-1 > /dev/null
    echo "Created placeholder secret (demo mode)."
  else
    echo "Secret already exists — leaving unchanged."
  fi
fi

##############################################################################
# 6. Build frontend
##############################################################################
echo ""
echo "=== Step 6 — Building frontend ==="
echo "VITE_API_BASE_URL=$API_BASE_URL" > "$REPO_ROOT/frontend/.env.local"
cd "$REPO_ROOT"
npm run build --workspace frontend
echo "Frontend built to frontend/dist/"

##############################################################################
# 7. Host frontend on S3
##############################################################################
echo ""
echo "=== Step 7 — Hosting frontend on S3 ==="
BUCKET_NAME="salesops-ai-frontend-${ACCOUNT_ID}"

if ! aws s3api head-bucket --bucket "$BUCKET_NAME" --region us-east-1 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region us-east-1 \
    --output text > /dev/null
  echo "Created bucket: $BUCKET_NAME"
else
  echo "Bucket already exists: $BUCKET_NAME"
fi

# Disable block-public-access so website hosting works
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  --region us-east-1

# Enable static website hosting
aws s3api put-bucket-website \
  --bucket "$BUCKET_NAME" \
  --website-configuration '{
    "IndexDocument":{"Suffix":"index.html"},
    "ErrorDocument":{"Key":"index.html"}
  }' \
  --region us-east-1

# Apply public-read bucket policy
aws s3api put-bucket-policy \
  --bucket "$BUCKET_NAME" \
  --policy "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Principal\":\"*\",
      \"Action\":\"s3:GetObject\",
      \"Resource\":\"arn:aws:s3:::${BUCKET_NAME}/*\"
    }]
  }" \
  --region us-east-1

# Upload build artifacts
UPLOAD_COUNT=$(
  aws s3 sync "$REPO_ROOT/frontend/dist/" "s3://${BUCKET_NAME}/" \
    --delete \
    --region us-east-1 \
    --output text | awk '/upload:/ { count++ } END { print count + 0 }'
)
echo "$UPLOAD_COUNT files uploaded"

FRONTEND_URL="http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com"
echo "Frontend live at: $FRONTEND_URL"

##############################################################################
# 8. Create demo users
##############################################################################
echo ""
echo "=== Step 8 — Creating demo users ==="
MANAGER_EMAIL="manager@salesops-demo.com"
MANAGER_PASS="Manager2024!"
REP_EMAIL="rep@salesops-demo.com"
REP_PASS="SalesRep2024!"

create_user() {
  local EMAIL="$1"
  local PASS="$2"
  local DISPLAY="$3"

  # Check if user already exists in Cognito
  if aws cognito-idp admin-get-user \
       --user-pool-id "$USER_POOL_ID" \
       --username "$EMAIL" \
       --region us-east-1 &>/dev/null; then
    echo "  $EMAIL already exists in Cognito — resetting password."
    aws cognito-idp admin-set-user-password \
      --user-pool-id "$USER_POOL_ID" \
      --username "$EMAIL" \
      --password "$PASS" \
      --permanent \
      --region us-east-1
  else
    # Register via API so DynamoDB profile is created
    SIGNUP_RESULT=$(curl -s -X POST "${API_BASE_URL}/auth/signup" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"fullName\":\"${DISPLAY}\"}")
    echo "  signup $EMAIL: $(echo "$SIGNUP_RESULT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("message","ok"))' 2>/dev/null || echo "$SIGNUP_RESULT")"

    # Admin-confirm so no email verification needed
    aws cognito-idp admin-confirm-sign-up \
      --user-pool-id "$USER_POOL_ID" \
      --username "$EMAIL" \
      --region us-east-1
    echo "  $EMAIL confirmed."

    # Set permanent password (bypasses force-change-password state)
    aws cognito-idp admin-set-user-password \
      --user-pool-id "$USER_POOL_ID" \
      --username "$EMAIL" \
      --password "$PASS" \
      --permanent \
      --region us-east-1
    echo "  $EMAIL password set permanent."
  fi
}

create_user "$MANAGER_EMAIL" "$MANAGER_PASS" "Demo Manager"
create_user "$REP_EMAIL"     "$REP_PASS"     "Demo Rep"

# Promote manager user to manager role in DynamoDB
echo "  Promoting $MANAGER_EMAIL to manager role in DynamoDB..."
MANAGER_USER_ID=$(aws dynamodb query \
  --table-name "$USERS_TABLE" \
  --index-name EmailIndex \
  --key-condition-expression "emailLower = :e" \
  --expression-attribute-values "{\":e\":{\"S\":\"${MANAGER_EMAIL}\"}}" \
  --region us-east-1 \
  --query "Items[0].userId.S" \
  --output text 2>/dev/null || echo "")

if [[ -n "$MANAGER_USER_ID" && "$MANAGER_USER_ID" != "None" ]]; then
  aws dynamodb update-item \
    --table-name "$USERS_TABLE" \
    --key "{\"userId\":{\"S\":\"${MANAGER_USER_ID}\"}}" \
    --update-expression "SET #r = :m" \
    --expression-attribute-names '{"#r":"role"}' \
    --expression-attribute-values '{":m":{"S":"manager"}}' \
    --region us-east-1
  echo "  $MANAGER_EMAIL promoted to manager (userId: $MANAGER_USER_ID)."
else
  echo "  WARNING: Could not find manager userId — promote manually after first login."
fi

##############################################################################
# 9. Smoke test
##############################################################################
echo ""
echo "=== Step 9 — Smoke test ==="
SMOKE_API_BASE_URL="$API_BASE_URL" npm run smoke

##############################################################################
# 10. Write Section 10 document
##############################################################################
echo ""
echo "=== Step 10 — Writing Section 10 document ==="

cat > "$REPO_ROOT/10/section-10-live-system.md" <<SECTION10
# Section 10 — Live System

## System URL

${FRONTEND_URL}

## API (AWS API Gateway)

${API_BASE_URL}

### Health check

\`\`\`
GET ${API_BASE_URL}/health
\`\`\`

## Demo Credentials

### Manager account

| Field    | Value                          |
|----------|-------------------------------|
| Email    | ${MANAGER_EMAIL}              |
| Password | ${MANAGER_PASS}               |
| Role     | manager                        |
| Access   | Dashboard, Personas, Scenarios, Users, Exam |

### Sales Rep account

| Field    | Value                          |
|----------|-------------------------------|
| Email    | ${REP_EMAIL}                  |
| Password | ${REP_PASS}                   |
| Role     | rep                            |
| Access   | Exam (start + take + results)  |

## Git Repository

https://github.com/roynaor/salesops-ai

## AWS Resources (Account ${ACCOUNT_ID}, us-east-1)

| Resource              | Name / ID                                      |
|-----------------------|------------------------------------------------|
| CloudFormation stack  | salesops-ai-dev                               |
| API Gateway stage     | dev                                            |
| Cognito User Pool     | ${USER_POOL_ID}                               |
| DynamoDB — Users      | ${USERS_TABLE}                                |
| S3 frontend bucket    | ${BUCKET_NAME}                                |

SECTION10

echo "Section 10 document written to 10/section-10-live-system.md"

##############################################################################
# Done
##############################################################################
echo ""
echo "============================================================"
echo " DEPLOYMENT COMPLETE"
echo "============================================================"
echo " Frontend:  ${FRONTEND_URL}"
echo " API:       ${API_BASE_URL}"
echo " Manager:   ${MANAGER_EMAIL}  /  ${MANAGER_PASS}"
echo " Rep:       ${REP_EMAIL}  /  ${REP_PASS}"
echo " Git:       https://github.com/roynaor/salesops-ai"
echo "============================================================"
