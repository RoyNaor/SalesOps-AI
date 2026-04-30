import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { BarChart3, Inbox, LayoutDashboard, LogIn, Settings2 } from "lucide-react";
import DashboardPage from "./pages/DashboardPage";
import ExamPage from "./pages/ExamPage";
import LoginPage from "./pages/LoginPage";
import ScenarioBuilderPage from "./pages/ScenarioBuilderPage";

const navItems = [
  { to: "/login", label: "Login", icon: LogIn },
  { to: "/exam", label: "Exam Inbox", icon: Inbox },
  { to: "/scenarios", label: "Scenarios", icon: Settings2 },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 }
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-block">
          <span className="brand-mark">SA</span>
          <div>
            <strong>SalesOps AI</strong>
            <span>Lab bootstrap</span>
          </div>
        </div>

        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className="nav-link">
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <div className="workspace-topline">
          <div>
            <span className="eyebrow">AWS student lab</span>
            <h1>Sales readiness cockpit</h1>
          </div>
          <div className="status-pill">
            <LayoutDashboard aria-hidden="true" size={16} />
            <span>React + SAM foundation</span>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/scenarios" element={<ScenarioBuilderPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </main>
    </div>
  );
}
