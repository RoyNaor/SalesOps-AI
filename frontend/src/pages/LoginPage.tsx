import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { confirmForgotPassword, getApiErrorMessage, startForgotPassword } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type AuthMode = "signin" | "forgot-request" | "forgot-confirm" | "forgot-done";

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
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await signIn(email, password);
      const returnPath = getReturnPath(location.state);
      navigate(returnPath || (user.role === "manager" ? "/dashboard" : "/exam/start"), { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Sign in failed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await startForgotPassword({ email: resetEmail });
      setMode("forgot-confirm");
    } catch (err) {
      setError(getApiErrorMessage(err, "Reset code could not be sent."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await confirmForgotPassword({ email: resetEmail, code: resetCode, password: newPassword });
      setPassword("");
      setMode("forgot-done");
    } catch (err) {
      setError(getApiErrorMessage(err, "Password could not be reset."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForgotFlow() {
    setMode("signin");
    setError("");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
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

      {mode === "signin" ? (
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
              onChange={(event) => {
                setEmail(event.target.value);
                setResetEmail(event.target.value);
              }}
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

          <button
            className="text-button auth-inline-action"
            type="button"
            onClick={() => {
              setError("");
              setResetEmail(email);
              setMode("forgot-request");
            }}
          >
            Forgot password?
          </button>

          <p className="auth-switch">
            New here? <Link to="/signup">Create account</Link>
          </p>
        </form>
      ) : null}

      {mode === "forgot-request" ? (
        <form className="auth-card" onSubmit={handleForgotRequest}>
          <div className="panel-heading">
            <KeyRound aria-hidden="true" size={20} />
            <div>
              <h2>Reset password</h2>
              <p>Send a reset code to your confirmed email.</p>
            </div>
          </div>

          <label>
            Email
            <input
              type="email"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              placeholder="rep@salesops.ai"
              autoComplete="email"
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset code"}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          <button type="button" className="secondary-button" disabled={isSubmitting} onClick={resetForgotFlow}>
            Back to sign in
          </button>
        </form>
      ) : null}

      {mode === "forgot-confirm" ? (
        <form className="auth-card" onSubmit={handleForgotConfirm}>
          <div className="panel-heading">
            <KeyRound aria-hidden="true" size={20} />
            <div>
              <h2>Set new password</h2>
              <p>Use the code sent to {resetEmail}.</p>
            </div>
          </div>

          <label>
            Confirmation code
            <input
              value={resetCode}
              onChange={(event) => setResetCode(event.target.value)}
              placeholder="123456"
              autoComplete="one-time-code"
              required
            />
          </label>

          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label>
            Confirm password
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              placeholder="Password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Resetting..." : "Reset password"}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          <button type="button" className="secondary-button" disabled={isSubmitting} onClick={resetForgotFlow}>
            Back to sign in
          </button>
        </form>
      ) : null}

      {mode === "forgot-done" ? (
        <div className="auth-card">
          <div className="panel-heading">
            <KeyRound aria-hidden="true" size={20} />
            <div>
              <h2>Password reset</h2>
              <p>Sign in with your new password.</p>
            </div>
          </div>
          <p className="form-success">Password updated for {resetEmail}.</p>
          <button type="button" className="primary-button" onClick={resetForgotFlow}>
            Back to sign in
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>
      ) : null}
    </main>
  );
}
