#!/usr/bin/env bash
# Resume the AWS deployment after infrastructure/frontend are already live.
# This script finishes the idempotent tail of scripts/deploy-to-aws.sh:
# demo users, manager promotion, smoke test, and Section 10 documentation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-salesops-ai-dev}"
MANAGER_EMAIL="${MANAGER_EMAIL:-manager@salesops-demo.com}"
MANAGER_PASS="${MANAGER_PASS:-Manager2024!}"
REP_EMAIL="${REP_EMAIL:-rep@salesops-demo.com}"
REP_PASS="${REP_PASS:-SalesRep2024!}"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
  echo "[env] Loaded credentials from .env"
fi

echo ""
echo "=== Resume Step 1 - Verifying tools and AWS identity ==="
for cmd in aws curl node npm python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found. Please install it and re-run." >&2
    exit 1
  fi
done

IDENTITY=$(aws sts get-caller-identity --region "$REGION" --output json)
ACCOUNT_ID=$(echo "$IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])")
echo "Account: $ACCOUNT_ID"
echo "ARN:     $(echo "$IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Arn'])")"

echo ""
echo "=== Resume Step 2 - Reading deployed stack outputs ==="
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs" \
  --output json)

get_output() {
  echo "$STACK_OUTPUTS" | python3 -c \
    "import sys,json; outputs={o['OutputKey']:o['OutputValue'] for o in json.load(sys.stdin)}; print(outputs.get('$1',''))"
}

API_BASE_URL=$(get_output ApiBaseUrl)
USER_POOL_ID=$(get_output UserPoolId)
USERS_TABLE=$(get_output UsersTableName)
BUCKET_NAME="${FRONTEND_BUCKET_NAME:-salesops-ai-frontend-${ACCOUNT_ID}}"
FRONTEND_URL="http://${BUCKET_NAME}.s3-website-${REGION}.amazonaws.com"

if [[ -z "$API_BASE_URL" || -z "$USER_POOL_ID" || -z "$USERS_TABLE" ]]; then
  echo "ERROR: Missing required stack outputs from $STACK_NAME." >&2
  exit 1
fi

echo "API base URL:   $API_BASE_URL"
echo "User Pool ID:   $USER_POOL_ID"
echo "Users table:    $USERS_TABLE"
echo "Frontend URL:   $FRONTEND_URL"

cognito_sub_for_email() {
  local email="$1"
  aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$email" \
    --region "$REGION" \
    --query "UserAttributes[?Name=='sub'].Value | [0]" \
    --output text 2>/dev/null || true
}

cognito_status_for_email() {
  local email="$1"
  aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$email" \
    --region "$REGION" \
    --query "UserStatus" \
    --output text 2>/dev/null || true
}

profile_user_id_for_email() {
  local email="$1"
  aws dynamodb query \
    --table-name "$USERS_TABLE" \
    --index-name EmailIndex \
    --key-condition-expression "emailLower = :e" \
    --expression-attribute-values "{\":e\":{\"S\":\"${email}\"}}" \
    --region "$REGION" \
    --query "Items[0].userId.S" \
    --output text 2>/dev/null || true
}

ensure_profile() {
  local email="$1"
  local full_name="$2"
  local role="$3"
  local user_id="$4"
  local now
  local profile_user_id

  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  profile_user_id=$(profile_user_id_for_email "$email")

  if [[ -n "$profile_user_id" && "$profile_user_id" != "None" ]]; then
    aws dynamodb update-item \
      --table-name "$USERS_TABLE" \
      --key "{\"userId\":{\"S\":\"${profile_user_id}\"}}" \
      --update-expression "SET #fn = :fn, #r = :r, #s = :s, updatedAt = :u" \
      --expression-attribute-names '{"#fn":"fullName","#r":"role","#s":"status"}' \
      --expression-attribute-values "{\":fn\":{\"S\":\"${full_name}\"},\":r\":{\"S\":\"${role}\"},\":s\":{\"S\":\"ACTIVE\"},\":u\":{\"S\":\"${now}\"}}" \
      --region "$REGION" > /dev/null
    echo "  DynamoDB profile repaired for $email (userId: $profile_user_id, role: $role)."
  else
    aws dynamodb put-item \
      --table-name "$USERS_TABLE" \
      --item "{\"userId\":{\"S\":\"${user_id}\"},\"email\":{\"S\":\"${email}\"},\"emailLower\":{\"S\":\"${email}\"},\"fullName\":{\"S\":\"${full_name}\"},\"role\":{\"S\":\"${role}\"},\"status\":{\"S\":\"ACTIVE\"},\"createdAt\":{\"S\":\"${now}\"},\"updatedAt\":{\"S\":\"${now}\"}}" \
      --region "$REGION" > /dev/null
    echo "  DynamoDB profile created for $email (userId: $user_id, role: $role)."
  fi
}

