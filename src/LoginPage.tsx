import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, login } from "./api";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-6">
      <p className="text-sm font-medium tracking-wide text-teal-800">Bulk milk cooler</p>
      <h1 className="font-display mt-2 text-4xl text-stone-900">Sign in</h1>
      <p className="mt-2 text-stone-600">Use the dashboard username issued for this cooler.</p>
      <form className="mt-8 flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-800">
          Username
          <input
            className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-stone-800">
          Password
          <input
            className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <button
          className="mt-2 min-h-12 rounded-xl bg-teal-800 text-base font-semibold text-white disabled:opacity-60"
          type="submit"
          disabled={pending}
        >
          Log in
        </button>
      </form>
    </main>
  );
}
