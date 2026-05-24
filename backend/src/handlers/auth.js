"use strict";

const {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand
} = require("@aws-sdk/client-cognito-identity-provider");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand
} = require("@aws-sdk/client-dynamodb");

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const userPoolClientId = process.env.USER_POOL_CLIENT_ID;
const usersTableName = process.env.USERS_TABLE_NAME;

const cognito = new CognitoIdentityProviderClient({ region });
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function asRequiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireConfig() {
  if (!userPoolClientId || !usersTableName) {
    throw Object.assign(new Error("Auth service is not configured."), { statusCode: 500 });
  }
}

function decodeJwtPayload(token) {
  const [, payload] = String(token || "").split(".");
  if (!payload) {
    return {};
  }

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function toAttributeMap(profile) {
  return {
    userId: { S: profile.userId },
    email: { S: profile.email },
    emailLower: { S: profile.emailLower },
    fullName: { S: profile.fullName },
    role: { S: profile.role },
    status: { S: profile.status },
    createdAt: { S: profile.createdAt },
    updatedAt: { S: profile.updatedAt }
  };
}

function toProfile(item) {
  if (!item) {
    return null;
  }

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

async function getProfileByUserId(userId) {
  if (!userId) {
    return null;
  }

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: usersTableName,
      Key: {
        userId: { S: userId }
      }
    })
  );

  return toProfile(result.Item);
}

async function getProfileByEmail(emailLower) {
  if (!emailLower) {
    return null;
  }

  const result = await dynamodb.send(
    new QueryCommand({
      TableName: usersTableName,
      IndexName: "EmailIndex",
      KeyConditionExpression: "emailLower = :emailLower",
      ExpressionAttributeValues: {
        ":emailLower": { S: emailLower }
      },
      Limit: 1
    })
  );

  return toProfile(result.Items?.[0]);
}

async function putProfile(profile) {
  await dynamodb.send(
    new PutItemCommand({
      TableName: usersTableName,
      Item: toAttributeMap(profile)
    })
  );
}

async function markProfileActive(profile) {
  const updatedAt = new Date().toISOString();

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: usersTableName,
      Key: {
        userId: { S: profile.userId }
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":status": { S: "ACTIVE" },
        ":updatedAt": { S: updatedAt }
      }
    })
  );

  return {
    ...profile,
    status: "ACTIVE",
    updatedAt
  };
}

async function ensureProfileFromClaims(claims) {
  const userId = claims.sub;
  const email = normalizeEmail(claims.email);
  const now = new Date().toISOString();

  let profile = (await getProfileByUserId(userId)) || (await getProfileByEmail(email));
  if (profile) {
    return profile.status === "PENDING_CONFIRMATION" ? markProfileActive(profile) : profile;
  }

  profile = {
    userId,
    email,
    emailLower: email,
    fullName: asRequiredString(claims.name) || email,
    role: "rep",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now
  };

  await putProfile(profile);
  return profile;
}

function mapError(error) {
  const statusCode = error.statusCode || 500;

  if (error.name === "UsernameExistsException") {
    return json(409, { message: "Account already exists for this email." });
  }

  if (error.name === "InvalidPasswordException" || error.name === "InvalidParameterException") {
    return json(400, { message: error.message || "Invalid signup details." });
  }

  if (error.name === "CodeMismatchException" || error.name === "ExpiredCodeException") {
    return json(400, { message: "Confirmation code is invalid or expired." });
  }

  if (error.name === "UserNotConfirmedException") {
    return json(403, { message: "Confirm your email before signing in." });
  }

  if (error.name === "LimitExceededException" || error.name === "TooManyRequestsException") {
    return json(429, { message: "Too many attempts. Try again later." });
  }

  if (error.name === "NotAuthorizedException" || error.name === "UserNotFoundException") {
    return json(401, { message: "Email or password is incorrect." });
  }

  if (error instanceof SyntaxError) {
    return json(400, { message: "Request body must be valid JSON." });
  }

  console.error(error);
  return json(statusCode, { message: statusCode === 500 ? "Auth request failed." : error.message });
}

exports.signup = async (event) => {
  try {
    requireConfig();
    const body = parseBody(event);
    const email = normalizeEmail(body.email);
    const password = asRequiredString(body.password);
    const fullName = asRequiredString(body.fullName);

    if (!email || !password || !fullName) {
      return json(400, { message: "Email, password, and full name are required." });
    }

    const result = await cognito.send(
      new SignUpCommand({
        ClientId: userPoolClientId,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "name", Value: fullName }
        ]
      })
    );

    const now = new Date().toISOString();
    const userId = result.UserSub;

    if (!userId) {
      throw Object.assign(new Error("Cognito did not return a user id."), { statusCode: 500 });
    }

    await putProfile({
      userId,
      email,
      emailLower: email,
      fullName,
      role: "rep",
      status: result.UserConfirmed ? "ACTIVE" : "PENDING_CONFIRMATION",
      createdAt: now,
      updatedAt: now
    });

    return json(200, {
      userId,
      email,
      nextStep: "CONFIRM_EMAIL"
    });
  } catch (error) {
    return mapError(error);
  }
};

