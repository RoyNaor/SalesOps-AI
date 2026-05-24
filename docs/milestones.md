# SalesOps AI Milestones

This file is project source of truth for what is done, blocked, and next.

## Current Status

- [x] React/Vite app shell exists.
- [x] AWS SAM backend exists.
- [x] Cognito auth + DynamoDB `Users` profile flow exists.
- [x] Manager-only persona API + `/personas` page exists.
- [x] Manager-only scenario API + `/scenarios` page exists.
- [x] Scenarios can select a persona and publish.
- [x] Managers can set per-scenario issue count.
- [x] Local LLM issue generation API + Scenario Builder UI exists.
- [x] Generated scenario issues are editable and stored on the scenario.
- [x] Rep exam start page exists at `/exam/start`.
- [x] Rep exam session API exists with SQS-scheduled issue release pulse.
- [x] Rep inbox loads visible session issues and appends new issues with toast notification.
- [x] Rep response submission and AI scoring/evaluation results exist.
- [x] Manager dashboard aggregates real exam session data.
- [x] Manager user role/status editing exists.
- [x] Scenario clone/archive and readiness checklist exist.
- [x] Auth resend confirmation and forgot-password recovery exist.
- [x] Public cloud smoke script exists.
- [x] Local `.env` placeholder exists for AWS lab credentials.
- [x] Local checks pass: `typecheck`, `build`, `lint`, `diff --check`.
- [ ] Fresh AWS lab credentials added to `.env`.
- [x] `sam build` completed with network access for backend dependencies.
- [ ] `sam deploy --guided` completed after latest backend changes.
- [x] Cloud `/health` smoke test passed.
- [x] Cloud `/personas` rejects unauthenticated calls with `401`.
- [ ] Cloud smoke test done for auth, personas, and scenarios.
- [ ] Cloud smoke test done for issue generation.

## Immediate Next

1. Keep fresh AWS Academy credentials in root `.env`:

```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...
AWS_REGION=us-east-1
AWS_DEFAULT_REGION=us-east-1
```

2. Load env and verify identity if shell was restarted:

```bash
set -a; source .env; set +a
aws sts get-caller-identity
```

3. Smoke test app flow:

- [ ] Sign up user.
- [ ] Confirm email.
- [ ] Promote user to `manager` from `/users` or DynamoDB if first manager is not created yet.
- [ ] Sign in as manager.
- [ ] Resend confirmation code and forgot-password flow tested.
- [ ] Create persona.
- [ ] Create scenario with issue count.
- [ ] Publish scenario.
- [ ] Confirm scenario readiness checklist.
- [ ] Create or update `salesops/dev/llm-api-keys` with `OPENAI_API_KEY`.
- [ ] Generate scenario issues.
- [ ] Confirm demo issue fallback appears if OpenAI is unavailable.
- [ ] Edit generated issue text.
- [ ] Clone and archive scenario.
- [ ] Sign in as rep.
- [ ] Start exam from a published scenario.
- [ ] Confirm SQS-delayed issues appear in the exam inbox over 3 minutes.

4. When smoke works, commit or publish changes.

## Later Milestones

- [ ] Add reports and coaching notes.
- [ ] Add richer manager analytics and coaching notes.
- [ ] Add automated end-to-end cloud smoke with disposable test users.

## Docs Rule

Update this file after every feature, deploy, blocker, or major decision. Remove stale docs/artifacts when they duplicate this checklist.
