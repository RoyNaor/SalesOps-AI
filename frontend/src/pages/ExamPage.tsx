import { Bold, List, Send } from "lucide-react";

const inquiries = [
  { id: "INQ-1042", customer: "Maya Cohen", subject: "Billing dispute after renewal", status: "pending" },
  { id: "INQ-1043", customer: "Avi Levi", subject: "Feature comparison before upgrade", status: "submitted" },
  { id: "INQ-1044", customer: "Noa Katz", subject: "Escalation after delayed shipment", status: "scored" }
];

export default function ExamPage() {
  return (
    <section className="exam-layout">
      <div className="inbox-column">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Active exam</span>
            <h2>Inbox</h2>
          </div>
          <span className="count-badge">3</span>
        </div>

        <div className="inquiry-list">
          {inquiries.map((inquiry) => (
            <button className={`inquiry-item ${inquiry.status}`} type="button" key={inquiry.id}>
              <span>{inquiry.id}</span>
              <strong>{inquiry.subject}</strong>
              <small>{inquiry.customer}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="response-column">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Selected inquiry</span>
            <h2>Billing dispute after renewal</h2>
          </div>
          <span className="timer-badge">18:42</span>
        </div>

        <article className="customer-note">
          I renewed last week and was charged twice. I need this fixed today before I approve more seats
          for my team.
        </article>

        <div className="editor-shell">
          <div className="editor-toolbar" aria-label="Response formatting">
            <button type="button" title="Bold">
              <Bold aria-hidden="true" size={16} />
            </button>
            <button type="button" title="Bulleted list">
              <List aria-hidden="true" size={16} />
            </button>
          </div>
          <textarea placeholder="Draft representative response..." />
          <button type="button" className="primary-button">
            Submit response
            <Send aria-hidden="true" size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
