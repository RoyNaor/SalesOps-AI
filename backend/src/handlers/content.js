"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { SendMessageCommand, SQSClient } = require("@aws-sdk/client-sqs");
const { randomUUID } = require("crypto");

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const usersTableName = process.env.USERS_TABLE_NAME;
const personasTableName = process.env.PERSONAS_TABLE_NAME;
const scenariosTableName = process.env.SCENARIOS_TABLE_NAME;
const examSessionsTableName = process.env.EXAM_SESSIONS_TABLE_NAME;
const examIssueReleaseQueueUrl = process.env.EXAM_ISSUE_RELEASE_QUEUE_URL;
const llmSecretName = process.env.LLM_SECRET_NAME || "salesops/dev/llm-api-keys";
const openAiModel = process.env.OPENAI_MODEL || "gpt-5-mini";
const defaultIssueCount = 5;
const minIssueCount = 1;
const maxIssueCount = 20;
const examDurationSeconds = 180;
const maxExamResponseLength = 4000;
const examMetaRecordId = "META";
const examEvaluationRecordId = "EVALUATION";
const examIssueRecordPrefix = "ISSUE#";
const dashboardPassScore = 80;
const issueDifficulties = new Set(["EASY", "MEDIUM", "HARD"]);
const userRoles = new Set(["rep", "manager"]);
const editableUserStatuses = new Set(["ACTIVE", "SUSPENDED"]);
const scenarioStatuses = new Set(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const evaluationRubricWeights = {
  kindness: 0.25,
  professionalism: 0.25,
  resolution: 0.25,
  clarity: 0.15,
  helpfulIdeas: 0.1
};

const dynamodb = new DynamoDBClient({ region });
const secretsManager = new SecretsManagerClient({ region });
const sqs = new SQSClient({ region });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    },
    body: JSON.stringify(payload)
  };
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  const body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(body);
}

function requiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => requiredString(item)).filter(Boolean);
}

function publicError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode, expose: true });
}

function parseIssueCount(value, fallback = defaultIssueCount) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const issueCount = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(issueCount) || issueCount < minIssueCount || issueCount > maxIssueCount) {
    throw publicError(400, `Issue count must be an integer between ${minIssueCount} and ${maxIssueCount}.`);
  }

  return issueCount;
}

function storedIssueCount(value) {
  const issueCount = Number(value);
  return Number.isInteger(issueCount) && issueCount >= minIssueCount && issueCount <= maxIssueCount
    ? issueCount
    : defaultIssueCount;
}

function validateDifficulty(value) {
  const difficulty = requiredString(value).toUpperCase();
  if (!issueDifficulties.has(difficulty)) {
    throw publicError(400, "Issue difficulty must be EASY, MEDIUM, or HARD.");
  }

  return difficulty;
}

function newId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function toProfile(item) {
  if (!item) {
    return null;
  }

  return {
    userId: item.userId?.S || "",
    role: item.role?.S || "rep",
    status: item.status?.S || "ACTIVE"
  };
}

function userToItem(user) {
  return {
    userId: { S: user.userId },
    email: { S: user.email },
    emailLower: { S: user.emailLower },
    fullName: { S: user.fullName },
    role: { S: user.role },
    status: { S: user.status },
    createdAt: { S: user.createdAt },
    updatedAt: { S: user.updatedAt }
  };
}

function itemToUser(item) {
  return {
    userId: item.userId?.S || "",
    email: item.email?.S || "",
    emailLower: item.emailLower?.S || "",
    fullName: item.fullName?.S || "",
    role: item.role?.S || "rep",
    status: item.status?.S || "ACTIVE",
    createdAt: item.createdAt?.S || "",
    updatedAt: item.updatedAt?.S || ""
  };
}

async function requireManager(event) {
  if (!usersTableName || !personasTableName || !scenariosTableName) {
    throw Object.assign(new Error("Content service is not configured."), { statusCode: 500 });
  }

  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) {
    throw Object.assign(new Error("Missing authenticated user."), { statusCode: 401 });
  }

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: usersTableName,
      Key: {
        userId: { S: userId }
      }
    })
  );

  const profile = toProfile(result.Item);
  if (profile?.role !== "manager" || profile.status !== "ACTIVE") {
    throw Object.assign(new Error("Manager access required."), { statusCode: 403 });
  }

  return profile;
}

async function requireActiveUser(event) {
  if (!usersTableName) {
    throw Object.assign(new Error("Content service is not configured."), { statusCode: 500 });
  }

  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) {
    throw Object.assign(new Error("Missing authenticated user."), { statusCode: 401 });
  }

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: usersTableName,
      Key: {
        userId: { S: userId }
      }
    })
  );

  const profile = toProfile(result.Item);
  if (!profile || profile.status !== "ACTIVE") {
    throw Object.assign(new Error("Active user required."), { statusCode: 403 });
  }

  return profile;
}

async function requireRep(event) {
  if (!scenariosTableName || !examSessionsTableName) {
    throw Object.assign(new Error("Exam service is not configured."), { statusCode: 500 });
  }

  const profile = await requireActiveUser(event);
  if (profile.role !== "rep") {
    throw Object.assign(new Error("Rep access required."), { statusCode: 403 });
  }

  return profile;
}

function personaToItem(persona) {
  return {
    personaId: { S: persona.personaId },
    name: { S: persona.name },
    description: { S: persona.description },
    behaviorNotes: { S: persona.behaviorNotes },
    status: { S: persona.status },
    createdAt: { S: persona.createdAt },
    updatedAt: { S: persona.updatedAt }
  };
}

function itemToPersona(item) {
  return {
    personaId: item.personaId?.S || "",
    name: item.name?.S || "",
    description: item.description?.S || "",
    behaviorNotes: item.behaviorNotes?.S || "",
    status: item.status?.S || "ACTIVE",
    createdAt: item.createdAt?.S || "",
    updatedAt: item.updatedAt?.S || ""
  };
}

function issueToAttribute(issue) {
  return {
    M: {
      issueId: { S: issue.issueId },
      personaId: { S: issue.personaId },
      customerName: { S: issue.customerName },
      subject: { S: issue.subject },
      message: { S: issue.message },
      difficulty: { S: issue.difficulty },
      status: { S: issue.status },
      createdAt: { S: issue.createdAt },
      updatedAt: { S: issue.updatedAt }
    }
  };
}

function attributeToIssue(attribute) {
  const item = attribute.M || {};
  return {
    issueId: item.issueId?.S || "",
    personaId: item.personaId?.S || "",
    customerName: item.customerName?.S || "",
    subject: item.subject?.S || "",
    message: item.message?.S || "",
    difficulty: item.difficulty?.S || "MEDIUM",
    status: item.status?.S || "DRAFT",
    createdAt: item.createdAt?.S || "",
    updatedAt: item.updatedAt?.S || ""
  };
}

function scenarioToItem(scenario) {
  const item = {
    scenarioId: { S: scenario.scenarioId },
    title: { S: scenario.title },
    description: { S: scenario.description },
    personaIds: { L: scenario.personaIds.map((personaId) => ({ S: personaId })) },
    issueCount: { N: String(scenario.issueCount) },
    issues: { L: (scenario.issues || []).map(issueToAttribute) },
    status: { S: scenario.status },
    createdAt: { S: scenario.createdAt },
    updatedAt: { S: scenario.updatedAt }
  };

  if (scenario.issuesGeneratedAt) {
    item.issuesGeneratedAt = { S: scenario.issuesGeneratedAt };
  }

  if (scenario.generationSource) {
    item.generationSource = { S: scenario.generationSource };
  }

  if (scenario.generationWarning) {
    item.generationWarning = { S: scenario.generationWarning };
  }

  return item;
}

