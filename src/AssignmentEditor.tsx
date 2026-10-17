import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "./api";
import { replaceAssignments, type AssignedUser, type AssignmentInput } from "./tanks";
import { fetchUsers } from "./users";

const ROLES = ["monitor", "configure", "manage"] as const;

type Role = (typeof ROLES)[number];

type Props = {
  tankId: string;
  initial: AssignedUser[];
  createdBy: string | null;
};

export function AssignmentEditor({ tankId, initial, createdBy }: Props) {
  const queryClient = useQueryClient();
  const [assignments, setAssignments] = useState<AssignmentInput[]>(
    initial.map(({ username, role }) => ({ username, role })),
  );
  const [userSearch, setUserSearch] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [addRole, setAddRole] = useState<Role>("monitor");
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["users", userSearch, 1],
    queryFn: () => fetchUsers(userSearch, 1, 20),
    enabled: userSearch.trim().length > 0,
  });

  const save = useMutation({
    mutationFn: () => replaceAssignments(tankId, assignments),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tank", tankId] });
      setSaveError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => {
      setSaveError(err instanceof ApiError ? err.message : "Could not save assignments");
    },
  });

  function addAssignment() {
    setAddError(null);
    const name = addUsername.trim().toLowerCase();
    if (!name) {
      setAddError("Enter a username.");
      return;
    }
    if (name === "systemadmin") {
      setAddError("systemadmin already has access to every tank.");
      return;
    }
    if (createdBy && name === createdBy.toLowerCase()) {
      setAddError("The tank creator always has manage access — no assignment needed.");
      return;
    }
    if (assignments.some((a) => a.username.toLowerCase() === name)) {
      setAddError("That user is already in the list. Remove them first to change their role.");
      return;
    }
    setAssignments((prev) => [...prev, { username: name, role: addRole }]);
    setAddUsername("");
    setAddRole("monitor");
  }

  function removeAssignment(username: string) {
    setAssignments((prev) => prev.filter((a) => a.username !== username));
  }

  function changeRole(username: string, role: Role) {
    setAssignments((prev) => prev.map((a) => (a.username === username ? { ...a, role } : a)));
  }

  // Map initial details by username so we can show names
  const detailMap: Record<string, AssignedUser> = {};
  for (const u of initial) detailMap[u.username] = u;

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl text-stone-900">Assigned users</h2>
      {createdBy ? (
        <p className="mt-1 text-sm text-stone-600">
          Owner: <span className="font-semibold text-stone-900">{createdBy}</span>{" "}
          <span className="text-stone-400">(manage)</span>
        </p>
      ) : null}

      {assignments.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {assignments.map((a) => {
            const detail = detailMap[a.username];
            return (
              <li
                key={a.username}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900">
                    {detail ? `${detail.first_name} ${detail.last_name}` : a.username}
                  </p>
                  {detail && detail.username !== a.username ? null : (
                    <p className="font-mono text-xs text-stone-500">{a.username}</p>
                  )}
                  {detail ? (
                    <p className="font-mono text-xs text-stone-500">{detail.username}</p>
                  ) : null}
                </div>
                <select
                  aria-label={`Role for ${a.username}`}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800"
                  value={a.role}
                  onChange={(e) => changeRole(a.username, e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Remove ${a.username}`}
                  className="text-xs text-red-700 hover:underline"
                  onClick={() => removeAssignment(a.username)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-500">No users assigned yet.</p>
      )}

      {/* Add user row */}
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Add user</p>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              placeholder="Search username…"
              className="min-h-9 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setAddUsername(e.target.value);
              }}
            />
            {usersQuery.data && usersQuery.data.items.length > 0 && userSearch ? (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg">
                {usersQuery.data.items.map((u) => (
                  <li key={u.username}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
                      onClick={() => {
                        setAddUsername(u.username);
                        setUserSearch(u.username);
                      }}
                    >
                      <span className="font-medium text-stone-900">
                        {u.first_name} {u.last_name}
                      </span>{" "}
                      <span className="font-mono text-xs text-stone-500">{u.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <select
            aria-label="Role to assign"
            className="min-h-9 rounded-xl border border-stone-300 bg-white px-2 text-sm text-stone-800"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="min-h-9 rounded-xl bg-[#1f4d42] px-4 text-sm font-semibold text-white"
            onClick={addAssignment}
          >
            Add
          </button>
        </div>
        {addError ? <p className="text-xs text-red-700">{addError}</p> : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="min-h-10 rounded-xl bg-[#1f4d42] px-4 text-sm font-semibold text-white disabled:opacity-60"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Save assignments
        </button>
        {saved ? <p className="text-sm text-teal-700">Saved.</p> : null}
        {saveError ? <p className="text-sm text-red-700">{saveError}</p> : null}
      </div>
    </section>
  );
}
