import { Plus, Wand2 } from "lucide-react";

export default function ScenarioBuilderPage() {
  return (
    <section className="builder-layout">
      <div>
        <span className="eyebrow">Manager workflow</span>
        <h2>Create scenario</h2>
        <p className="page-copy">
          Configure topic, persona, difficulty, wave behavior, and scoring rubric. LLM generation wiring
          comes after backend secrets and scenario APIs exist.
        </p>
      </div>

      <form className="scenario-form">
        <label>
          Scenario title
          <input placeholder="Q2 renewal pressure test" />
        </label>

        <div className="form-row">
          <label>
            Topic
            <input placeholder="Billing dispute" />
          </label>
          <label>
            Persona
            <input placeholder="Urgent expansion buyer" />
          </label>
        </div>

        <div className="form-row">
          <label>
            Difficulty
            <select defaultValue="medium">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            Inquiries
            <input type="number" min="5" max="50" defaultValue="12" />
          </label>
        </div>

        <div className="rubric-grid" aria-label="Rubric preview">
          {["Accuracy", "Empathy", "Resolution", "Tone"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>

        <div className="button-row">
          <button type="button" className="secondary-button">
            <Plus aria-hidden="true" size={18} />
            Save draft
          </button>
          <button type="button" className="primary-button">
            <Wand2 aria-hidden="true" size={18} />
            Generate inquiries
          </button>
        </div>
      </form>
    </section>
  );
}
