import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ClipboardList,
  LogOut,
  Settings2,
  UserCircle,
  UserCog,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import ExamPage from "./pages/ExamPage";
import ExamStartPage from "./pages/ExamStartPage";
import LoginPage from "./pages/LoginPage";
import PersonasPage from "./pages/PersonasPage";
import ScenarioBuilderPage from "./pages/ScenarioBuilderPage";
import SignupPage from "./pages/SignupPage";
import UsersPage from "./pages/UsersPage";

const repNavItems = [{ to: "/exam/start", label: "Scenario Exam", icon: ClipboardList }];

const managerNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/users", label: "Users", icon: UserCog }
];

const contentLibraryItems = [
  { to: "/personas", label: "Personas", icon: Users },
  { to: "/scenarios", label: "Scenarios", icon: Settings2 }
];

function homePathForRole(role?: string) {
  return role === "manager" ? "/dashboard" : "/exam/start";
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

function HomeRedirect() {
  const { user } = useAuth();

  return <Navigate to={homePathForRole(user?.role)} replace />;
}

function RequireManager({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "manager") {
    return <Navigate to="/exam/start" replace />;
  }

  return <>{children}</>;
}

function RequireRep({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role === "manager") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function ProtectedShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isContentLibraryActive = contentLibraryItems.some((item) => location.pathname.startsWith(item.to));
  const [isContentLibraryOpen, setContentLibraryOpen] = useState(isContentLibraryActive);

  useEffect(() => {
    if (isContentLibraryActive) {
      setContentLibraryOpen(true);
    }
  }, [isContentLibraryActive]);

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
          {user?.role !== "manager"
            ? repNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} className="nav-link">
                    <Icon aria-hidden="true" size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })
            : null}

          {user?.role === "manager" ? (
            <div className={`nav-group ${isContentLibraryOpen ? "open" : ""}`}>
              <button
                aria-expanded={isContentLibraryOpen}
                className={`nav-link nav-parent ${isContentLibraryActive ? "active" : ""}`}
                type="button"
                onClick={() => setContentLibraryOpen((current) => !current)}
              >
                <BookOpen aria-hidden="true" size={18} />
                <span>Content Library</span>
                <ChevronDown aria-hidden="true" className="nav-caret" size={16} />
              </button>
              <div className="nav-sublist">
                <div>
                  {contentLibraryItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink key={item.to} to={item.to} className="nav-link nav-subitem">
                        <Icon aria-hidden="true" size={17} />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {user?.role === "manager"
            ? managerNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} className="nav-link">
                    <Icon aria-hidden="true" size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })
            : null}
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
        path="/exam/start"
        element={
          <RequireAuth>
            <RequireRep>
              <ExamStartPage />
            </RequireRep>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <ProtectedShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/exam" element={<Navigate to="/exam/start" replace />} />
        <Route
          path="/exam/:sessionId"
          element={
            <RequireRep>
              <ExamPage />
            </RequireRep>
          }
        />
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
          path="/users"
          element={
            <RequireManager>
              <UsersPage />
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
