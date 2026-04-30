import axios from "axios";

export type HealthResponse = {
  status: "ok";
  service: string;
  stage: string;
  timestamp: string;
};

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 8000
});

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>("/health");
  return data;
}