function itemToScenario(item) {
  return {
    scenarioId: item.scenarioId?.S || "",
    title: item.title?.S || "",
    description: item.description?.S || "",
    personaIds: (item.personaIds?.L || []).map((personaId) => personaId.S).filter(Boolean),
    issueCount: storedIssueCount(item.issueCount?.N),
    issues: (item.issues?.L || []).map(attributeToIssue).filter((issue) => issue.issueId),
    issuesGeneratedAt: item.issuesGeneratedAt?.S || "",
    generationSource: item.generationSource?.S || "",
    generationWarning: item.generationWarning?.S || "",
    status: item.status?.S || "DRAFT",
    createdAt: item.createdAt?.S || "",
    updatedAt: item.updatedAt?.S || ""
  };
}

function examScenarioSummary(scenario) {
  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    description: scenario.description,
    issueCount: scenario.issueCount,
    generatedIssueCount: scenario.issues.length
  };
}

function examMetaToItem(meta) {
  return {
    sessionId: { S: meta.sessionId },
    recordId: { S: examMetaRecordId },
    userId: { S: meta.userId },
    scenarioId: { S: meta.scenarioId },
    title: { S: meta.title },
    description: { S: meta.description },
    durationSeconds: { N: String(meta.durationSeconds) },
    totalIssues: { N: String(meta.totalIssues) },
    sessionStatus: { S: meta.status },
    startedAt: { S: meta.startedAt },
    endsAt: { S: meta.endsAt },
    createdAt: { S: meta.createdAt },
    updatedAt: { S: meta.updatedAt }
  };
}

function itemToExamMeta(item) {
  return {
    sessionId: item.sessionId?.S || "",
    userId: item.userId?.S || "",
    scenarioId: item.scenarioId?.S || "",
    title: item.title?.S || "",
    description: item.description?.S || "",
    durationSeconds: Number(item.durationSeconds?.N || examDurationSeconds),
    totalIssues: Number(item.totalIssues?.N || 0),
    status: item.sessionStatus?.S || "ACTIVE",
    startedAt: item.startedAt?.S || "",
    endsAt: item.endsAt?.S || "",
    createdAt: item.createdAt?.S || "",
    updatedAt: item.updatedAt?.S || ""
  };
}

function examIssueToItem(sessionId, issue, orderIndex, releaseAt, isVisible, now) {
  return {
    sessionId: { S: sessionId },
    recordId: { S: `${examIssueRecordPrefix}${issue.issueId}` },
    issueId: { S: issue.issueId },
    customerName: { S: issue.customerName },
    subject: { S: issue.subject },
    message: { S: issue.message },
    difficulty: { S: issue.difficulty },
    orderIndex: { N: String(orderIndex) },
    releaseAt: { S: releaseAt },
    issueStatus: { S: isVisible ? "VISIBLE" : "PENDING" },
    isVisible: { BOOL: isVisible },
    visibleAt: { S: isVisible ? now : "" },
    doneAt: { S: "" },
    responses: { L: [] },
    createdAt: { S: now },
    updatedAt: { S: now }
  };
}

function examResponseToItem(response) {
  return {
    M: {
      responseId: { S: response.responseId },
      message: { S: response.message },
      createdAt: { S: response.createdAt }
    }
  };
}

function itemToExamResponses(item) {
  return (item.responses?.L || [])
    .map((response) => response.M)
    .filter(Boolean)
    .map((response) => ({
      responseId: response.responseId?.S || "",
      message: response.message?.S || "",
      createdAt: response.createdAt?.S || ""
    }))
    .filter((response) => response.responseId && response.message);
}

function itemToExamIssue(item) {
  return {
    issueId: item.issueId?.S || "",
    customerName: item.customerName?.S || "",
    subject: item.subject?.S || "",
    message: item.message?.S || "",
    difficulty: item.difficulty?.S || "MEDIUM",
    status: item.issueStatus?.S || "PENDING",
    orderIndex: Number(item.orderIndex?.N || 0),
    releaseAt: item.releaseAt?.S || "",
    visibleAt: item.visibleAt?.S || "",
    doneAt: item.doneAt?.S || "",
    responses: itemToExamResponses(item)
  };
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeRubricScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return 0;
  }

  if (score > 0 && score <= 5) {
    return clampScore(score * 20);
  }

  return clampScore(score);
}

function cleanStringList(value, limit = 8) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => requiredString(item)).filter(Boolean).slice(0, limit);
}

function stringListToAttribute(values) {
  return {
    L: cleanStringList(values).map((value) => ({ S: value }))
  };
}

function attributeToStringList(attribute) {
  return (attribute?.L || []).map((item) => item.S || "").filter(Boolean);
}

function normalizeRubric(rubric = {}) {
  return {
    kindness: normalizeRubricScore(rubric.kindness),
    professionalism: normalizeRubricScore(rubric.professionalism),
    resolution: normalizeRubricScore(rubric.resolution),
    clarity: normalizeRubricScore(rubric.clarity),
    helpfulIdeas: normalizeRubricScore(rubric.helpfulIdeas)
  };
}

function weightedEvaluationScore(rubric) {
  return clampScore(
    Object.entries(evaluationRubricWeights).reduce(
      (total, [key, weight]) => total + clampScore(rubric[key]) * weight,
      0
    )
  );
}

function rubricToAttribute(rubric) {
  const normalized = normalizeRubric(rubric);
  return {
    M: {
      kindness: { N: String(normalized.kindness) },
      professionalism: { N: String(normalized.professionalism) },
      resolution: { N: String(normalized.resolution) },
      clarity: { N: String(normalized.clarity) },
      helpfulIdeas: { N: String(normalized.helpfulIdeas) }
    }
  };
}

function attributeToRubric(attribute) {
  const item = attribute?.M || {};
  return normalizeRubric({
    kindness: item.kindness?.N,
    professionalism: item.professionalism?.N,
    resolution: item.resolution?.N,
    clarity: item.clarity?.N,
    helpfulIdeas: item.helpfulIdeas?.N
  });
}

function evaluationIssueToAttribute(issue) {
  return {
    M: {
      issueId: { S: issue.issueId },
      subject: { S: issue.subject },
      score: { N: String(clampScore(issue.score)) },
      notes: stringListToAttribute(issue.notes),
      suggestedAnswerIdeas: stringListToAttribute(issue.suggestedAnswerIdeas)
    }
  };
}

function attributeToEvaluationIssue(attribute) {
  const item = attribute?.M || {};
  return {
    issueId: item.issueId?.S || "",
    subject: item.subject?.S || "",
    score: clampScore(item.score?.N),
    notes: attributeToStringList(item.notes),
    suggestedAnswerIdeas: attributeToStringList(item.suggestedAnswerIdeas)
  };
}

function examEvaluationToItem(evaluation) {
  return {
    sessionId: { S: evaluation.sessionId },
    recordId: { S: examEvaluationRecordId },
    evaluationStatus: { S: evaluation.status },
    score: { N: String(clampScore(evaluation.score)) },
    evaluatedAt: { S: evaluation.evaluatedAt },
    rubric: rubricToAttribute(evaluation.rubric),
    aiNotes: stringListToAttribute(evaluation.aiNotes),
    strengths: stringListToAttribute(evaluation.strengths),
    growthAreas: stringListToAttribute(evaluation.growthAreas),
    practiceIdeas: stringListToAttribute(evaluation.practiceIdeas),
    issues: { L: (evaluation.issues || []).map(evaluationIssueToAttribute) },
    createdAt: { S: evaluation.evaluatedAt },
    updatedAt: { S: evaluation.evaluatedAt }
  };
}

