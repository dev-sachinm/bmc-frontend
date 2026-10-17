import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "./api";
import { ContentBack } from "./ContentBack";
import { fetchFormula, fetchModels, saveFormula, type FormulaInput } from "./tanks";

const emptyForm = {
  tank_id: "",
  tank_name: "",
  model_code: "",
  inner_length_cm: "",
  inner_width_cm: "",
  inner_height_cm: "",
  empty_distance_cm: "",
};

type FormState = typeof emptyForm;

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-stone-800 lg:gap-2 lg:text-sm">
      {label}
      <input
        className="min-h-9 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-2 text-sm text-stone-900 read-only:bg-stone-100 lg:min-h-12 lg:rounded-2xl lg:px-3 lg:text-base"
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step={type === "number" ? "any" : undefined}
        min={type === "number" ? "0" : undefined}
        required
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function TankFormPage() {
  const { tankId } = useParams();
  const editing = Boolean(tankId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ ...emptyForm, tank_id: tankId ?? "" });
  const [error, setError] = useState<string | null>(null);

  const models = useQuery({ queryKey: ["bmc-models"], queryFn: fetchModels });
  const existing = useQuery({
    queryKey: ["formula", tankId],
    queryFn: () => fetchFormula(tankId!),
    enabled: editing,
  });

  useEffect(() => {
    if (!existing.data) {
      return;
    }
    const formula = existing.data;
    setForm({
      tank_id: formula.tank_id,
      tank_name: formula.tank_name,
      model_code: formula.model_code,
      inner_length_cm: String(formula.inner_length_cm),
      inner_width_cm: String(formula.inner_width_cm),
      inner_height_cm: String(formula.inner_height_cm),
      empty_distance_cm: String(formula.empty_distance_cm),
    });
  }, [existing.data]);

  useEffect(() => {
    if (editing || form.model_code || !models.data?.length) {
      return;
    }
    setForm((current) => ({ ...current, model_code: models.data[0].code }));
  }, [editing, form.model_code, models.data]);

  const save = useMutation({
    mutationFn: (input: { id: string; body: FormulaInput }) => saveFormula(input.id, input.body),
    onSuccess: async (_formula, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["tanks"] });
      await queryClient.invalidateQueries({ queryKey: ["formula", variables.id] });
      navigate(`/tanks/${encodeURIComponent(variables.id)}`);
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : "Could not save the tank");
    },
  });

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const id = (tankId ?? form.tank_id).trim();
    const body: FormulaInput = {
      tank_name: form.tank_name.trim(),
      model_code: form.model_code.trim(),
      inner_length_cm: Number(form.inner_length_cm),
      inner_width_cm: Number(form.inner_width_cm),
      inner_height_cm: Number(form.inner_height_cm),
      empty_distance_cm: Number(form.empty_distance_cm),
    };
    const dimensions = [
      body.inner_length_cm,
      body.inner_width_cm,
      body.inner_height_cm,
      body.empty_distance_cm,
    ];
    if (!id || !body.tank_name || !body.model_code || dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
      setError("Fill in the tank id, name, model, and dimensions.");
      return;
    }
    save.mutate({ id, body });
  }

  const selected = models.data?.find((model) => model.code === form.model_code);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <ContentBack />
      <p className="text-xs font-medium text-[#1f4d42] lg:text-sm">
        <Link to="/" className="underline-offset-4 hover:underline">
          Tanks
        </Link>
      </p>
      <h1 className="font-display text-2xl text-stone-950 lg:mt-2 lg:text-4xl">
        {editing ? "Update tank" : "New tank"}
      </h1>
      <p className="mt-1 text-xs leading-4 text-stone-600 lg:mt-2 lg:max-w-2xl lg:text-base lg:leading-normal">
        The model sets capacity and the formula. Enter the inner size and the empty-tank sensor
        distance.
      </p>
      {models.isPending || (editing && existing.isPending) ? (
        <p className="mt-8 text-stone-600">Loading tank details…</p>
      ) : null}
      {models.isError || existing.isError ? (
        <p role="alert" className="mt-8 rounded-2xl bg-red-50 px-4 py-3 text-red-800">
          {models.error instanceof ApiError
            ? models.error.message
            : existing.error instanceof ApiError
              ? existing.error.message
              : "Could not load the form"}
        </p>
      ) : null}
      {models.data && (!editing || existing.data) ? (
        <form className="mt-6 grid grid-cols-1 content-start gap-4 sm:grid-cols-2 lg:mt-8 lg:gap-5" onSubmit={onSubmit}>
          <Field
            label="Tank id"
            value={form.tank_id}
            readOnly={editing}
            onChange={(value) => update("tank_id", value)}
          />
          <Field label="Tank name" value={form.tank_name} onChange={(value) => update("tank_name", value)} />
          <label className="col-span-full flex min-w-0 flex-col gap-1 text-xs font-medium text-stone-800 lg:gap-2 lg:text-sm">
            Cooler model
            <select
              className="min-h-9 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-2 text-sm lg:min-h-12 lg:rounded-2xl lg:px-3 lg:text-base"
              required
              value={form.model_code}
              onChange={(event) => update("model_code", event.target.value)}
            >
              {models.data.map((model) => (
                <option key={model.code} value={model.code}>
                  {model.description} · {model.rated_capacity_liters} L
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <p className="col-span-full text-xs text-stone-600 lg:text-sm">
              {selected.shape.replaceAll("_", " ")} · rated {selected.rated_capacity_liters} L
            </p>
          ) : null}
          <Field
            label="Inner length (cm)"
            type="number"
            value={form.inner_length_cm}
            onChange={(value) => update("inner_length_cm", value)}
          />
          <Field
            label="Inner width (cm)"
            type="number"
            value={form.inner_width_cm}
            onChange={(value) => update("inner_width_cm", value)}
          />
          <Field
            label="Inner height (cm)"
            type="number"
            value={form.inner_height_cm}
            onChange={(value) => update("inner_height_cm", value)}
          />
          <Field
            label="Empty distance (cm)"
            type="number"
            value={form.empty_distance_cm}
            onChange={(value) => update("empty_distance_cm", value)}
          />
          {error ? (
            <p role="alert" className="col-span-full rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800 lg:text-sm">
              {error}
            </p>
          ) : null}
          <div className="col-span-full flex flex-wrap gap-2">
            <button
              className="min-h-9 rounded-xl bg-[#1f4d42] px-4 text-sm font-semibold text-white disabled:opacity-60 lg:min-h-12 lg:rounded-2xl lg:px-5 lg:text-base"
              type="submit"
              disabled={save.isPending}
            >
              {editing ? "Save tank" : "Create tank"}
            </button>
            <Link
              to={editing ? `/tanks/${encodeURIComponent(tankId!)}` : "/"}
              className="inline-flex min-h-9 items-center rounded-xl px-3 text-sm font-semibold text-stone-700 lg:min-h-12 lg:rounded-2xl lg:px-4"
            >
              Cancel
            </Link>
          </div>
        </form>
      ) : null}
    </main>
  );
}
