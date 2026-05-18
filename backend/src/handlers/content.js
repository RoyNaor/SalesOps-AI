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
const openAiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const defaultIssueCount = 5;
const minIssueCount = 1;
const maxIssueCount = 20;
const examDurationSeconds = 180;
const maxExamResponseLength = 4000;
const examMetaRecordId = "META";
const examIssueRecordPrefix = "ISSUE#";
const issueDifficulties = new Set(["EASY", "MEDIUM", "HARD"]);

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

function issueRecordId(issueId) {
  return `${examIssueRecordPrefix}${issueId}`;
}

function isExamIssueItem(item) {
  return String(item.recordId?.S || "").startsWith(examIssueRecordPrefix);
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

function extractOpenAiOutputText(responseBody) {
  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  const textParts = [];
  for (const output of responseBody.output || []) {
    for (const content of output.content || []) {
      if (content.type === "refusal" || content.refusal) {
        throw publicError(502, "OpenAI refused to generate issues for this scenario.");
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
    const difficulty = validateDifficulty(issue.difficulty);

    if (!personaIds.has(personaId)) {
      throw publicError(502, "OpenAI issue generation returned an unknown persona.");
    }

    if (!customerName || !subject || !message) {
      throw publicError(502, "OpenAI issue generation returned incomplete issues.");
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
      status: optionalString(body.status) || previous.status,
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

    const rawIssues = await requestGeneratedIssues(scenario, personas);
    const now = new Date().toISOString();
    const nextScenario = {
      ...scenario,
      issues: normalizeGeneratedIssues(rawIssues, scenario),
      issuesGeneratedAt: now,
      updatedAt: now
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: scenariosTableName,
        Item: scenarioToItem(nextScenario)
      })
    );

    return json(200, { scenario: nextScenario });
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