function itemToExamEvaluation(item) {
  const rubric = attributeToRubric(item.rubric);
  return {
    sessionId: item.sessionId?.S || "",
    status: item.evaluationStatus?.S || "COMPLETED",
    score: weightedEvaluationScore(rubric),
    evaluatedAt: item.evaluatedAt?.S || "",
    rubric,
    aiNotes: attributeToStringList(item.aiNotes),
    strengths: attributeToStringList(item.strengths),
    growthAreas: attributeToStringList(item.growthAreas),
    practiceIdeas: attributeToStringList(item.practiceIdeas),
    issues: (item.issues?.L || []).map(attributeToEvaluationIssue).filter((issue) => issue.issueId)
  };
}

function issueRecordId(issueId) {
  return `${examIssueRecordPrefix}${issueId}`;
}

function isExamIssueItem(item) {
  return String(item.recordId?.S || "").startsWith(examIssueRecordPrefix);
}

function isExamEvaluationItem(item) {
  return item.recordId?.S === examEvaluationRecordId;
}

async function queryExamSession(sessionId) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: examSessionsTableName,
      KeyConditionExpression: "sessionId = :sessionId",
      ExpressionAttributeValues: {
        ":sessionId": { S: sessionId }
      }
    })
  );

  return result.Items || [];
}

async function markExamIssueVisible(sessionId, issueId, now) {
  const current = await dynamodb.send(
    new GetItemCommand({
      TableName: examSessionsTableName,
      Key: {
        sessionId: { S: sessionId },
        recordId: { S: issueRecordId(issueId) }
      }
    })
  );

  if (!current.Item) {
    return null;
  }

  const nextItem = {
    ...current.Item,
    issueStatus: { S: "VISIBLE" },
    isVisible: { BOOL: true },
    visibleAt: current.Item.visibleAt?.S ? current.Item.visibleAt : { S: now },
    updatedAt: { S: now }
  };

  await dynamodb.send(
    new PutItemCommand({
      TableName: examSessionsTableName,
      Item: nextItem
    })
  );

  return nextItem;
}

function isExamSessionActive(meta) {
  const endsAtMs = Date.parse(meta.endsAt);
  return meta.status !== "ENDED" && Number.isFinite(endsAtMs) && endsAtMs > Date.now();
}

async function getOwnedExamIssue(event) {
  const profile = await requireRep(event);
  const sessionId = requiredString(event.pathParameters?.sessionId);
  const issueId = requiredString(event.pathParameters?.issueId);

  if (!sessionId) {
    throw publicError(400, "Session id is required.");
  }

  if (!issueId) {
    throw publicError(400, "Issue id is required.");
  }

  const [metaResult, issueResult] = await Promise.all([
    dynamodb.send(
      new GetItemCommand({
        TableName: examSessionsTableName,
        Key: {
          sessionId: { S: sessionId },
          recordId: { S: examMetaRecordId }
        }
      })
    ),
    dynamodb.send(
      new GetItemCommand({
        TableName: examSessionsTableName,
        Key: {
          sessionId: { S: sessionId },
          recordId: { S: issueRecordId(issueId) }
        }
      })
    )
  ]);

  if (!metaResult.Item) {
    throw publicError(404, "Exam session not found.");
  }

  const meta = itemToExamMeta(metaResult.Item);
  if (meta.userId !== profile.userId) {
    throw publicError(403, "Exam session access denied.");
  }

  if (!isExamSessionActive(meta)) {
    throw publicError(400, "Exam session has ended.");
  }

  if (!issueResult.Item) {
    throw publicError(404, "Exam issue not found.");
  }

  if (!issueResult.Item.isVisible?.BOOL) {
    throw publicError(400, "Exam issue is not visible yet.");
  }

  if (issueResult.Item.issueStatus?.S === "DONE") {
    throw publicError(400, "Exam issue is already done.");
  }

  return { issueItem: issueResult.Item };
}

async function getOwnedExamSession(event) {
  const profile = await requireRep(event);
  const sessionId = requiredString(event.pathParameters?.sessionId);

  if (!sessionId) {
    throw publicError(400, "Session id is required.");
  }

  const items = await revealDueExamIssues(await queryExamSession(sessionId), new Date().toISOString());
  const metaItem = items.find((item) => item.recordId?.S === examMetaRecordId);
  if (!metaItem) {
    throw publicError(404, "Exam session not found.");
  }

  const meta = itemToExamMeta(metaItem);
  if (meta.userId !== profile.userId) {
    throw publicError(403, "Exam session access denied.");
  }

  return {
    meta,
    metaItem,
    issueItems: items.filter(isExamIssueItem),
    evaluationItem: items.find(isExamEvaluationItem)
  };
}

function isExamEnded(meta) {
  const endsAtMs = Date.parse(meta.endsAt);
  return meta.status === "ENDED" || (Number.isFinite(endsAtMs) && endsAtMs <= Date.now());
}

async function revealDueExamIssues(items, now) {
  const dueItems = items.filter(
    (item) => isExamIssueItem(item) && !item.isVisible?.BOOL && String(item.releaseAt?.S || "") <= now
  );

  if (!dueItems.length) {
    return items;
  }

  const updated = await Promise.all(
    dueItems.map((item) => markExamIssueVisible(item.sessionId.S, item.issueId.S, now))
  );
  const updatedByRecordId = new Map(updated.filter(Boolean).map((item) => [item.recordId.S, item]));

  return items.map((item) => updatedByRecordId.get(item.recordId?.S) || item);
}

function releaseDelaySeconds(index, totalIssues) {
  if (index === 0 || totalIssues <= 1) {
    return 0;
  }

  return Math.floor((examDurationSeconds * index) / totalIssues);
}

function examSessionResponse(meta) {
  return {
    sessionId: meta.sessionId,
    scenarioId: meta.scenarioId,
    title: meta.title,
    description: meta.description,
    durationSeconds: meta.durationSeconds,
    totalIssues: meta.totalIssues,
    startedAt: meta.startedAt,
    endsAt: meta.endsAt,
    status: meta.status
  };
}

function pulseResponse(meta, issueItems) {
  const nowMs = Date.now();
  const endsAtMs = Date.parse(meta.endsAt);
  const remainingSeconds = Number.isFinite(endsAtMs) ? Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000)) : 0;
  const status = remainingSeconds > 0 ? "ACTIVE" : "ENDED";
  const visibleIssues = issueItems
    .filter((item) => item.isVisible?.BOOL)
    .map(itemToExamIssue)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    session: {
      ...examSessionResponse({ ...meta, status }),
      remainingSeconds
    },
    issues: visibleIssues
  };
}

async function scheduleIssueRelease(sessionId, issueId, delaySeconds, releaseAt) {
  if (!delaySeconds) {
    return;
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: examIssueReleaseQueueUrl,
      DelaySeconds: Math.min(delaySeconds, 900),
      MessageBody: JSON.stringify({
        sessionId,
        issueId,
        releaseAt
      })
    })
  );
}

async function scanTable(tableName) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey
      })
    );
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

