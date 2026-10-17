import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ContentBack } from "./ContentBack";
import { Pager } from "./Pager";
import { fetchUsers, type User } from "./users";

const PAGE_SIZE = 20;

function UserRow({ user }: { user: User }) {
  return (
    <li>
      <Link
        to={`/users/${encodeURIComponent(user.username)}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200 hover:ring-[#1f4d42]/40"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-stone-900">
            {user.first_name} {user.last_name}
          </p>
          <p className="font-mono text-xs text-stone-500">{user.username}</p>
        </div>
        <p className="shrink-0 text-sm text-stone-500">{user.mobile_number}</p>
      </Link>
    </li>
  );
}

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [page, setPage] = useState(1);

  const users = useQuery({
    queryKey: ["users", search, page],
    queryFn: () => fetchUsers(search, page, PAGE_SIZE),
  });

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(draftSearch);
    setPage(1);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <ContentBack />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#1f4d42] lg:text-sm">
            Administration
          </p>
          <h1 className="font-display text-xl leading-6 text-stone-950 lg:text-4xl">Users</h1>
        </div>
        <Link
          to="/users/new"
          className="inline-flex min-h-10 items-center rounded-xl bg-[#1f4d42] px-3 text-sm font-semibold text-white sm:min-h-11 sm:rounded-2xl sm:px-4"
        >
          New user
        </Link>
      </header>

      <form className="mt-4 flex flex-wrap gap-2 lg:mt-5" onSubmit={applySearch}>
        <input
          type="search"
          placeholder="Search by name, username, or mobile…"
          className="min-h-10 w-full min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 sm:min-h-11 sm:w-auto"
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
        />
        <button
          type="submit"
          className="min-h-10 rounded-xl bg-[#1f4d42] px-4 text-sm font-semibold text-white sm:min-h-11"
        >
          Search
        </button>
        {search ? (
          <button
            type="button"
            className="min-h-10 rounded-xl px-3 text-sm font-semibold text-stone-600 ring-1 ring-stone-200 sm:min-h-11"
            onClick={() => {
              setDraftSearch("");
              setSearch("");
              setPage(1);
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {users.isPending ? <p className="mt-4 text-stone-600">Loading users…</p> : null}
      {users.isError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-red-800">
          Could not load users
        </p>
      ) : null}
      {users.data && users.data.items.length === 0 ? (
        <p className="mt-4 text-stone-600">No users found.</p>
      ) : null}

      {users.data && users.data.items.length > 0 ? (
        <ul className="mt-4 space-y-2 lg:mt-6">
          {users.data.items.map((u) => (
            <UserRow key={u.username} user={u} />
          ))}
        </ul>
      ) : null}

      {users.data ? (
        <Pager
          page={users.data.page}
          total={users.data.total}
          page_size={users.data.page_size}
          onPage={(p) => setPage(p)}
        />
      ) : null}
    </main>
  );
}
