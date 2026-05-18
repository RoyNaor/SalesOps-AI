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
- [x] Local `.env` placeholder exists for AWS lab credentials.
- [x] Local checks pass: `typecheck`, `build`, `lint`, `diff --check`.
- [x] Fresh AWS lab credentials added to `.env`.
- [x] `sam build` completed with network access for backend dependencies.
- [x] `sam deploy --guided` completed after latest backend changes.
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
- [ ] Promote user to `manager`.
- [ ] Sign in as manager.
- [ ] Create persona.
- [ ] Create scenario with issue count.
- [ ] Publish scenario.
- [ ] Create or update `salesops/dev/llm-api-keys` with `OPENAI_API_KEY`.
- [ ] Generate scenario issues.
- [ ] Edit generated issue text.
- [ ] Sign in as rep.
- [ ] Start exam from a published scenario.
- [ ] Confirm SQS-delayed issues appear in the exam inbox over 3 minutes.

4. When smoke works, commit or publish changes.

## Next Product Milestone

Build rep exam sessions from published scenarios and generated issues.

- [x] Add exam session API for reps.
- [x] Load generated issues into rep inbox.
- [x] Release exam issues over time with SQS-backed pulse.
- [x] Save rep responses.
- [ ] Keep scoring/evaluation for next milestone.

## Later Milestones

- [ ] Add rep exam sessions.
- [x] Add response submission.
- [ ] Add scoring/evaluation.
- [ ] Add manager dashboard from real session data.
- [ ] Add reports and coaching notes.

## Docs Rule

Update this file after every feature, deploy, blocker, or major decision. Remove stale docs/artifacts when they duplicate this checklist.
