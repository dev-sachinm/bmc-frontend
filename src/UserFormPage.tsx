import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "./api";
import { ContentBack } from "./ContentBack";
import {
  createUser,
  deleteUser,
  fetchUser,
  patchUser,
  setUserPassword,
} from "./users";

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = true,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-stone-800 lg:gap-2 lg:text-sm">
      {label}
      <input
        className="min-h-9 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-2 text-sm text-stone-900 lg:min-h-12 lg:rounded-2xl lg:px-3 lg:text-base"
        type={type}
        required={required}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function UserFormPage() {
  const { username } = useParams();
  const editing = Boolean(username);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Password section
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);

  // Delete section
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ["user", username],
    queryFn: () => fetchUser(username!),
    enabled: editing,
  });

  useEffect(() => {
    if (!existing.data) return;
    setFirstName(existing.data.first_name);
    setLastName(existing.data.last_name);
    setMobile(existing.data.mobile_number);
  }, [existing.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        return patchUser(username!, {
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          mobile_number: mobile.trim() || undefined,
        });
      }
      return createUser({
        username: newUsername.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile_number: mobile.trim(),
        password: password,
      });
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      if (editing) {
        await queryClient.invalidateQueries({ queryKey: ["user", username] });
        setError(null);
      } else {
        navigate(`/users/${encodeURIComponent(user.username)}`);
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not save user");
    },
  });

  const changePassword = useMutation({
    mutationFn: () => setUserPassword(username!, pwValue),
    onSuccess: () => {
      setPwValue("");
      setPwError(null);
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2500);
    },
    onError: (err) => {
      setPwError(err instanceof ApiError ? err.message : "Could not set password");
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteUser(username!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate("/users");
    },
    onError: (err) => {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete user");
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!editing) {
      if (!newUsername.trim() || !firstName.trim() || !lastName.trim() || !mobile.trim() || !password) {
        setError("All fields are required.");
        return;
      }
    }
    save.mutate();
  }

  function onPasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError(null);
    if (pwValue.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    changePassword.mutate();
  }

  const isSystemadmin = username === "systemadmin";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <ContentBack />
      <p className="text-xs font-medium text-[#1f4d42] lg:text-sm">
        <Link to="/users" className="underline-offset-4 hover:underline">
          Users
        </Link>
      </p>
      <h1 className="font-display mt-1 text-2xl text-stone-950 lg:mt-2 lg:text-4xl">
        {editing ? (existing.data ? `${existing.data.first_name} ${existing.data.last_name}` : username) : "New user"}
      </h1>
      {editing && username ? (
        <p className="font-mono text-xs text-stone-500 sm:mt-1 sm:text-sm">{username}</p>
      ) : null}

      {editing && existing.isPending ? (
        <p className="mt-6 text-stone-600">Loading user…</p>
      ) : null}
      {editing && existing.isError ? (
        <p role="alert" className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-red-800">
          Could not load user
        </p>
      ) : null}

      {(!editing || existing.data) ? (
        <form className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5" onSubmit={onSubmit}>
          {!editing ? (
            <div className="col-span-full">
              <Field
                label="Username"
                value={newUsername}
                onChange={setNewUsername}
                autoComplete="username"
              />
            </div>
          ) : null}
          <Field label="First name" value={firstName} onChange={setFirstName} />
          <Field label="Last name" value={lastName} onChange={setLastName} />
          <div className="col-span-full">
            <Field label="Mobile number" value={mobile} onChange={setMobile} type="tel" />
          </div>
          {!editing ? (
            <div className="col-span-full">
              <Field
                label="Password"
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="new-password"
              />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="col-span-full rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800 lg:text-sm">
              {error}
            </p>
          ) : null}
          <div className="col-span-full flex flex-wrap gap-2">
            <button
              className="min-h-9 rounded-xl bg-[#1f4d42] px-4 text-sm font-semibold text-white disabled:opacity-60 lg:min-h-12 lg:rounded-2xl"
              type="submit"
              disabled={save.isPending}
            >
              {editing ? "Save changes" : "Create user"}
            </button>
            <Link
              to={editing ? `/users/${encodeURIComponent(username!)}` : "/users"}
              className="inline-flex min-h-9 items-center rounded-xl px-3 text-sm font-semibold text-stone-700 lg:min-h-12 lg:rounded-2xl lg:px-4"
            >
              Cancel
            </Link>
          </div>
        </form>
      ) : null}

      {/* Password change — only on edit page */}
      {editing ? (
        <section className="mt-10 border-t border-stone-200 pt-8">
          <h2 className="font-display text-xl text-stone-900">Set password</h2>
          <p className="mt-1 text-sm text-stone-600">
            The current password is not required. Set a new password for this user.
          </p>
          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={onPasswordSubmit}>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-stone-800">
              New password
              <input
                className="min-h-9 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 lg:min-h-11"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="min-h-9 rounded-xl bg-stone-800 px-4 text-sm font-semibold text-white disabled:opacity-60 lg:min-h-11"
              disabled={changePassword.isPending}
            >
              Set password
            </button>
          </form>
          {pwError ? <p className="mt-2 text-sm text-red-700">{pwError}</p> : null}
          {pwSaved ? <p className="mt-2 text-sm text-teal-700">Password updated.</p> : null}
        </section>
      ) : null}

      {/* Delete — only on edit page and not for systemadmin */}
      {editing && !isSystemadmin ? (
        <section className="mt-10 border-t border-stone-200 pt-8">
          <h2 className="font-display text-xl text-stone-900">Delete user</h2>
          <p className="mt-1 text-sm text-stone-600">
            Removes the user and their tank assignments. Tanks they created remain, with no owner.
          </p>
          <button
            type="button"
            className="mt-4 min-h-9 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white lg:min-h-11"
            onClick={() => setConfirmDelete(true)}
          >
            Delete user
          </button>
        </section>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            className="w-full max-w-md rounded-3xl bg-[#f8f4ec] p-6 shadow-xl"
          >
            <h2 id="delete-user-title" className="font-display text-2xl text-stone-950">
              Delete {username}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              Their tank assignments will be removed. Tanks they created will remain but will have
              no owner.
            </p>
            {deleteError ? (
              <p role="alert" className="mt-3 text-sm text-red-800">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl px-4 text-sm font-semibold text-stone-700"
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-red-800 px-4 text-sm font-semibold text-white disabled:opacity-60"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Delete user
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