function sortNewestFirst(items) {
  return items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function safePercent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function averageScore(scores) {
  if (!scores.length) {
    return 0;
  }

  return clampScore(scores.reduce((total, score) => total + clampScore(score), 0) / scores.length);
}

function timestampForDashboard(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function dashboardAttemptFromMeta(meta, evaluation, user, nowMs) {
  const ended = isExamEnded(meta) || timestampForDashboard(meta.endsAt) <= nowMs;
  const score = evaluation ? clampScore(evaluation.score) : null;
  const passed = score !== null && score >= dashboardPassScore;

  return {
    sessionId: meta.sessionId,
    scenarioId: meta.scenarioId,
    scenarioTitle: meta.title,
    userId: meta.userId,
    repName: user?.fullName || user?.email || "Unknown rep",
    repEmail: user?.email || "",
    startedAt: meta.startedAt,
    updatedAt: meta.updatedAt,
    ended,
    evaluated: Boolean(evaluation),
    score,
    passed,
    evaluation
  };
}

function dashboardScenarioSummary(scenario, attempts) {
  const evaluatedAttempts = attempts.filter((attempt) => attempt.evaluated);
  const scores = evaluatedAttempts.map((attempt) => attempt.score).filter((score) => score !== null);
  const passedAttempts = evaluatedAttempts.filter((attempt) => attempt.passed).length;

  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    attempts: attempts.length,
    avgScore: averageScore(scores),
    passRate: safePercent(passedAttempts, evaluatedAttempts.length)
  };
}

function dashboardSummary(attempts) {
  const activeAttempts = attempts.filter((attempt) => !attempt.ended).length;
  const completedAttempts = attempts.filter((attempt) => attempt.ended).length;
  const evaluatedAttempts = attempts.filter((attempt) => attempt.evaluated);
  const passedAttempts = evaluatedAttempts.filter((attempt) => attempt.passed).length;
  const needsEvaluation = attempts.filter((attempt) => attempt.ended && !attempt.evaluated).length;
  const repsCount = new Set(attempts.map((attempt) => attempt.userId).filter(Boolean)).size;
  const repsEvaluated = new Set(evaluatedAttempts.map((attempt) => attempt.userId).filter(Boolean)).size;
  const scores = evaluatedAttempts.map((attempt) => attempt.score).filter((score) => score !== null);

  return {
    totalAttempts: attempts.length,
    activeAttempts,
    completedAttempts,
    evaluatedAttempts: evaluatedAttempts.length,
    avgSuccessScore: averageScore(scores),
    passRate: safePercent(passedAttempts, evaluatedAttempts.length),
    repsCount,
    repsEvaluated,
    needsEvaluation
  };
}

function dashboardScoreBands(attempts) {
  const bands = [
    { label: "Passed", min: dashboardPassScore, max: 100, count: 0, color: "#2d6d5f" },
    { label: "Needs coaching", min: 60, max: dashboardPassScore - 1, count: 0, color: "#d7a13e" },
    { label: "At risk", min: 0, max: 59, count: 0, color: "#b85b3e" },
    { label: "Not evaluated", min: null, max: null, count: 0, color: "#9a8f7d" }
  ];

  attempts.forEach((attempt) => {
    if (attempt.score === null) {
      bands[3].count += 1;
      return;
    }

    if (attempt.score >= dashboardPassScore) {
      bands[0].count += 1;
      return;
    }

    if (attempt.score >= 60) {
      bands[1].count += 1;
      return;
    }

    bands[2].count += 1;
  });

  return bands.map((band) => ({
    ...band,
    percent: safePercent(band.count, attempts.length)
  }));
}

function dashboardRepRows(attempts) {
  const attemptsByUser = new Map();
  attempts.forEach((attempt) => {
    if (!attemptsByUser.has(attempt.userId)) {
      attemptsByUser.set(attempt.userId, []);
    }
    attemptsByUser.get(attempt.userId).push(attempt);
  });

  return Array.from(attemptsByUser.values())
    .map((repAttempts) => {
      const sortedAttempts = [...repAttempts].sort(
        (a, b) => timestampForDashboard(b.startedAt) - timestampForDashboard(a.startedAt)
      );
      const latestAttempt = sortedAttempts[0];
      const evaluatedAttempts = repAttempts.filter((attempt) => attempt.evaluated);
      const completedAttempts = repAttempts.filter((attempt) => attempt.ended);
      const passedAttempts = evaluatedAttempts.filter((attempt) => attempt.passed).length;
      const scores = evaluatedAttempts.map((attempt) => attempt.score).filter((score) => score !== null);
      const latestEvaluatedAttempt = sortedAttempts.find((attempt) => attempt.evaluated);
      const coachingFocus =
        latestEvaluatedAttempt?.evaluation?.growthAreas?.[0] ||
        (repAttempts.some((attempt) => attempt.ended && !attempt.evaluated)
          ? "Evaluation pending"
          : repAttempts.some((attempt) => !attempt.ended)
            ? "Session in progress"
            : scores.length && averageScore(scores) >= dashboardPassScore
              ? "Maintain current approach"
              : "No coaching signal yet");

      return {
        userId: latestAttempt.userId,
        name: latestAttempt.repName,
        email: latestAttempt.repEmail,
        attempts: repAttempts.length,
        latestScore: latestAttempt.score,
        averageScore: averageScore(scores),
        bestScore: scores.length ? Math.max(...scores) : null,
        passRate: safePercent(passedAttempts, evaluatedAttempts.length),
        completionRate: safePercent(completedAttempts.length, repAttempts.length),
        evaluatedAttempts: evaluatedAttempts.length,
        needsEvaluation: repAttempts.filter((attempt) => attempt.ended && !attempt.evaluated).length,
        lastAttemptDate: latestAttempt.startedAt,
        coachingFocus
      };
    })
    .sort((a, b) => timestampForDashboard(b.lastAttemptDate) - timestampForDashboard(a.lastAttemptDate));
}

async function getScenarioById(scenarioId) {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: scenariosTableName,
      Key: {
        scenarioId: { S: scenarioId }
      }
    })
  );

  return result.Item ? itemToScenario(result.Item) : null;
}

async function getPersonasByIds(personaIds) {
  const personaResults = await Promise.all(
    personaIds.map((personaId) =>
      dynamodb.send(
        new GetItemCommand({
          TableName: personasTableName,
          Key: {
            personaId: { S: personaId }
          }
        })
      )
    )
  );

  return personaResults.map((result) => (result.Item ? itemToPersona(result.Item) : null)).filter(Boolean);
}

async function getOpenAiApiKey() {
  let result;
  try {
    result = await secretsManager.send(new GetSecretValueCommand({ SecretId: llmSecretName }));
  } catch (error) {
    console.error(error);
    throw publicError(500, `LLM secret "${llmSecretName}" could not be read.`);
  }

  const secretString = result.SecretString || Buffer.from(result.SecretBinary || "").toString("utf8");
  let secret;
  try {
    secret = JSON.parse(secretString);
  } catch (error) {
    throw publicError(500, `LLM secret "${llmSecretName}" must be valid JSON.`);
  }

  const apiKey = requiredString(secret.OPENAI_API_KEY);
  if (!apiKey) {
    throw publicError(500, `LLM secret "${llmSecretName}" must include OPENAI_API_KEY.`);
  }

  return apiKey;
}

function issueGenerationSchema(scenario) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["issues"],
    properties: {
      issues: {
        type: "array",
        minItems: scenario.issueCount,
        maxItems: scenario.issueCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["personaId", "customerName", "subject", "message", "difficulty"],
          properties: {
            personaId: {
              type: "string",
              enum: scenario.personaIds
            },
            customerName: {
              type: "string"
            },
            subject: {
              type: "string"
            },
            message: {
              type: "string"
            },
            difficulty: {
              type: "string",
              enum: ["EASY", "MEDIUM", "HARD"]
            }
          }
        }
      }
    }
  };
}

function scoreSchema() {
  return {
    type: "number",
    minimum: 0,
    maximum: 100
  };
}

function stringArraySchema() {
  return {
    type: "array",
    items: {
      type: "string"
    }
  };
}

function examEvaluationSchema(issues) {
  const issueIds = issues.map((issue) => issue.issueId);
  const issueCount = issueIds.length;
  return {
    type: "object",
    additionalProperties: false,
    required: ["rubric", "aiNotes", "strengths", "growthAreas", "practiceIdeas", "issues"],
    properties: {
      rubric: {
        type: "object",
        additionalProperties: false,
        required: ["kindness", "professionalism", "resolution", "clarity", "helpfulIdeas"],
        properties: {
          kindness: scoreSchema(),
          professionalism: scoreSchema(),
          resolution: scoreSchema(),
          clarity: scoreSchema(),
          helpfulIdeas: scoreSchema()
        }
      },
      aiNotes: stringArraySchema(),
      strengths: stringArraySchema(),
      growthAreas: stringArraySchema(),
      practiceIdeas: stringArraySchema(),
      issues: {
        type: "array",
        minItems: issueCount,
        maxItems: issueCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["issueId", "score", "notes", "suggestedAnswerIdeas"],
          properties: {
            issueId: {
              type: "string",
              enum: issueIds
            },
            score: scoreSchema(),
            notes: stringArraySchema(),
            suggestedAnswerIdeas: stringArraySchema()
          }
        }
      }
    }
  };
}

