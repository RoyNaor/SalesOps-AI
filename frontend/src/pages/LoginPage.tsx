import { ArrowRight, KeyRound } from "lucide-react";
import HealthProbe from "../components/HealthProbe";

export default function LoginPage() {
  return (
    <section className="page-grid">
      <div className="intro-panel">
        <span className="eyebrow">Representative training</span>
        <h2>Pressure-tested sales exams, ready for AWS.</h2>
        <p>
          This first scaffold wires routing, API fetching, and product structure without locking us into
          heavier state tools before the real exam flow needs them.
        </p>
        <HealthProbe />
      </div>

      <form className="login-panel">
        <div className="panel-heading">
          <KeyRound aria-hidden="true" size={20} />
          <div>
            <h3>Lab sign-in shell</h3>
            <p>Cognito wiring lands after the first API deploy.</p>
          </div>
        </div>

        <label>
          Email
          <input type="email" placeholder="manager@salesops.ai" autoComplete="email" />
        </label>

        <label>
          Password
          <input type="password" placeholder="••••••••" autoComplete="current-password" />
        </label>

        <button type="button" className="primary-button">
          Continue
          <ArrowRight aria-hidden="true" size={18} />
        </button>
      </form>
    </section>
  );
}
