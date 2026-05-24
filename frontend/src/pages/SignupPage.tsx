import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, MailCheck, UserPlus } from "lucide-react";
import { getApiErrorMessage, resendConfirmationCode } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function SignupPage() {
  const { signUp, confirmSignUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await signUp({ email, password, fullName });
      setPendingEmail(response.email);
      setResendMessage("");
    } catch (err) {
      setError(getApiErrorMessage(err, "Signup failed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await confirmSignUp({ email: pendingEmail, code });
      setIsConfirmed(true);
      setResendMessage("");
    } catch (err) {
      setError(getApiErrorMessage(err, "Confirmation failed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    setError("");
    setResendMessage("");
    setIsResending(true);

    try {
      await resendConfirmationCode(pendingEmail);
      setResendMessage(`New code sent to ${pendingEmail}.`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Confirmation code could not be resent."));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-copy">
        <span className="brand-mark">SA</span>
        <span className="eyebrow">New account</span>
        <h1>Create rep access for the SalesOps AI lab.</h1>
        <p>New accounts start as reps. Managers can grant access from the Users page after confirmation.</p>
        <div className="auth-proof">
          <BadgeCheck aria-hidden="true" size={20} />
          <span>Default role: rep</span>
        </div>
      </div>

      {!pendingEmail ? (
        <form className="auth-card" onSubmit={handleSignup}>
          <div className="panel-heading">
            <UserPlus aria-hidden="true" size={20} />
            <div>
              <h2>Sign up</h2>
              <p>Cognito handles credentials. DynamoDB stores profile and role.</p>
            </div>
          </div>

          <label>
            Full name
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Dana Cohen"
              autoComplete="name"
              required
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="rep@salesops.ai"
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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create account"}
            <ArrowRight aria-hidden="true" size={18} />
          </button>

          <p className="auth-switch">
            Have account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      ) : (
        <form className="auth-card" onSubmit={handleConfirm}>
          <div className="panel-heading">
            <MailCheck aria-hidden="true" size={20} />
            <div>
              <h2>{isConfirmed ? "Email confirmed" : "Check email"}</h2>
              <p>{isConfirmed ? "Account is ready for sign in." : `Enter the code sent to ${pendingEmail}.`}</p>
            </div>
          </div>

          {!isConfirmed ? (
            <>
              <label>
                Confirmation code
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  required
                />
              </label>

              {error ? <p className="form-error">{error}</p> : null}
              {resendMessage ? <p className="form-success">{resendMessage}</p> : null}

              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? "Confirming..." : "Confirm email"}
                <ArrowRight aria-hidden="true" size={18} />
              </button>
              <button type="button" className="secondary-button" disabled={isSubmitting || isResending} onClick={handleResendCode}>
                {isResending ? "Sending..." : "Resend code"}
              </button>
            </>
          ) : (
            <button type="button" className="primary-button" onClick={() => navigate("/login", { replace: true })}>
              Go to sign in
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          )}
        </form>
      )}
    </main>
  );
}