function extractOpenAiOutputText(responseBody) {
  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  const textParts = [];
  for (const output of responseBody.output || []) {
    for (const content of output.content || []) {
      if (content.type === "refusal" || content.refusal) {
        throw publicError(502, "OpenAI refused to complete this request.");
      }

      if (typeof content.text === "string") {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("").trim();
}

async function requestGeneratedIssues(scenario, personas) {
  const apiKey = await getOpenAiApiKey();
  const context = {
    issueCount: scenario.issueCount,
    scenario: {
      title: scenario.title,
      description: scenario.description
    },
    personas: personas.map((persona) => ({
      personaId: persona.personaId,
      name: persona.name,
      description: persona.description,
      behaviorNotes: persona.behaviorNotes
    }))
  };

  const body = {
    model: openAiModel,
    input: [
      {
        role: "system",
        content:
          "You generate realistic sales/service exam inbox issues. Use the provided scenario and personas. Return JSON that matches the schema exactly."
      },
      {
        role: "user",
        content: `Generate exactly ${scenario.issueCount} JSON issues. Use only provided personaId values. Make each customer message actionable, concise, and realistic for a sales operations training exam.\n\nContext:\n${JSON.stringify(context)}`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "salesops_generated_issues",
        strict: true,
        schema: issueGenerationSchema(scenario)
      }
    }
  };

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(22000)
    });
  } catch (error) {
    console.error(error);
    throw publicError(502, "OpenAI issue generation request failed.");
  }

  const responseText = await response.text();
  if (!response.ok) {
    console.error(responseText);
    throw publicError(502, "OpenAI issue generation failed.");
  }

  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch (error) {
    throw publicError(502, "OpenAI issue generation returned invalid JSON.");
  }

  let generated;
  try {
    generated = JSON.parse(extractOpenAiOutputText(responseBody));
  } catch (error) {
    if (error.expose) {
      throw error;
    }
    throw publicError(502, "OpenAI issue generation returned malformed issue data.");
  }

  return generated.issues;
}

function normalizeExamEvaluation(rawEvaluation, meta, issues) {
  const safeEvaluation = rawEvaluation && typeof rawEvaluation === "object" ? rawEvaluation : {};
  const rubric = normalizeRubric(safeEvaluation.rubric);
  const rawIssues = Array.isArray(safeEvaluation.issues) ? safeEvaluation.issues : [];
  const rawIssuesById = new Map(rawIssues.map((issue) => [requiredString(issue.issueId), issue]));
  const evaluatedAt = new Date().toISOString();

  return {
    sessionId: meta.sessionId,
    status: "COMPLETED",
    score: weightedEvaluationScore(rubric),
    evaluatedAt,
    rubric,
    aiNotes: cleanStringList(safeEvaluation.aiNotes),
    strengths: cleanStringList(safeEvaluation.strengths),
    growthAreas: cleanStringList(safeEvaluation.growthAreas),
    practiceIdeas: cleanStringList(safeEvaluation.practiceIdeas),
    issues: issues.map((issue) => {
      const rawIssue = rawIssuesById.get(issue.issueId) || {};
      return {
        issueId: issue.issueId,
        subject: issue.subject,
        score: clampScore(rawIssue.score),
        notes: cleanStringList(rawIssue.notes, 5),
        suggestedAnswerIdeas: cleanStringList(rawIssue.suggestedAnswerIdeas, 5)
      };
    })
  };
}

async function requestExamEvaluation(meta, issues) {
  const apiKey = await getOpenAiApiKey();
  const context = {
    session: {
      sessionId: meta.sessionId,
      title: meta.title,
      description: meta.description,
      startedAt: meta.startedAt,
      endsAt: meta.endsAt
    },
    rubric: {
      kindness: "25%: empathy, warmth, patience, human tone.",
      professionalism: "25%: business-safe wording, respectful confidence, no blame.",
      resolution: "25%: directly solves or advances the customer issue with correct next steps.",
      clarity: "15%: concise, structured, easy to understand.",
      helpfulIdeas: "10%: proactive options, next-best actions, prevention, or useful alternatives."
    },
    issues: issues.map((issue) => ({
      issueId: issue.issueId,
      customerName: issue.customerName,
      subject: issue.subject,
      customerMessage: issue.message,
      difficulty: issue.difficulty,
      repResponses: issue.responses.map((response) => response.message)
    }))
  };

  const body = {
    model: openAiModel,
    input: [
      {
        role: "system",
        content:
          "You grade sales/service exam answers. Be fair, specific, kind, and practical. Return JSON that matches the schema exactly."
      },
      {
        role: "user",
        content:
          "Evaluate every issue. Return every rubric score and every issue score on a 0-100 scale, never a 1-5 scale. Missing rep responses should receive low issue scores and coaching notes. Multiple responses for one issue should be evaluated together. Provide future-facing coaching ideas, not only criticism.\n\nContext:\n" +
          JSON.stringify(context)
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "salesops_exam_evaluation",
        strict: true,
        schema: examEvaluationSchema(issues)
      }
    }
  };

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(26000)
    });
  } catch (error) {
    console.error(error);
    throw publicError(502, "OpenAI evaluation request failed.");
  }

  const responseText = await response.text();
  if (!response.ok) {
    console.error(responseText);
    throw publicError(502, "OpenAI evaluation failed.");
  }

  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch (error) {
    throw publicError(502, "OpenAI evaluation returned invalid JSON.");
  }

  let evaluation;
  try {
    evaluation = JSON.parse(extractOpenAiOutputText(responseBody));
  } catch (error) {
    if (error.expose) {
      throw error;
    }
    throw publicError(502, "OpenAI evaluation returned malformed result data.");
  }

  return normalizeExamEvaluation(evaluation, meta, issues);
}

function normalizeGeneratedIssues(rawIssues, scenario) {
  if (!Array.isArray(rawIssues)) {
    throw publicError(502, "OpenAI issue generation returned no issues.");
  }

  if (rawIssues.length !== scenario.issueCount) {
    throw publicError(502, `OpenAI returned ${rawIssues.length} issues instead of ${scenario.issueCount}.`);
  }

  const personaIds = new Set(scenario.personaIds);
  const now = new Date().toISOString();
  return rawIssues.map((issue) => {
    const personaId = requiredString(issue.personaId);
    const customerName = requiredString(issue.customerName);
    const subject = requiredString(issue.subject);
    const message = requiredString(issue.message);
    const difficulty = requiredString(issue.difficulty).toUpperCase();

    if (!personaIds.has(personaId)) {
      throw publicError(502, "OpenAI issue generation returned an unknown persona.");
    }

    if (!customerName || !subject || !message) {
      throw publicError(502, "OpenAI issue generation returned incomplete issues.");
    }

    if (!issueDifficulties.has(difficulty)) {
      throw publicError(502, "OpenAI issue generation returned an invalid difficulty.");
    }

    return {
      issueId: newId("issue"),
      personaId,
      customerName,
      subject,
      message,
      difficulty,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now
    };
  });
}

