# Auth Setup

SalesOps AI uses Cognito for credentials and DynamoDB for app profile data.

## Backend Resources

SAM creates:

- Cognito User Pool: `salesops-ai-${StageName}-users`
- Cognito User Pool Client: `salesops-ai-${StageName}-web`
- DynamoDB table: `salesops-ai-${StageName}-Users`
- DynamoDB GSI: `EmailIndex`

The `Users` table stores profile and authorization data only:

```json
{
  "userId": "cognito-sub",
  "email": "rep@example.com",
  "emailLower": "rep@example.com",
  "fullName": "Rep Name",
  "role": "rep",
  "status": "ACTIVE",
  "createdAt": "2026-05-03T00:00:00.000Z",
  "updatedAt": "2026-05-03T00:00:00.000Z"
}
```

Passwords are never stored in DynamoDB. Cognito owns credentials, confirmation codes, and session tokens.

## API Flow

Public endpoints:

```text
POST /auth/signup
POST /auth/confirm
POST /auth/signin
POST /auth/refresh
```

Protected endpoint:

```text
GET /auth/me
Authorization: Bearer <idToken>
```

Signup is open. New users always start with:

```text
role=rep
status=PENDING_CONFIRMATION
```

After email confirmation, status becomes:

```text
status=ACTIVE
```

## Deploy

From repo root:

```bash
npm install
npm run sam:build
npm run sam:deploy:guided
```

Keep the lab defaults:

```text
Stack name: salesops-ai-dev
Region: us-east-1
Profile: none. Use loaded `.env` credentials.
```

The template still uses the AWS Academy `LabRole` for Lambda execution and does not create IAM roles.

After deploy, update local frontend API config if the API base URL changed:

```bash
VITE_API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
```

## Promote Manager

Manager access is profile-based. Promote a confirmed user by updating the DynamoDB `role` field:

```bash
aws dynamodb update-item \
  --table-name salesops-ai-dev-Users \
  --key '{"userId":{"S":"COGNITO_SUB_HERE"}}' \
  --update-expression 'SET #role = :role, updatedAt = :updatedAt' \
  --expression-attribute-names '{"#role":"role"}' \
  --expression-attribute-values '{":role":{"S":"manager"},":updatedAt":{"S":"2026-05-03T00:00:00.000Z"}}' \
  --region us-east-1
```

Find a user by email:

```bash
aws dynamodb query \
  --table-name salesops-ai-dev-Users \
  --index-name EmailIndex \
  --key-condition-expression 'emailLower = :email' \
  --expression-attribute-values '{":email":{"S":"rep@example.com"}}' \
  --region us-east-1
```

## Frontend Behavior

- `/login` and `/signup` render outside the app sidebar.
- `/exam/start`, `/exam/:sessionId`, `/personas`, `/scenarios`, and `/dashboard` require an active session.
- Reps can access `/exam/start` and their own `/exam/:sessionId` session inbox.
- Managers can access `/personas`, `/scenarios`, `/users`, and `/dashboard`.
- Sign out clears local session storage.
