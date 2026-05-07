"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const usersTableName = process.env.USERS_TABLE_NAME;
const personasTableName = process.env.PERSONAS_TABLE_NAME;
const scenariosTableName = process.env.SCENARIOS_TABLE_NAME;

const dynamodb = new DynamoDBClient({ region });

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

function scenarioToItem(scenario) {
  return {
    scenarioId: { S: scenario.scenarioId },
    title: { S: scenario.title },
    description: { S: scenario.description },
    personaIds: { L: scenario.personaIds.map((personaId) => ({ S: personaId })) },
    status: { S: scenario.status },
    createdAt: { S: scenario.createdAt },
    updatedAt: { S: scenario.updatedAt }
  };
}

function itemToScenario(item) {
  return {
    scenarioId: item.scenarioId?.S || "",
    title: item.title?.S || "",
    description: item.description?.S || "",
    personaIds: (item.personaIds?.L || []).map((personaId) => personaId.S).filter(Boolean),
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

function mapError(error) {
  if (error instanceof SyntaxError) {
    return json(400, { message: "Request body must be valid JSON." });
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(error);
  }

  return json(statusCode, {
    message: statusCode === 500 ? "Content request failed." : error.message
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