function buildDemoIssueSeed(scenario, persona, index) {
  const topic = scenario.title || "SalesOps training";
  const personaName = persona?.name || "customer";
  const patterns = [
    {
      subject: `${topic}: renewal concern`,
      message: `${personaName} needs a clear renewal path, pricing explanation, and one practical next step before approving the deal.`
    },
    {
      subject: `${topic}: billing follow-up`,
      message: `${personaName} sees a billing mismatch and wants ownership, a concise explanation, and timing for resolution.`
    },
    {
      subject: `${topic}: expansion question`,
      message: `${personaName} is considering more seats but needs value framing, risk handling, and a low-friction follow-up plan.`
    }
  ];
  const pattern = patterns[index % patterns.length];

  return {
    personaId: persona?.personaId || scenario.personaIds[0],
    customerName: `Demo Customer ${index + 1}`,
    subject: pattern.subject,
    message: pattern.message,
    difficulty: ["EASY", "MEDIUM", "HARD"][index % 3]
  };
}

function buildDemoIssues(scenario, personas) {
  return Array.from({ length: scenario.issueCount }, (_item, index) => {
    const persona = personas[index % personas.length];
    return buildDemoIssueSeed(scenario, persona, index);
  });
}

async function generateIssuesWithFallback(scenario, personas) {
  try {
    const rawIssues = await requestGeneratedIssues(scenario, personas);
    return {
      issues: normalizeGeneratedIssues(rawIssues, scenario),
      generationSource: "OPENAI",
      generationWarning: ""
    };
  } catch (error) {
    if ((error.statusCode || 500) < 500) {
      throw error;
    }

    console.error(error);
    return {
      issues: normalizeGeneratedIssues(buildDemoIssues(scenario, personas), scenario),
      generationSource: "DEMO",
      generationWarning: `OpenAI issue generation failed: ${error.message}. Demo issues were generated instead.`
    };
  }
}

function validateScenarioStatus(value, fallback) {
  const status = requiredString(value) || fallback;
  if (!scenarioStatuses.has(status)) {
    throw publicError(400, "Scenario status must be DRAFT, PUBLISHED, or ARCHIVED.");
  }

  return status;
}

function mapError(error) {
  if (error instanceof SyntaxError) {
    return json(400, { message: "Request body must be valid JSON." });
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(error);
  }

  return json(statusCode, {
    message: statusCode >= 500 && !error.expose ? "Content request failed." : error.message
  });
}

exports.listPersonas = async (event) => {
  try {
    await requireManager(event);
    const personas = sortNewestFirst((await scanTable(personasTableName)).map(itemToPersona));
    return json(200, { personas });
  } catch (error) {
    return mapError(error);
  }
};

exports.listUsers = async (event) => {
  try {
    await requireManager(event);
    const users = sortNewestFirst((await scanTable(usersTableName)).map(itemToUser));
    return json(200, { users });
  } catch (error) {
    return mapError(error);
  }
};

exports.updateUser = async (event) => {
  try {
    const manager = await requireManager(event);
    const userId = requiredString(event.pathParameters?.userId);
    const body = parseBody(event);
    const role = requiredString(body.role);
    const status = requiredString(body.status);

    if (!userId) {
      return json(400, { message: "User id is required." });
    }

    if (!userRoles.has(role)) {
      return json(400, { message: "Role must be rep or manager." });
    }

    if (!editableUserStatuses.has(status)) {
      return json(400, { message: "Status must be ACTIVE or SUSPENDED." });
    }

    const current = await dynamodb.send(
      new GetItemCommand({
        TableName: usersTableName,
        Key: {
          userId: { S: userId }
        }
      })
    );

    if (!current.Item) {
      return json(404, { message: "User not found." });
    }

    const previous = itemToUser(current.Item);
    if (previous.status === "PENDING_CONFIRMATION") {
      return json(400, { message: "Pending users must confirm email before role or status can change." });
    }

    if (manager.userId === userId && (role !== "manager" || status !== "ACTIVE")) {
      return json(400, { message: "You cannot demote or suspend your own manager account." });
    }

    const user = {
      ...previous,
      role,
      status,
      updatedAt: new Date().toISOString()
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: usersTableName,
        Item: userToItem(user)
      })
    );

    return json(200, { user });
  } catch (error) {
    return mapError(error);
  }
};

exports.getDashboard = async (event) => {
  try {
    await requireManager(event);

    if (!examSessionsTableName) {
      throw publicError(500, "Dashboard service is not configured.");
    }

    const scenarioFilter = requiredString(event.queryStringParameters?.scenarioId) || "ALL";
    const selectedScenarioId = scenarioFilter === "ALL" ? "" : scenarioFilter;
    const [sessionItems, userItems, scenarioItems] = await Promise.all([
      scanTable(examSessionsTableName),
      scanTable(usersTableName),
      scanTable(scenariosTableName)
    ]);
    const usersById = new Map(userItems.map(itemToUser).map((user) => [user.userId, user]));
    const scenarios = scenarioItems.map(itemToScenario);
    const scenariosById = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
    const recordsBySessionId = new Map();

    sessionItems.forEach((item) => {
      const sessionId = item.sessionId?.S || "";
      if (!sessionId) {
        return;
      }

      if (!recordsBySessionId.has(sessionId)) {
        recordsBySessionId.set(sessionId, {});
      }

      const record = recordsBySessionId.get(sessionId);
      if (item.recordId?.S === examMetaRecordId) {
        record.meta = itemToExamMeta(item);
      }
      if (item.recordId?.S === examEvaluationRecordId) {
        record.evaluation = itemToExamEvaluation(item);
      }
    });

    const nowMs = Date.now();
    const allAttempts = Array.from(recordsBySessionId.values())
      .filter((record) => record.meta?.sessionId)
      .map((record) =>
        dashboardAttemptFromMeta(record.meta, record.evaluation, usersById.get(record.meta.userId), nowMs)
      );
    const filteredAttempts = selectedScenarioId
      ? allAttempts.filter((attempt) => attempt.scenarioId === selectedScenarioId)
      : allAttempts;
    const scenarioIdsFromAttempts = new Set(allAttempts.map((attempt) => attempt.scenarioId).filter(Boolean));
    const scenarioOptions = [
      ...scenarios.filter((scenario) => scenarioIdsFromAttempts.has(scenario.scenarioId)),
      ...Array.from(scenarioIdsFromAttempts)
        .filter((scenarioId) => !scenariosById.has(scenarioId))
        .map((scenarioId) => {
          const attempt = allAttempts.find((item) => item.scenarioId === scenarioId);
          return {
            scenarioId,
            title: attempt?.scenarioTitle || "Unknown scenario"
          };
        })
    ]
      .map((scenario) =>
        dashboardScenarioSummary(
          scenario,
          allAttempts.filter((attempt) => attempt.scenarioId === scenario.scenarioId)
        )
      )
      .sort((a, b) => b.attempts - a.attempts || a.title.localeCompare(b.title));

    return json(200, {
      generatedAt: new Date().toISOString(),
      selectedScenarioId: selectedScenarioId || "ALL",
      passScore: dashboardPassScore,
      summary: dashboardSummary(filteredAttempts),
      scenarios: scenarioOptions,
      reps: dashboardRepRows(filteredAttempts),
      scoreBands: dashboardScoreBands(filteredAttempts)
    });
  } catch (error) {
    return mapError(error);
  }
};

exports.createPersona = async (event) => {
  try {
    await requireManager(event);
    const body = parseBody(event);
    const name = requiredString(body.name);

    if (!name) {
      return json(400, { message: "Persona name is required." });
    }

    const now = new Date().toISOString();
    const persona = {
      personaId: newId("persona"),
      name,
      description: optionalString(body.description),
      behaviorNotes: optionalString(body.behaviorNotes),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: personasTableName,
        Item: personaToItem(persona)
      })
    );

    return json(201, { persona });
  } catch (error) {
    return mapError(error);
  }
};

