import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiBaseUrl, fetchHealth } from "../api/client";

export default function HealthProbe() {
  const enabled = Boolean(apiBaseUrl);
  const { data, error, isFetching } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    enabled
  });

  if (!enabled) {
    return (
      <div className="health-panel muted-panel">
        <AlertCircle aria-hidden="true" size={18} />
        <span>Set `VITE_API_BASE_URL` after SAM deploy to test `/health`.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="health-panel error-panel">
        <AlertCircle aria-hidden="true" size={18} />
        <span>Backend health check failed.</span>
      </div>
    );
  }

  return (
    <div className="health-panel success-panel">
      {isFetching ? <Activity aria-hidden="true" size={18} /> : <CheckCircle2 aria-hidden="true" size={18} />}
      <span>{data ? `${data.service} is ${data.status} on ${data.stage}` : "Checking backend health..."}</span>
    </div>
  );
}
