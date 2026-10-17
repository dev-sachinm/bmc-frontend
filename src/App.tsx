import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ApiError } from "./api";
import { LoginPage } from "./LoginPage";
import { currentUsername, getToken, subscribeUnauthorized } from "./session";
import { Shell } from "./Shell";
import { TankDetailPage } from "./TankDetailPage";
import { TankFormPage } from "./TankFormPage";
import { TanksPage } from "./TanksPage";
import { UserFormPage } from "./UserFormPage";
import { UsersPage } from "./UsersPage";

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  if (currentUsername() !== "systemadmin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    return subscribeUnauthorized(() => {
      navigate("/login");
    });
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<TanksPage />} />
        <Route path="/tanks/new" element={<TankFormPage />} />
        <Route path="/tanks/:tankId" element={<TankDetailPage />} />
        <Route path="/tanks/:tankId/edit" element={<TankFormPage />} />
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/users/new"
          element={
            <RequireAdmin>
              <UserFormPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/users/:username"
          element={
            <RequireAdmin>
              <UserFormPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (error instanceof ApiError) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  );
}
