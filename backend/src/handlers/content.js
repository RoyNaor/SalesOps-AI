"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { randomUUID } = require("crypto");

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const usersTableName = process.env.USERS_TABLE_NAME;
const personasTableName = process.env.PERSONAS_TABLE_NAME;
const scenariosTableName = process.env.SCENARIOS_TABLE_NAME;
const llmSecretName = process.env.LLM_SECRET_NAME || "salesops/dev/llm-api-keys";
const openAiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const defaultIssueCount = 5;
const minIssueCount = 1;
const maxIssueCount = 20;
const issueDifficulties = new Set(["EASY", "MEDIUM", "HARD"]);

const dynamodb = new DynamoDBClient({ region });
const secretsManager = new SecretsManagerClient({ region });

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
