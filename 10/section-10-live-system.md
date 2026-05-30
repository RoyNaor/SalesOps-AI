# Section 10 - Live System

## System URL

http://salesops-ai-frontend-388974895652.s3-website-us-east-1.amazonaws.com

## API (AWS API Gateway)

https://w4l1kyeotc.execute-api.us-east-1.amazonaws.com/dev

### Health check

```
GET https://w4l1kyeotc.execute-api.us-east-1.amazonaws.com/dev/health
```

## Demo Credentials

### Manager account

| Field | Value |
|-------|-------|
| Email | manager@salesops-demo.com |
| Password | Manager2024! |
| Role | manager |
| Access | Dashboard, Personas, Scenarios, Users, Exam |

### Sales Rep account

| Field | Value |
|-------|-------|
| Email | rep@salesops-demo.com |
| Password | SalesRep2024! |
| Role | rep |
| Access | Exam (start, take, and results) |

## Git Repository

https://github.com/roynaor/salesops-ai

## AWS Resources (Account 388974895652, us-east-1)

| Resource | Name / ID |
|----------|-----------|
| CloudFormation stack | salesops-ai-dev |
| API Gateway stage | dev |
| Cognito User Pool | us-east-1_PFaRyaSV1 |
| DynamoDB Users | salesops-ai-dev-Users |
| S3 frontend bucket | salesops-ai-frontend-388974895652 |
