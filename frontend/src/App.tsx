import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { BarChart3, Inbox, LayoutDashboard, LogOut, Settings2, UserCircle, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import ExamPage from "./pages/ExamPage";
import LoginPage from "./pages/LoginPage";
import PersonasPage from "./pages/PersonasPage";
import ScenarioBuilderPage from "./pages/ScenarioBuilderPage";
import SignupPage from "./pages/SignupPage";

const repNavItems = [{ to: "/exam", label: "Exam Inbox", icon: Inbox }];

const managerNavItems = [
  { to: "/personas", label: "Personas", icon: Users },
  { to: "/scenarios", label: "Scenarios", icon: Settings2 },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 }
];

function homePathForRole(role?: string) {
  return role === "manager" ? "/dashboard" : "/exam";
}

function RouteLoading() {
  return (
    <main className="route-loading" aria-live="polite">
      <span className="brand-mark">SA</span>
      <strong>Loading SalesOps AI...</strong>
    </main>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, session, isLoading } = useAuth();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (session) {
    return <Navigate to={homePathForRole(user?.role)} replace />;
  }

  return <>{children}</>;
}

function RequireManager({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "manager") {
    return <Navigate to="/exam" replace />;
  }

  return <>{children}</>;
}

function ProtectedShell() {
  const { user, signOut } = useAuth();
  const navItems = user?.role === "manager" ? [...repNavItems, ...managerNavItems] : repNavItems;

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

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <UserCircle aria-hidden="true" size={20} />
            <div>
              <strong>{user?.fullName || "SalesOps user"}</strong>
              <span>{user?.role || "rep"}</span>
            </div>
          </div>
          <button className="sidebar-action" type="button" onClick={signOut}>
            <LogOut aria-hidden="true" size={18} />
            <span>Sign out</span>
          </button>
        </div>
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

        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <SignupPage />
          </PublicOnly>
        }
      />
      <Route
        element={
          <RequireAuth>
            <ProtectedShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/exam" replace />} />
        <Route path="/exam" element={<ExamPage />} />
        <Route
          path="/personas"
          element={
            <RequireManager>
              <PersonasPage />
            </RequireManager>
          }
        />
        <Route
          path="/scenarios"
          element={
            <RequireManager>
              <ScenarioBuilderPage />
            </RequireManager>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireManager>
              <DashboardPage />
            </RequireManager>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
