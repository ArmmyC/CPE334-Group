import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from '@cpe334-group/shared';
import { AuthProvider, ROLE_LABEL, homePath, useAuth } from './auth';
import { LoginPage } from './LoginPage';

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

// A page that a later feature replaces (F-02 catalog, F-04 pending requests).
function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <h1 className="h3">{title}</h1>
      <p className="text-body-secondary">This page is not built yet.</p>
    </section>
  );
}

// Usability only (SDS 4.1): signed out goes to login, the other role goes home.
// The API enforces every permission again.
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== 'signed-in') {
    return <Navigate to="/login" replace />;
  }
  if (state.user.role !== role) {
    return <Navigate to={homePath(state.user.role)} replace />;
  }
  return children;
}

function Header() {
  const { state, signOut } = useAuth();
  return (
    <header>
      <nav className="navbar navbar-dark bg-dark">
        <div className="container">
          <Link className="navbar-brand" to="/">
            CPE Lab Equipment Borrowing
          </Link>
          {state.status === 'signed-in' && (
            <div className="d-flex align-items-center gap-2 text-white">
              <span>{state.user.name}</span>
              <span className="badge text-bg-light">{ROLE_LABEL[state.user.role]}</span>
              <button
                type="button"
                className="btn btn-outline-light btn-sm ms-2"
                onClick={() => void signOut()}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

function Content() {
  const { state, retry } = useAuth();

  if (state.status === 'loading') {
    return <p className="text-body-secondary">Loading...</p>;
  }
  if (state.status === 'unreachable') {
    return (
      <div className="alert alert-warning d-flex align-items-center gap-3">
        <span>Could not reach the server.</span>
        <button type="button" className="btn btn-outline-dark btn-sm" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }

  const signedIn = state.status === 'signed-in';
  const home = signedIn ? homePath(state.user.role) : '/login';

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/login" element={signedIn ? <Navigate to={home} replace /> : <LoginPage />} />
      <Route
        path="/catalog"
        element={
          <RequireRole role="BORROWER">
            <PlaceholderPage title="Equipment catalog" />
          </RequireRole>
        }
      />
      <Route
        path="/custodian/requests"
        element={
          <RequireRole role="CUSTODIAN">
            <PlaceholderPage title="Pending requests" />
          </RequireRole>
        }
      />
      <Route
        path="*"
        element={signedIn ? <p>Page not found.</p> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

function Shell() {
  return (
    <>
      <Header />
      <main className="container py-4">
        <Content />
      </main>
    </>
  );
}
