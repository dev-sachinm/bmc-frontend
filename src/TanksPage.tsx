import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { tablePageSize } from "./config";
import { Pager } from "./Pager";
import { fetchTanks, type TankSummary } from "./tanks";

export const TANKS_POLL_MS = 5000;

function readingLabel(reading: TankSummary["latest_reading"]): string {
  if (!reading) {
    return "";
  }
  return `${reading.temperature_celsius}°C`;
}

function TankRow({ tank }: { tank: TankSummary }) {
  const reading = tank.latest_reading;
  const capacity = tank.formula.rated_capacity_liters;
  const fill =
    reading && capacity > 0
      ? Math.min(100, Math.max(0, (reading.volume_liters / capacity) * 100))
      : 0;
  const label = tank.tank_name?.trim() || tank.tank_id;
  const detailPath = `/tanks/${encodeURIComponent(tank.tank_id)}`;

  return (
    <article className="rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <h2 className="font-display truncate text-lg text-stone-900 sm:text-xl">
            <Link to={detailPath} className="hover:text-[#1f4d42]">
              {label}
            </Link>
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-400">
            <span className="font-mono">{tank.tank_id}</span>
            <span>Capacity {capacity} L</span>
            {tank.created_by ? <span>By {tank.created_by}</span> : null}
          </div>
        </div>

        {/* Live readings */}
        <div className="flex shrink-0 flex-row items-baseline justify-between gap-3 sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
          <p className="font-display text-2xl tabular-nums text-teal-900 sm:text-3xl">
            {reading ? readingLabel(reading) : "—"}
          </p>
          {reading ? (
            <p className="text-sm tabular-nums text-stone-600">{reading.volume_liters} L</p>
          ) : (
            <p className="text-xs text-stone-400">No reading yet</p>
          )}
        </div>

        <Link
          to={detailPath}
          aria-label={`Open ${tank.tank_id}`}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[#1f4d42] px-3 text-sm font-semibold text-white sm:w-auto"
        >
          Open
        </Link>
      </div>

      {/* Fill bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
        <div
          className="h-full rounded-full bg-teal-600 transition-[width] duration-500"
          style={{ width: `${fill}%` }}
        />
      </div>
    </article>
  );
}

export function TanksPage() {
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [page, setPage] = useState(1);

  const tanks = useQuery({
    queryKey: ["tanks", search, page],
    queryFn: () => fetchTanks(search, page, tablePageSize),
    refetchInterval: page === 1 && !search ? TANKS_POLL_MS : false,
    refetchOnWindowFocus: false,
  });

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(draftSearch);
    setPage(1);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#1f4d42] lg:text-sm">Live floor</p>
          <h1 className="font-display text-xl leading-6 text-stone-950 lg:text-4xl">Tanks</h1>
        </div>
        <Link
          to="/tanks/new"
          className="inline-flex min-h-10 items-center rounded-xl bg-[#1f4d42] px-3 text-sm font-semibold text-white sm:min-h-11 sm:rounded-2xl sm:px-4"
        >
          New tank
        </Link>
      </header>

      <form className="mt-4 flex flex-wrap gap-2 lg:mt-5" onSubmit={applySearch}>
        <input
          type="search"
          placeholder="Search by tank id or name…"
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

      {tanks.isPending ? <p className="mt-4 text-stone-600">Loading tanks…</p> : null}
      {tanks.isError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-red-800">
          Could not load tanks
        </p>
      ) : null}
      {tanks.data && tanks.data.items.length === 0 ? (
        <p className="mt-4 text-stone-600">No tanks found.</p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 lg:mt-6">
        {tanks.data?.items.map((tank) => (
          <TankRow key={tank.tank_id} tank={tank} />
        ))}
      </div>

      {tanks.data ? (
        <Pager
          page={tanks.data.page}
          total={tanks.data.total}
          page_size={tanks.data.page_size}
          onPage={(p) => setPage(p)}
        />
      ) : null}
    </main>
  );
}
