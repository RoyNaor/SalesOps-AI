import axios from "axios";

export type HealthResponse = {
  status: "ok";
  service: string;
  stage: string;
  timestamp: string;
};

export type UserRole = "rep" | "manager";

export type UserProfile = {
  userId: string;
  email: string;
  emailLower: string;
  fullName: string;
  role: UserRole;
  status: "PENDING_CONFIRMATION" | "ACTIVE" | string;
  createdAt: string;
  updatedAt: string;
};

export type SignUpRequest = {
  email: string;
  password: string;
  fullName: string;
};

export type SignUpResponse = {
  userId: string;
  email: string;
  nextStep: "CONFIRM_EMAIL";
};

export type ConfirmSignUpRequest = {
  email: string;
  code: string;
};

export type SignInRequest = {
  email: string;
  password: string;
};

export type SignInResponse = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserProfile;
};

export type RefreshResponse = {
  idToken: string;
  accessToken: string;
  expiresIn: number;
};

export type MeResponse = {
  user: UserProfile;
};

export type PersonaStatus = "ACTIVE" | "ARCHIVED" | string;

export type Persona = {
  personaId: string;
  name: string;
  description: string;
  behaviorNotes: string;
  status: PersonaStatus;
  createdAt: string;
  updatedAt: string;
};

export type PersonaFormPayload = {
  name: string;
  description: string;
  behaviorNotes: string;
};

export type ScenarioStatus = "DRAFT" | "PUBLISHED" | string;
export type ScenarioIssueDifficulty = "EASY" | "MEDIUM" | "HARD";

export type ScenarioIssue = {
  issueId: string;
  personaId: string;
  customerName: string;
  subject: string;
  message: string;
  difficulty: ScenarioIssueDifficulty;
  status: "DRAFT" | string;
  createdAt: string;
  updatedAt: string;
};

export type Scenario = {
  scenarioId: string;
  title: string;
  description: string;
  personaIds: string[];
  issueCount: number;
  issues: ScenarioIssue[];
  issuesGeneratedAt?: string;
  status: ScenarioStatus;
  createdAt: string;
  updatedAt: string;
};

export type ScenarioFormPayload = {
  title: string;
  description: string;
  personaIds: string[];
  issueCount: number;
};

export type ScenarioIssueUpdatePayload = {
  customerName: string;
  subject: string;
  message: string;
  difficulty: ScenarioIssueDifficulty;
};

export type PersonasResponse = {
  personas: Persona[];
};

export type PersonaResponse = {
  persona: Persona;
};

export type ScenariosResponse = {
  scenarios: Scenario[];
};

export type ScenarioResponse = {
  scenario: Scenario;
};

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 8000
});

export function setApiAuthToken(idToken: string | null) {
  if (idToken) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${idToken}`;
    return;
  }

  delete apiClient.defaults.headers.common.Authorization;
}

export function getApiErrorMessage(error: unknown, fallback = "Request failed.") {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>("/health");
  return data;
}

export async function signUpUser(payload: SignUpRequest): Promise<SignUpResponse> {
  const { data } = await apiClient.post<SignUpResponse>("/auth/signup", payload);
  return data;
}

export async function confirmUserSignUp(payload: ConfirmSignUpRequest): Promise<void> {
  await apiClient.post("/auth/confirm", payload);
}

export async function signInUser(payload: SignInRequest): Promise<SignInResponse> {
  const { data } = await apiClient.post<SignInResponse>("/auth/signin", payload);
  return data;
}

export async function refreshAuthSession(refreshToken: string): Promise<RefreshResponse> {
  const { data } = await apiClient.post<RefreshResponse>("/auth/refresh", { refreshToken });
  return data;
}

export async function fetchCurrentUser(): Promise<UserProfile> {
  const { data } = await apiClient.get<MeResponse>("/auth/me");
  return data.user;
}

export async function fetchPersonas(): Promise<Persona[]> {
  const { data } = await apiClient.get<PersonasResponse>("/personas");
  return data.personas;
}

export async function createPersona(payload: PersonaFormPayload): Promise<Persona> {
  const { data } = await apiClient.post<PersonaResponse>("/personas", payload);
  return data.persona;
}

export async function updatePersona(personaId: string, payload: PersonaFormPayload): Promise<Persona> {
  const { data } = await apiClient.put<PersonaResponse>(`/personas/${personaId}`, payload);
  return data.persona;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const { data } = await apiClient.get<ScenariosResponse>("/scenarios");
  return data.scenarios;
}

export async function createScenario(payload: ScenarioFormPayload): Promise<Scenario> {
  const { data } = await apiClient.post<ScenarioResponse>("/scenarios", payload);
  return data.scenario;
}

export async function updateScenario(scenarioId: string, payload: ScenarioFormPayload): Promise<Scenario> {
  const { data } = await apiClient.put<ScenarioResponse>(`/scenarios/${scenarioId}`, payload);
  return data.scenario;
}

export async function publishScenario(scenarioId: string): Promise<Scenario> {
  const { data } = await apiClient.post<ScenarioResponse>(`/scenarios/${scenarioId}/publish`);
  return data.scenario;
}

export async function generateScenarioIssues(scenarioId: string): Promise<Scenario> {
  const { data } = await apiClient.post<ScenarioResponse>(
    `/scenarios/${scenarioId}/issues/generate`,
    undefined,
    { timeout: 30000 }
  );
  return data.scenario;
}

export async function updateScenarioIssue(
  scenarioId: string,
  issueId: string,
  payload: ScenarioIssueUpdatePayload
): Promise<Scenario> {
  const { data } = await apiClient.put<ScenarioResponse>(`/scenarios/${scenarioId}/issues/${issueId}`, payload);
  return data.scenario;
}
