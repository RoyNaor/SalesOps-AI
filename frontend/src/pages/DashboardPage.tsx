import type { CSSProperties } from "react";

const reps = [
  { name: "Dana", score: 91, response: "42s", focus: "Maintain tone under load" },
  { name: "Eli", score: 84, response: "58s", focus: "Improve resolution specificity" },
  { name: "Tamar", score: 76, response: "71s", focus: "Shorten first reply time" }
];

export default function DashboardPage() {
  return (
    <section className="dashboard-layout">
      <div className="metric-strip">
        <div>
          <span>Avg score</span>
          <strong>84</strong>
        </div>
        <div>
          <span>P95 evaluation</span>
          <strong>4.2s</strong>
        </div>
        <div>
          <span>Open sessions</span>
          <strong>12</strong>
        </div>
      </div>

      <div className="results-table-wrap">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Management dashboard</span>
            <h2>Rep performance</h2>
          </div>
        </div>

        <table className="results-table">
          <thead>
            <tr>
              <th>Rep</th>
              <th>Score</th>
              <th>Avg response</th>
              <th>Coaching focus</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.name}>
                <td>{rep.name}</td>
                <td>
                  <span className="score-bar" style={{ "--score": rep.score } as CSSProperties}>
                    {rep.score}
                  </span>
                </td>
                <td>{rep.response}</td>
                <td>{rep.focus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
