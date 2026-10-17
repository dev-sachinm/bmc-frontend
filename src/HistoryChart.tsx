import type { TankHistoryPoint } from "./tanks";

const width = 760;
const height = 280;
const pad = { left: 72, right: 24, top: 22, bottom: 52 };

type Series = {
  key: "temperature_celsius" | "volume_liters";
  title: string;
  unit: string;
  stroke: string;
  ink: string;
  label: string;
};

const series: Series[] = [
  {
    key: "temperature_celsius",
    title: "Temperature",
    unit: "°C",
    stroke: "#1f6f5b",
    ink: "#1f6f5b",
    label: "Temperature over time",
  },
  {
    key: "volume_liters",
    title: "Volume",
    unit: "L",
    stroke: "#c4a574",
    ink: "#8a6840",
    label: "Volume over time",
  },
];

function domain(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }
  if (min === max) {
    const slack = Math.abs(min) * 0.1 || 1;
    return [min - slack, max + slack];
  }
  const slack = (max - min) * 0.12;
  return [min - slack, max + slack];
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SeriesChart({ readings, spec }: { readings: TankHistoryPoint[]; spec: Series }) {
  const times = readings.map((point) => new Date(point.recorded_at).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = tMax - tMin || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = readings.map((point) => point[spec.key]);
  const [min, max] = domain(values);

  function xAt(index: number): number {
    if (readings.length === 1) {
      return pad.left + innerW / 2;
    }
    return pad.left + ((times[index] - tMin) / span) * innerW;
  }

  function yAt(value: number): number {
    return pad.top + (1 - (value - min) / (max - min)) * innerH;
  }

  const points = readings
    .map((point, index) => `${xAt(index).toFixed(1)},${yAt(point[spec.key]).toFixed(1)}`)
    .join(" ");
  const ticks = [0, 0.5, 1];
  const timeMarks = [0, readings.length - 1];

  return (
    <figure className="flex h-56 min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200 sm:h-64 sm:rounded-3xl sm:p-6">
      <figcaption className="mb-2 flex shrink-0 items-center gap-2 text-sm font-medium sm:mb-3 sm:text-base" style={{ color: spec.ink }}>
        <span className="h-0.5 w-7 rounded-full" style={{ backgroundColor: spec.stroke }} />
        {spec.title}
        <span className="font-normal text-stone-500">{spec.unit}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full min-h-0 w-full flex-1"
        role="img"
        aria-label={spec.label}
      >
        {ticks.map((tick) => {
          const y = pad.top + (1 - tick) * innerH;
          const value = min + tick * (max - min);
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e7e1d6" />
              <text
                x={pad.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="18"
                fontFamily="Source Sans 3, sans-serif"
                style={{ fontVariantNumeric: "tabular-nums" }}
                fill={spec.ink}
              >
                {formatTick(value)}
              </text>
            </g>
          );
        })}
        <polyline
          fill="none"
          stroke={spec.stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {readings.map((point, index) => (
          <circle
            key={`${point.recorded_at}-${index}`}
            cx={xAt(index)}
            cy={yAt(point[spec.key])}
            r={readings.length > 24 ? 0 : 3.5}
            fill={spec.stroke}
          />
        ))}
        {timeMarks.map((index) => (
          <text
            key={readings[index].recorded_at}
            x={xAt(index)}
            y={height - 14}
            textAnchor={index === 0 ? "start" : "end"}
            fontSize="18"
            fontFamily="Source Sans 3, sans-serif"
            style={{ fontVariantNumeric: "tabular-nums" }}
            fill="#78716c"
          >
            {formatClock(readings[index].recorded_at)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

export function HistoryChart({ readings }: { readings: TankHistoryPoint[] }) {
  if (readings.length === 0) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 text-center text-sm text-stone-600 sm:min-h-72 sm:rounded-3xl sm:px-6 sm:text-base">
        No readings in this range.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {series.map((spec) => (
        <SeriesChart key={spec.key} readings={readings} spec={spec} />
      ))}
    </div>
  );
}
