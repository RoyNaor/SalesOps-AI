import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { getApiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";

function getReturnPath(state: unknown) {
  if (state && typeof state === "object" && "from" in state && typeof state.from === "string") {
    return state.from;
  }

  return "";
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await signIn(email, password);
      const returnPath = getReturnPath(location.state);
      navigate(returnPath || (user.role === "manager" ? "/dashboard" : "/exam"), { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Sign in failed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-copy">
        <span className="brand-mark">SA</span>
        <span className="eyebrow">SalesOps AI</span>
        <h1>Rep readiness starts with a verified workspace.</h1>
        <p>Sign in to launch exams, manage scenarios, and review coaching data from one AWS-backed cockpit.</p>
        <div className="auth-proof">
          <ShieldCheck aria-hidden="true" size={20} />
          <span>Cognito session, DynamoDB profile, protected app routes.</span>
        </div>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="panel-heading">
          <KeyRound aria-hidden="true" size={20} />
          <div>
            <h2>Sign in</h2>
            <p>Use your confirmed SalesOps AI account.</p>
          </div>
        </div>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="manager@salesops.ai"
            autoComplete="email"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Continue"}
          <ArrowRight aria-hidden="true" size={18} />
        </button>

        <p className="auth-switch">
          New here? <Link to="/signup">Create account</Link>
        </p>
      </form>
    </main>
  );
}
