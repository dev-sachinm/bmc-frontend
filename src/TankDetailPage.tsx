import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "./api";
import { ContentBack } from "./ContentBack";
import { AssignmentEditor } from "./AssignmentEditor";
import { HistoryChart } from "./HistoryChart";
import { currentUsername } from "./session";
import { deleteTank, fetchReadings, fetchTank } from "./tanks";

const HOUR_MS = 60 * 60 * 1000;

type AppliedRange = { hours: number } | { from: string; to: string };

function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROLE_LABEL: Record<string, string> = {
  monitor: "Monitor",
  configure: "Configure",
  manage: "Manage",
};

export function TankDetailPage() {
  const { tankId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [applied, setApplied] = useState<AppliedRange>({ hours: 1 });
  const [draftFrom, setDraftFrom] = useState(() => localInputValue(new Date(Date.now() - HOUR_MS)));
  const [draftTo, setDraftTo] = useState(() => localInputValue(new Date()));
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const me = currentUsername();
  const isAdmin = me === "systemadmin";

  const tank = useQuery({
    queryKey: ["tank", tankId],
    queryFn: () => fetchTank(tankId),
  });

  const history = useQuery({
    queryKey: ["readings", tankId, applied],
    queryFn: () => {
      if ("hours" in applied) {
        if (applied.hours === 1) {
          return fetchReadings(tankId);
        }
        const to = new Date();
        const from = new Date(to.getTime() - applied.hours * HOUR_MS);
        return fetchReadings(tankId, { from: from.toISOString(), to: to.toISOString() });
      }
      return fetchReadings(tankId, applied);
    },
    refetchInterval: "hours" in applied ? 5000 : false,
  });

  const remove = useMutation({
    mutationFn: () => deleteTank(tankId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tanks"] });
      navigate("/");
    },
  });

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fromDate = new Date(draftFrom);
    const toDate = new Date(draftTo);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setRangeError("Choose both a start and an end.");
      return;
    }
    if (fromDate.getTime() > toDate.getTime()) {
      setRangeError("The start must be earlier than or equal to the end.");
      return;
    }
    setRangeError(null);
    setApplied({ from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const tankData = tank.data;
  const formula = tankData?.formula;
  const name = tankData?.tank_name ?? history.data?.tank_name ?? tankId;
  const latest = history.data?.readings.at(-1);

  const createdBy = tankData?.created_by ?? null;
  const canManage = isAdmin || (me !== null && createdBy === me);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <ContentBack />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#1f4d42]">
            <Link to="/" className="underline-offset-4 hover:underline">
              Tanks
            </Link>
          </p>
          <h1 className="font-display truncate text-2xl text-stone-950 sm:text-4xl">{name}</h1>
          <p className="truncate font-mono text-xs text-stone-500 tabular-nums sm:mt-2 sm:text-sm">
            {tankId}
          </p>
          {createdBy ? (
            <p className="mt-1 text-xs text-stone-400">Created by {createdBy}</p>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-1">
            <Link
              to={`/tanks/${encodeURIComponent(tankId)}/edit`}
              className="inline-flex min-h-10 items-center rounded-xl bg-[#1f4d42] px-3 text-xs font-semibold text-white sm:min-h-11 sm:rounded-2xl sm:px-4 sm:text-sm"
            >
              Update tank
            </Link>
            <button
              type="button"
              className="min-h-10 rounded-xl px-2 text-xs font-semibold text-red-800 sm:min-h-11 sm:px-4 sm:text-sm"
              onClick={() => setConfirmDelete(true)}
            >
              Delete tank
            </button>
          </div>
        ) : null}
      </div>

      {tank.isPending ? (
        <p className="mt-4 text-sm text-stone-600">Loading tank…</p>
      ) : null}
      {tank.isError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {tank.error instanceof ApiError ? tank.error.message : "Could not load tank"}
        </p>
      ) : null}

      {formula ? (
        <dl className="mt-2 grid shrink-0 grid-cols-2 gap-1.5 sm:mt-6 sm:gap-3 lg:grid-cols-4">
          {[
            ["Model", formula.model_code],
            ["Capacity", `${formula.rated_capacity_liters} L`],
            ["Shape", formula.shape.replaceAll("_", " ")],
            [
              "Inner size",
              `${formula.inner_length_cm} × ${formula.inner_width_cm} × ${formula.inner_height_cm} cm`,
            ],
            ["Empty distance", `${formula.empty_distance_cm} cm`],
            ["Expression", formula.expression],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-xl bg-white px-2 py-1.5 ring-1 ring-stone-200 sm:rounded-2xl sm:px-4 sm:py-3"
            >
              <dt className="text-[0.65rem] font-semibold tracking-wide text-stone-500 uppercase">
                {label}
              </dt>
              <dd
                className={`truncate text-xs text-stone-900 sm:text-sm ${
                  label === "Model" || label === "Expression" ? "font-mono" : "font-medium"
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section className="mt-8">
        <div className="flex shrink-0 items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-stone-900 sm:text-2xl">History</h2>
            <p className="truncate text-xs text-stone-600 sm:mt-1 sm:text-sm">
              {history.data
                ? `${formatStamp(history.data.from)} – ${formatStamp(history.data.to)}`
                : "Last hour"}
            </p>
          </div>
          {latest ? (
            <p className="shrink-0 text-xs text-stone-700 sm:text-sm">
              {latest.temperature_celsius}°C · {latest.volume_liters} L
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            [1, "Last hour"],
            [6, "Last 6 hours"],
            [24, "Last 24 hours"],
          ].map(([hours, label]) => {
            const selected = "hours" in applied && applied.hours === hours;
            return (
              <button
                key={hours}
                type="button"
                aria-pressed={selected}
                className={`min-h-9 flex-1 rounded-full px-2 text-xs font-semibold sm:min-h-11 sm:flex-none sm:px-4 sm:text-sm ${
                  selected ? "bg-[#1f4d42] text-white" : "bg-white text-stone-800 ring-1 ring-stone-200"
                }`}
                onClick={() => {
                  setRangeError(null);
                  setApplied({ hours: Number(hours) });
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <form
          className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end"
          onSubmit={applyCustom}
        >
          <label className="flex min-w-0 flex-col gap-1 text-[0.65rem] font-semibold tracking-wide text-stone-600 uppercase">
            From
            <input
              className="min-h-9 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-900 normal-case sm:min-h-11 sm:rounded-xl sm:px-3 sm:text-sm"
              type="datetime-local"
              value={draftFrom}
              onChange={(event) => setDraftFrom(event.target.value)}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[0.65rem] font-semibold tracking-wide text-stone-600 uppercase">
            To
            <input
              className="min-h-9 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-900 normal-case sm:min-h-11 sm:rounded-xl sm:px-3 sm:text-sm"
              type="datetime-local"
              value={draftTo}
              onChange={(event) => setDraftTo(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="min-h-9 rounded-lg bg-white px-3 text-xs font-semibold text-[#1f4d42] ring-1 ring-stone-300 sm:min-h-11 sm:rounded-xl sm:px-4 sm:text-sm"
          >
            Apply range
          </button>
        </form>
        {rangeError ? (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {rangeError}
          </p>
        ) : null}
        {history.isPending ? (
          <p className="mt-3 text-sm text-stone-600">Loading readings…</p>
        ) : null}
        {history.isError ? (
          <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {history.error instanceof ApiError
              ? history.error.message
              : "Could not load readings"}
          </p>
        ) : null}
        {history.data ? (
          <div className="mt-2 min-h-0 sm:mt-5">
            <HistoryChart readings={history.data.readings} />
          </div>
        ) : null}
      </section>

      {/* systemadmin assignment editor */}
      {isAdmin && tankData ? (
        <AssignmentEditor
          tankId={tankId}
          initial={tankData.assigned_users ?? []}
          createdBy={tankData.created_by ?? null}
        />
      ) : null}

      {/* For non-admin users with assignments, show a read-only list */}
      {!isAdmin && tankData && Array.isArray(tankData.assigned_users) && tankData.assigned_users.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-xl text-stone-900">Assigned users</h2>
          <ul className="mt-3 space-y-2">
            {tankData.assigned_users.map((u) => (
              <li
                key={u.username}
                className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="font-mono text-xs text-stone-500">{u.username}</p>
                </div>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                  {ROLE_LABEL[u.role] ?? u.role}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-tank-title"
            className="w-full max-w-md rounded-3xl bg-[#f8f4ec] p-6 shadow-xl"
          >
            <h2 id="delete-tank-title" className="font-display text-2xl text-stone-950">
              Delete {name}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              This removes the stored volume formula. Device mappings and temperature readings stay
              in place.
            </p>
            {remove.isError ? (
              <p role="alert" className="mt-3 text-sm text-red-800">
                {remove.error instanceof ApiError
                  ? remove.error.message
                  : "Could not delete the tank"}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl px-4 text-sm font-semibold text-stone-700"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-red-800 px-4 text-sm font-semibold text-white disabled:opacity-60"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Delete tank
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