exports.updatePersona = async (event) => {
  try {
    await requireManager(event);
    const personaId = requiredString(event.pathParameters?.personaId);
    const body = parseBody(event);
    const name = requiredString(body.name);

    if (!personaId) {
      return json(400, { message: "Persona id is required." });
    }

    if (!name) {
      return json(400, { message: "Persona name is required." });
    }

    const current = await dynamodb.send(
      new GetItemCommand({
        TableName: personasTableName,
        Key: {
          personaId: { S: personaId }
        }
      })
    );

    if (!current.Item) {
      return json(404, { message: "Persona not found." });
    }

    const previous = itemToPersona(current.Item);
    const persona = {
      ...previous,
      name,
      description: optionalString(body.description),
      behaviorNotes: optionalString(body.behaviorNotes),
      status: optionalString(body.status) || previous.status,
      updatedAt: new Date().toISOString()
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: personasTableName,
        Item: personaToItem(persona)
      })
    );

    return json(200, { persona });
  } catch (error) {
    return mapError(error);
  }
};

exports.listScenarios = async (event) => {
  try {
    await requireManager(event);
    const scenarios = sortNewestFirst((await scanTable(scenariosTableName)).map(itemToScenario));
    return json(200, { scenarios });
  } catch (error) {
    return mapError(error);
  }
};

exports.listExamScenarios = async (event) => {
  try {
    await requireRep(event);
    const scenarios = sortNewestFirst((await scanTable(scenariosTableName)).map(itemToScenario))
      .filter((scenario) => scenario.status === "PUBLISHED" && scenario.issues.length > 0)
      .map(examScenarioSummary);

    return json(200, { scenarios, durationSeconds: examDurationSeconds });
  } catch (error) {
    return mapError(error);
  }
};

exports.createExamSession = async (event) => {
  try {
    if (!examIssueReleaseQueueUrl) {
      throw Object.assign(new Error("Exam issue release queue is not configured."), { statusCode: 500 });
    }

    const profile = await requireRep(event);
    const body = parseBody(event);
    const scenarioId = requiredString(body.scenarioId);

    if (!scenarioId) {
      return json(400, { message: "Scenario id is required." });
    }

    const scenario = await getScenarioById(scenarioId);
    if (!scenario) {
      return json(404, { message: "Scenario not found." });
    }

    if (scenario.status !== "PUBLISHED") {
      return json(400, { message: "Scenario is not published." });
    }

    if (!scenario.issues.length) {
      return json(400, { message: "Scenario has no generated issues." });
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const sessionId = newId("session");
    const meta = {
      sessionId,
      userId: profile.userId,
      scenarioId: scenario.scenarioId,
      title: scenario.title,
      description: scenario.description,
      durationSeconds: examDurationSeconds,
      totalIssues: scenario.issues.length,
      status: "ACTIVE",
      startedAt: now,
      endsAt: new Date(nowMs + examDurationSeconds * 1000).toISOString(),
      createdAt: now,
      updatedAt: now
    };

    const issueItems = scenario.issues.map((issue, index) => {
      const delaySeconds = releaseDelaySeconds(index, scenario.issues.length);
      const releaseAt = new Date(nowMs + delaySeconds * 1000).toISOString();
      return {
        item: examIssueToItem(sessionId, issue, index, releaseAt, delaySeconds === 0, now),
        issueId: issue.issueId,
        delaySeconds,
        releaseAt
      };
    });

    await Promise.all([
      dynamodb.send(
        new PutItemCommand({
          TableName: examSessionsTableName,
          Item: examMetaToItem(meta)
        })
      ),
      ...issueItems.map(({ item }) =>
        dynamodb.send(
          new PutItemCommand({
            TableName: examSessionsTableName,
            Item: item
          })
        )
      )
    ]);

    await Promise.all(
      issueItems.map(({ issueId, delaySeconds, releaseAt }) =>
        scheduleIssueRelease(sessionId, issueId, delaySeconds, releaseAt)
      )
    );

    return json(201, { session: examSessionResponse(meta) });
  } catch (error) {
    return mapError(error);
  }
};

exports.getExamSessionPulse = async (event) => {
  try {
    const profile = await requireRep(event);
    const sessionId = requiredString(event.pathParameters?.sessionId);

    if (!sessionId) {
      return json(400, { message: "Session id is required." });
    }

    const now = new Date().toISOString();
    const items = await revealDueExamIssues(await queryExamSession(sessionId), now);
    const metaItem = items.find((item) => item.recordId?.S === examMetaRecordId);
    if (!metaItem) {
      return json(404, { message: "Exam session not found." });
    }

    const meta = itemToExamMeta(metaItem);
    if (meta.userId !== profile.userId) {
      return json(403, { message: "Exam session access denied." });
    }

    return json(200, pulseResponse(meta, items.filter(isExamIssueItem)));
  } catch (error) {
    return mapError(error);
  }
};

exports.createExamEvaluation = async (event) => {
  try {
    const { meta, metaItem, issueItems, evaluationItem } = await getOwnedExamSession(event);

    if (evaluationItem) {
      return json(200, { evaluation: itemToExamEvaluation(evaluationItem) });
    }

    if (!isExamEnded(meta)) {
      return json(400, { message: "Exam is still active." });
    }

    if (!issueItems.length) {
      return json(400, { message: "Exam has no issues to evaluate." });
    }

    const issues = issueItems.map(itemToExamIssue).sort((a, b) => a.orderIndex - b.orderIndex);
    const evaluation = await requestExamEvaluation(meta, issues);
    const endedMetaItem = {
      ...metaItem,
      sessionStatus: { S: "ENDED" },
      updatedAt: { S: evaluation.evaluatedAt }
    };

    await Promise.all([
      dynamodb.send(
        new PutItemCommand({
          TableName: examSessionsTableName,
          Item: endedMetaItem
        })
      ),
      dynamodb.send(
        new PutItemCommand({
          TableName: examSessionsTableName,
          Item: examEvaluationToItem(evaluation)
        })
      )
    ]);

    return json(201, { evaluation });
  } catch (error) {
    return mapError(error);
  }
};

exports.getExamEvaluation = async (event) => {
  try {
    const { evaluationItem } = await getOwnedExamSession(event);

    if (!evaluationItem) {
      return json(404, { message: "Exam evaluation not found." });
    }

    return json(200, { evaluation: itemToExamEvaluation(evaluationItem) });
  } catch (error) {
    return mapError(error);
  }
};

exports.submitExamIssueResponse = async (event) => {
  try {
    const { issueItem } = await getOwnedExamIssue(event);
    const body = parseBody(event);
    const message = requiredString(body.message);

    if (!message) {
      return json(400, { message: "Response message is required." });
    }

    if (message.length > maxExamResponseLength) {
      return json(400, { message: `Response message must be ${maxExamResponseLength} characters or fewer.` });
    }

    const now = new Date().toISOString();
    const responses = [
      ...itemToExamResponses(issueItem),
      {
        responseId: newId("response"),
        message,
        createdAt: now
      }
    ];
    const nextItem = {
      ...issueItem,
      issueStatus: { S: "VISIBLE" },
      responses: { L: responses.map(examResponseToItem) },
      updatedAt: { S: now }
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: examSessionsTableName,
        Item: nextItem
      })
    );

    return json(201, { issue: itemToExamIssue(nextItem) });
  } catch (error) {
    return mapError(error);
  }
};

exports.markExamIssueDone = async (event) => {
  try {
    const { issueItem } = await getOwnedExamIssue(event);
    const responses = itemToExamResponses(issueItem);

    if (!responses.length) {
      return json(400, { message: "Submit at least one response before marking this issue done." });
    }

    const now = new Date().toISOString();
    const nextItem = {
      ...issueItem,
      issueStatus: { S: "DONE" },
      doneAt: { S: now },
      responses: { L: responses.map(examResponseToItem) },
      updatedAt: { S: now }
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: examSessionsTableName,
        Item: nextItem
      })
    );

    return json(200, { issue: itemToExamIssue(nextItem) });
  } catch (error) {
    return mapError(error);
  }
};