exports.confirm = async (event) => {
  try {
    requireConfig();
    const body = parseBody(event);
    const email = normalizeEmail(body.email);
    const code = asRequiredString(body.code);

    if (!email || !code) {
      return json(400, { message: "Email and confirmation code are required." });
    }

    try {
      await cognito.send(
        new ConfirmSignUpCommand({
          ClientId: userPoolClientId,
          Username: email,
          ConfirmationCode: code
        })
      );
    } catch (error) {
      const alreadyConfirmed =
        error.name === "NotAuthorizedException" && String(error.message || "").includes("CONFIRMED");
      if (!alreadyConfirmed) {
        throw error;
      }
    }

    const profile = await getProfileByEmail(email);
    if (profile) {
      await markProfileActive(profile);
    }

    return json(200, { status: "confirmed" });
  } catch (error) {
    return mapError(error);
  }
};

exports.signin = async (event) => {
  try {
    requireConfig();
    const body = parseBody(event);
    const email = normalizeEmail(body.email);
    const password = asRequiredString(body.password);

    if (!email || !password) {
      return json(400, { message: "Email and password are required." });
    }

    const result = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: userPoolClientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password
        }
      })
    );

    const auth = result.AuthenticationResult;
    if (!auth?.IdToken || !auth.AccessToken || !auth.RefreshToken) {
      throw Object.assign(new Error("Cognito did not return a full session."), { statusCode: 500 });
    }

    const claims = decodeJwtPayload(auth.IdToken);
    const user = await ensureProfileFromClaims({
      sub: claims.sub,
      email: claims.email || email,
      name: claims.name
    });

    if (user.status !== "ACTIVE") {
      return json(403, { message: "Account is not active." });
    }

    return json(200, {
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      refreshToken: auth.RefreshToken,
      expiresIn: auth.ExpiresIn || 3600,
      user
    });
  } catch (error) {
    return mapError(error);
  }
};

exports.refresh = async (event) => {
  try {
    requireConfig();
    const body = parseBody(event);
    const refreshToken = asRequiredString(body.refreshToken);

    if (!refreshToken) {
      return json(400, { message: "Refresh token is required." });
    }

    const result = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: userPoolClientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken
        }
      })
    );

    const auth = result.AuthenticationResult;
    if (!auth?.IdToken || !auth.AccessToken) {
      throw Object.assign(new Error("Cognito did not refresh the session."), { statusCode: 500 });
    }

    return json(200, {
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      expiresIn: auth.ExpiresIn || 3600
    });
  } catch (error) {
    return mapError(error);
  }
};

exports.me = async (event) => {
  try {
    requireConfig();
    const claims = event.requestContext?.authorizer?.claims;

    if (!claims?.sub) {
      return json(401, { message: "Missing authenticated user." });
    }

    const user = await ensureProfileFromClaims(claims);
    if (user.status !== "ACTIVE") {
      return json(403, { message: "Account is not active." });
    }

    return json(200, { user });
  } catch (error) {
    return mapError(error);
  }
};

exports.resendConfirmation = async (event) => {
  try {
    requireConfig();
    const body = parseBody(event);
    const email = normalizeEmail(body.email);

    if (!email) {
      return json(400, { message: "Email is required." });
    }

    await cognito.send(
      new ResendConfirmationCodeCommand({
        ClientId: userPoolClientId,
        Username: email
      })
    );

    return json(200, { status: "sent" });
  } catch (error) {
    return mapError(error);
  }
};

exports.forgotPassword = async (event) => {
  try {
    requireConfig();
    const body = parseBody(event);
    const email = normalizeEmail(body.email);

    if (!email) {
      return json(400, { message: "Email is required." });
    }

    await cognito.send(
      new ForgotPasswordCommand({
        ClientId: userPoolClientId,
        Username: email
      })
    );

    return json(200, { status: "sent" });
  } catch (error) {
    return mapError(error);
  }
};

exports.confirmForgotPassword = async (event) => {
  try {
    requireConfig();
    const body = parseBody(event);
    const email = normalizeEmail(body.email);
    const code = asRequiredString(body.code);
    const password = asRequiredString(body.password);

    if (!email || !code || !password) {
      return json(400, { message: "Email, confirmation code, and new password are required." });
    }

    await cognito.send(
      new ConfirmForgotPasswordCommand({
        ClientId: userPoolClientId,
        Username: email,
        ConfirmationCode: code,
        Password: password
      })
    );

    return json(200, { status: "confirmed" });
  } catch (error) {
    return mapError(error);
  }
};