ensure_user() {
  local email="$1"
  local pass="$2"
  local full_name="$3"
  local role="$4"
  local user_id
  local status
  local signup_body
  local signup_status

  echo "  Ensuring $email..."
  user_id=$(cognito_sub_for_email "$email")

  if [[ -z "$user_id" || "$user_id" == "None" ]]; then
    signup_body=$(curl -sS -X POST "${API_BASE_URL}/auth/signup" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${email}\",\"password\":\"${pass}\",\"fullName\":\"${full_name}\"}" \
      -w $'\n%{http_code}')
    signup_status=$(printf "%s" "$signup_body" | tail -n 1)
    echo "    signup status: $signup_status"

    if [[ "$signup_status" != "200" && "$signup_status" != "409" ]]; then
      printf "%s\n" "$signup_body" | sed '$d'
      echo "ERROR: signup failed for $email." >&2
      exit 1
    fi

    user_id=$(cognito_sub_for_email "$email")
  fi

  if [[ -z "$user_id" || "$user_id" == "None" ]]; then
    echo "ERROR: Could not find Cognito user for $email after signup." >&2
    exit 1
  fi

  status=$(cognito_status_for_email "$email")
  if [[ "$status" != "CONFIRMED" ]]; then
    aws cognito-idp admin-confirm-sign-up \
      --user-pool-id "$USER_POOL_ID" \
      --username "$email" \
      --region "$REGION"
    echo "    Cognito user confirmed."
  else
    echo "    Cognito user already confirmed."
  fi

  aws cognito-idp admin-set-user-password \
    --user-pool-id "$USER_POOL_ID" \
    --username "$email" \
    --password "$pass" \
    --permanent \
    --region "$REGION"
  echo "    Password set permanent."

  ensure_profile "$email" "$full_name" "$role" "$user_id"
}

echo ""
echo "=== Resume Step 3 - Creating or repairing demo users ==="
ensure_user "$MANAGER_EMAIL" "$MANAGER_PASS" "Demo Manager" "manager"
ensure_user "$REP_EMAIL" "$REP_PASS" "Demo Rep" "rep"

echo ""
echo "=== Resume Step 4 - Smoke test ==="
SMOKE_API_BASE_URL="$API_BASE_URL" npm run smoke

echo ""
echo "=== Resume Step 5 - Writing Section 10 document ==="
mkdir -p "$REPO_ROOT/10"
cat > "$REPO_ROOT/10/section-10-live-system.md" <<SECTION10
# Section 10 - Live System

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

| Field | Value |
|-------|-------|
| Email | ${MANAGER_EMAIL} |
| Password | ${MANAGER_PASS} |
| Role | manager |
| Access | Dashboard, Personas, Scenarios, Users, Exam |

### Sales Rep account

| Field | Value |
|-------|-------|
| Email | ${REP_EMAIL} |
| Password | ${REP_PASS} |
| Role | rep |
| Access | Exam (start, take, and results) |

## Git Repository

https://github.com/roynaor/salesops-ai

## AWS Resources (Account ${ACCOUNT_ID}, ${REGION})

| Resource | Name / ID |
|----------|-----------|
| CloudFormation stack | ${STACK_NAME} |
| API Gateway stage | dev |
| Cognito User Pool | ${USER_POOL_ID} |
| DynamoDB Users | ${USERS_TABLE} |
| S3 frontend bucket | ${BUCKET_NAME} |

SECTION10

echo "Section 10 document written to 10/section-10-live-system.md"

echo ""
echo "============================================================"
echo " RESUME COMPLETE"
echo "============================================================"
echo " Frontend:  ${FRONTEND_URL}"
echo " API:       ${API_BASE_URL}"
echo " Manager:   ${MANAGER_EMAIL} / ${MANAGER_PASS}"
echo " Rep:       ${REP_EMAIL} / ${REP_PASS}"
echo "============================================================"