exports.releaseExamIssue = async (event) => {
  const failures = [];

  for (const record of event.Records || []) {
    try {
      const body = JSON.parse(record.body || "{}");
      const sessionId = requiredString(body.sessionId);
      const issueId = requiredString(body.issueId);

      if (!sessionId || !issueId) {
        throw new Error("SQS message missing sessionId or issueId.");
      }

      await markExamIssueVisible(sessionId, issueId, new Date().toISOString());
    } catch (error) {
      console.error(error);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};

exports.createScenario = async (event) => {
  try {
    await requireManager(event);
    const body = parseBody(event);
    const title = requiredString(body.title);

    if (!title) {
      return json(400, { message: "Scenario title is required." });
    }

    const now = new Date().toISOString();
    const scenario = {
      scenarioId: newId("scenario"),
      title,
      description: optionalString(body.description),
      personaIds: stringArray(body.personaIds),
      issueCount: parseIssueCount(body.issueCount),
      issues: [],
      issuesGeneratedAt: "",
      status: "DRAFT",
      createdAt: now,
      updatedAt: now
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(scenario)
      })
    );

    return json(201, { scenario });
  } catch (error) {
    return mapError(error);
  }
};

exports.updateScenario = async (event) => {
  try {
    await requireManager(event);
    const scenarioId = requiredString(event.pathParameters?.scenarioId);
    const body = parseBody(event);
    const title = requiredString(body.title);

    if (!scenarioId) {
      return json(400, { message: "Scenario id is required." });
    }

    if (!title) {
      return json(400, { message: "Scenario title is required." });
    }

    const current = await dynamodb.send(
      new GetItemCommand({
        TableName: scenariosTableName,
        Key: {
          scenarioId: { S: scenarioId }
        }
      })
    );

    if (!current.Item) {
      return json(404, { message: "Scenario not found." });
    }

    const previous = itemToScenario(current.Item);
    const scenario = {
      ...previous,
      title,
      description: optionalString(body.description),
      personaIds: stringArray(body.personaIds),
      issueCount: body.issueCount === undefined ? previous.issueCount : parseIssueCount(body.issueCount),
      status: validateScenarioStatus(body.status, previous.status),
      updatedAt: new Date().toISOString()
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(scenario)
      })
    );

    return json(200, { scenario });
  } catch (error) {
    return mapError(error);
  }
};

exports.publishScenario = async (event) => {
  try {
    await requireManager(event);
    const scenarioId = requiredString(event.pathParameters?.scenarioId);

    if (!scenarioId) {
      return json(400, { message: "Scenario id is required." });
    }

    const current = await dynamodb.send(
      new GetItemCommand({
        TableName: scenariosTableName,
        Key: {
          scenarioId: { S: scenarioId }
        }
      })
    );

    if (!current.Item) {
      return json(404, { message: "Scenario not found." });
    }

    const previous = itemToScenario(current.Item);
    if (!previous.personaIds.length) {
      return json(400, { message: "Select at least one persona before publishing." });
    }

    const scenario = {
      ...previous,
      status: "PUBLISHED",
      updatedAt: new Date().toISOString()
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(scenario)
      })
    );

    return json(200, { scenario });
  } catch (error) {
    return mapError(error);
  }
};

exports.cloneScenario = async (event) => {
  try {
    await requireManager(event);
    const scenarioId = requiredString(event.pathParameters?.scenarioId);

    if (!scenarioId) {
      return json(400, { message: "Scenario id is required." });
    }

    const previous = await getScenarioById(scenarioId);
    if (!previous) {
      return json(404, { message: "Scenario not found." });
    }

    const now = new Date().toISOString();
    const scenario = {
      ...previous,
      scenarioId: newId("scenario"),
      title: `${previous.title} copy`,
      issues: previous.issues.map((issue) => ({
        ...issue,
        issueId: newId("issue"),
        createdAt: now,
        updatedAt: now
      })),
      status: "DRAFT",
      createdAt: now,
      updatedAt: now
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(scenario)
      })
    );

    return json(201, { scenario });
  } catch (error) {
    return mapError(error);
  }
};

exports.archiveScenario = async (event) => {
  try {
    await requireManager(event);
    const scenarioId = requiredString(event.pathParameters?.scenarioId);

    if (!scenarioId) {
      return json(400, { message: "Scenario id is required." });
    }

    const previous = await getScenarioById(scenarioId);
    if (!previous) {
      return json(404, { message: "Scenario not found." });
    }

    const scenario = {
      ...previous,
      status: "ARCHIVED",
      updatedAt: new Date().toISOString()
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(scenario)
      })
    );

    return json(200, { scenario });
  } catch (error) {
    return mapError(error);
  }
};

exports.generateScenarioIssues = async (event) => {
  try {
    await requireManager(event);
    const scenarioId = requiredString(event.pathParameters?.scenarioId);

    if (!scenarioId) {
      return json(400, { message: "Scenario id is required." });
    }

    const scenario = await getScenarioById(scenarioId);
    if (!scenario) {
      return json(404, { message: "Scenario not found." });
    }

    if (scenario.status !== "PUBLISHED") {
      return json(400, { message: "Publish scenario before generating issues." });
    }

    if (!scenario.personaIds.length) {
      return json(400, { message: "Select at least one persona before generating issues." });
    }

    const personas = await getPersonasByIds(scenario.personaIds);
    if (personas.length !== scenario.personaIds.length) {
      return json(400, { message: "Selected personas were not found." });
    }

    const generated = await generateIssuesWithFallback(scenario, personas);
    const now = new Date().toISOString();
    const nextScenario = {
      ...scenario,
      issues: generated.issues,
      issuesGeneratedAt: now,
      generationSource: generated.generationSource,
      generationWarning: generated.generationWarning,
      updatedAt: now
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(nextScenario)
      })
    );

    return json(200, {
      scenario: nextScenario,
      generationSource: generated.generationSource,
      warning: generated.generationWarning
    });
  } catch (error) {
    return mapError(error);
  }
};

exports.updateScenarioIssue = async (event) => {
  try {
    await requireManager(event);
    const scenarioId = requiredString(event.pathParameters?.scenarioId);
    const issueId = requiredString(event.pathParameters?.issueId);
    const body = parseBody(event);

    if (!scenarioId) {
      return json(400, { message: "Scenario id is required." });
    }

    if (!issueId) {
      return json(400, { message: "Issue id is required." });
    }

    const scenario = await getScenarioById(scenarioId);
    if (!scenario) {
      return json(404, { message: "Scenario not found." });
    }

    const currentIssue = scenario.issues.find((issue) => issue.issueId === issueId);
    if (!currentIssue) {
      return json(404, { message: "Issue not found." });
    }

    const customerName = requiredString(body.customerName);
    const subject = requiredString(body.subject);
    const message = requiredString(body.message);

    if (!customerName) {
      return json(400, { message: "Customer name is required." });
    }

    if (!subject) {
      return json(400, { message: "Issue subject is required." });
    }

    if (!message) {
      return json(400, { message: "Issue message is required." });
    }

    const now = new Date().toISOString();
    const nextIssue = {
      ...currentIssue,
      customerName,
      subject,
      message,
      difficulty: validateDifficulty(body.difficulty),
      updatedAt: now
    };
    const nextScenario = {
      ...scenario,
      issues: scenario.issues.map((issue) => (issue.issueId === issueId ? nextIssue : issue)),
      updatedAt: now
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(nextScenario)
      })
    );

    return json(200, { scenario: nextScenario, issue: nextIssue });
  } catch (error) {
    return mapError(error);
  }
};
