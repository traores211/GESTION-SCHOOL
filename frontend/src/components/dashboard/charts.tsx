"use client";

import { ReactNode, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartFrame } from "./chart-context";

/** Chart colors, read from the CSS design tokens so globals.css stays the single source of truth. */
const TOKEN_FALLBACKS = {
  "--chart-1": "#f77f00",
  "--chart-1-soft": "#f7c58c",
  "--chart-grid": "#ecebe6",
  "--chart-axis": "#c6b9a4",
  "--chart-label": "#6b645a",
  "--chart-reference": "#8f8476",
  "--surface": "#ffffff",
  "--neutral-bar": "#c9bdab",
  "--series-1": "#d46a00",
  "--series-2": "#2f62b5",
  "--series-3": "#00875a",
  "--ramp-1": "#f3c08a",
  "--ramp-2": "#e0822a",
  "--ramp-3": "#a85400",
  "--status-good": "#00875a",
  "--status-warning": "#d39a2a",
  "--status-info": "#8a9bb5",
  "--status-critical": "#b8322a",
  "--text": "#1f1d1a",
};
type TokenName = keyof typeof TOKEN_FALLBACKS;

/** Resolves the chart tokens, and resolves them again when the theme switches (toggle or OS setting). */
export function useChartColors() {
  const [colors, setColors] = useState<Record<TokenName, string>>(TOKEN_FALLBACKS);
  useEffect(() => {
    const read = () => {
      const styles = getComputedStyle(document.documentElement);
      const resolved = { ...TOKEN_FALLBACKS };
      (Object.keys(TOKEN_FALLBACKS) as TokenName[]).forEach((name) => {
        const value = styles.getPropertyValue(name).trim();
        if (value) resolved[name] = value;
      });
      setColors(resolved);
    };
    read();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    window.addEventListener("themechange", read);
    return () => {
      media.removeEventListener("change", read);
      window.removeEventListener("themechange", read);
    };
  }, []);
  return colors;
}

/** Charts draw themselves on arrival, unless the user asked the system for less motion. */
export function useMotionOK() {
  // Charts are client-only (dynamic, ssr: false), so the preference can be read on the first render.
  const [ok, setOk] = useState(() => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOk(!media.matches);
    const onChange = () => setOk(!media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return ok;
}

const AXIS_TICK = { fontSize: 12, fontVariantNumeric: "tabular-nums" };

export function ChartTooltip({
  active,
  payload,
  title,
  rows,
}: TooltipProps<number, string> & {
  title: (datum: any) => ReactNode;
  rows: (datum: any) => { label: string; value: ReactNode }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title(datum)}</div>
      {rows(datum).map((row) => (
        <div className="chart-tooltip-row" key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Single-series line over time, with an optional dashed threshold. */
export function TrendLine<T extends Record<string, any>>({
  data,
  xKey,
  yKey,
  xFormat,
  yFormat,
  yDomain,
  yTicks,
  threshold,
  thresholdLabel,
  tooltipTitle,
  tooltipRows,
  height = 260,
}: {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  xFormat: (v: any) => string;
  yFormat: (v: number) => string;
  yDomain?: [number, number];
  yTicks?: number[];
  threshold?: number;
  thresholdLabel?: string;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={xFormat}
          tick={{ ...AXIS_TICK, fill: c["--chart-label"] }}
          axisLine={{ stroke: c["--chart-axis"] }}
          tickLine={false}
          minTickGap={16}
        />
        <YAxis
          domain={yDomain}
          ticks={yTicks}
          tickFormatter={yFormat}
          tick={{ ...AXIS_TICK, fill: c["--chart-label"] }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        {threshold !== undefined && (
          <ReferenceLine
            y={threshold}
            stroke={c["--chart-reference"]}
            strokeDasharray="4 4"
            label={{ value: thresholdLabel, position: "insideBottomRight", fill: c["--chart-label"], fontSize: 11 }}
          />
        )}
        <Tooltip
          cursor={{ stroke: c["--chart-axis"], strokeWidth: 1 }}
          content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />}
        />
        <Line
          type="linear"
          dataKey={yKey}
          stroke={c["--chart-1"]}
          strokeWidth={2}
          dot={data.length <= 31 ? { r: 4, fill: c["--chart-1"], stroke: c["--surface"], strokeWidth: 2 } : false}
          activeDot={{ r: 6, fill: c["--chart-1"], stroke: c["--surface"], strokeWidth: 2 }}
          connectNulls
          isAnimationActive={motion} animationDuration={700} animationEasing="ease-out"
        />
      </LineChart>
    </ChartFrame>
  );
}

/** Vertical bars over time; `highlightIndex` gets the full brand color, other bars the soft step. */
export function ColumnChart<T extends Record<string, any>>({
  data,
  xKey,
  yKey,
  xFormat,
  yFormat,
  highlightIndex,
  tooltipTitle,
  tooltipRows,
  height = 260,
}: {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  xFormat: (v: any) => string;
  yFormat: (v: number) => string;
  highlightIndex?: number;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={xFormat}
          tick={{ ...AXIS_TICK, fill: c["--chart-label"] }}
          axisLine={{ stroke: c["--chart-axis"] }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={yFormat}
          tick={{ ...AXIS_TICK, fill: c["--chart-label"] }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip cursor={{ fill: c["--chart-grid"], opacity: 0.6 }} content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />} />
        <Bar dataKey={yKey} radius={[2, 2, 0, 0]} maxBarSize={48} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out">
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={highlightIndex === undefined || i === highlightIndex ? c["--chart-1"] : c["--chart-1-soft"]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/**
 * Horizontal ranking bars (one series). Values are direct-labeled at the bar end.
 * `muted(d)` greys out a bar that should not compete (e.g. rejected applications).
 */
export function RankBars<T extends Record<string, any>>({
  data,
  labelKey,
  valueKey,
  valueFormat,
  domain,
  reference,
  referenceLabel,
  muted,
  tooltipTitle,
  tooltipRows,
  rowHeight = 34,
  labelWidth = 128,
  integer = false,
}: {
  data: T[];
  labelKey: keyof T & string;
  valueKey: keyof T & string;
  valueFormat: (v: number) => string;
  domain?: [number, number | "auto"];
  reference?: number;
  referenceLabel?: string;
  muted?: (d: T) => boolean;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  rowHeight?: number;
  labelWidth?: number;
  integer?: boolean;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  const top = reference !== undefined ? 20 : 4;
  const height = Math.max(data.length * rowHeight + 36 + top, 120);
  return (
    <ChartFrame height={height}>
      <BarChart data={data} layout="vertical" margin={{ top, right: 56, bottom: 4, left: 0 }} barCategoryGap="30%">
        <CartesianGrid stroke={c["--chart-grid"]} horizontal={false} />
        <XAxis
          type="number"
          domain={domain as any}
          allowDecimals={!integer}
          tickFormatter={valueFormat}
          tick={{ ...AXIS_TICK, fill: c["--chart-label"] }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={labelWidth}
          tick={{ ...AXIS_TICK, fill: c["--chart-label"] }}
          axisLine={{ stroke: c["--chart-axis"] }}
          tickLine={false}
        />
        {reference !== undefined && (
          <ReferenceLine
            x={reference}
            stroke={c["--chart-reference"]}
            strokeDasharray="4 4"
            label={{ value: referenceLabel, position: "top", fill: c["--chart-label"], fontSize: 11 }}
          />
        )}
        <Tooltip cursor={{ fill: c["--chart-grid"], opacity: 0.6 }} content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />} />
        <Bar dataKey={valueKey} radius={[0, 2, 2, 0]} maxBarSize={22} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out">
          {data.map((d, i) => (
            <Cell key={i} fill={muted?.(d) ? c["--neutral-bar"] : c["--chart-1"]} />
          ))}
          <LabelList
            dataKey={valueKey}
            position="right"
            formatter={(v: number) => valueFormat(v)}
            style={{ fontSize: 12, fill: "var(--text-secondary)", fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

// ======================================================================== detailed dashboard charts

export interface SeriesDef {
  key: string;
  label: string;
  /** A chart token name ("--series-1"…) resolved for the current theme. */
  token: TokenName;
}

/** HTML legend under a chart: swatch + label, text in ink (never in the series colour). */
export function ChartLegend({ items }: { items: { label: string; color: string; value?: ReactNode }[] }) {
  return (
    <div className="legend" role="list">
      {items.map((item) => (
        <span key={item.label} className="legend-item" role="listitem">
          <span className="legend-swatch" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
          {item.value !== undefined && <strong className="legend-value">{item.value}</strong>}
        </span>
      ))}
    </div>
  );
}

/** Stacked area of shares over time (each day sums to 100 %). */
export function StackedShareArea<T extends Record<string, any>>({
  data,
  xKey,
  series,
  xFormat,
  tooltipTitle,
  tooltipRows,
  height = 240,
}: {
  data: T[];
  xKey: keyof T & string;
  series: SeriesDef[];
  xFormat: (v: any) => string;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  return (
    <>
      <ChartFrame height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} stackOffset="expand">
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={{ stroke: c["--chart-axis"] }} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)} %`} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} width={48} />
          <Tooltip cursor={{ stroke: c["--chart-axis"] }} content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stackId="1"
              stroke={c["--surface"]}
              strokeWidth={1}
              fill={c[s.token]}
              fillOpacity={1}
              isAnimationActive={motion} animationDuration={700} animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ChartFrame>
      <ChartLegend items={series.map((s) => ({ label: s.label, color: c[s.token] }))} />
    </>
  );
}

/** Part-to-whole ring for at most 6 segments, with the total in the centre and a legend carrying the values. */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  valueFormat,
  height = 210,
}: {
  data: { label: string; value: number; token: TokenName }[];
  centerValue: ReactNode;
  centerLabel: string;
  valueFormat: (v: number) => string;
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="donut">
      <div className="donut-plot" style={{ height }}>
        <ChartFrame height={height}>
          <PieChart>
            <Pie
              rootTabIndex={-1}
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke={c["--surface"]}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={motion} animationDuration={700} animationEasing="ease-out"
            >
              {data.map((d) => (
                <Cell key={d.label} fill={c[d.token]} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  title={(d) => d.label}
                  rows={(d) => [
                    { label: "Montant", value: valueFormat(d.value) },
                    { label: "Part", value: `${total ? Math.round((d.value / total) * 1000) / 10 : 0} %`.replace(".", ",") },
                  ]}
                />
              }
            />
          </PieChart>
        </ChartFrame>
        <div className="donut-center" aria-hidden="true">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ChartLegend
        items={data.map((d) => ({
          label: d.label,
          color: c[d.token],
          value: `${total ? Math.round((d.value / total) * 100) : 0} %`,
        }))}
      />
    </div>
  );
}

/** Grouped (or stacked) vertical bars for a few series sharing one axis and one unit. */
export function MultiBars<T extends Record<string, any>>({
  data,
  xKey,
  series,
  xFormat,
  yFormat,
  yDomain,
  reference,
  referenceLabel,
  stacked = false,
  tooltipTitle,
  tooltipRows,
  height = 250,
}: {
  data: T[];
  xKey: keyof T & string;
  series: SeriesDef[];
  xFormat: (v: any) => string;
  yFormat: (v: number) => string;
  yDomain?: [number, number];
  reference?: number;
  referenceLabel?: string;
  stacked?: boolean;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  return (
    <>
      <ChartFrame height={height}>
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }} barCategoryGap="22%" barGap={2}>
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={{ stroke: c["--chart-axis"] }} tickLine={false} interval={data.length > 9 ? 1 : 0} />
          <YAxis domain={yDomain} tickFormatter={yFormat} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} width={52} />
          {reference !== undefined && (
            <ReferenceLine y={reference} stroke={c["--chart-reference"]} strokeDasharray="4 4" label={{ value: referenceLabel, position: "insideTopRight", fill: c["--chart-label"], fontSize: 11 }} />
          )}
          <Tooltip cursor={{ fill: c["--chart-grid"], opacity: 0.6 }} content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId={stacked ? "1" : undefined}
              fill={c[s.token]}
              stroke={stacked ? c["--surface"] : undefined}
              strokeWidth={stacked ? 2 : 0}
              radius={stacked ? (i === series.length - 1 ? [2, 2, 0, 0] : 0) : [2, 2, 0, 0]}
              maxBarSize={stacked ? 40 : 22}
              isAnimationActive={motion} animationDuration={700} animationEasing="ease-out"
            />
          ))}
        </BarChart>
      </ChartFrame>
      <ChartLegend items={series.map((s) => ({ label: s.label, color: c[s.token] }))} />
    </>
  );
}

/** Horizontal stacked bars (part-to-whole per category), long labels on the left. */
export function StackedBarsH<T extends Record<string, any>>({
  data,
  labelKey,
  series,
  valueFormat,
  tooltipTitle,
  tooltipRows,
  rowHeight = 26,
  labelWidth = 76,
}: {
  data: T[];
  labelKey: keyof T & string;
  series: SeriesDef[];
  valueFormat: (v: number) => string;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  rowHeight?: number;
  labelWidth?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  const height = Math.max(data.length * rowHeight + 36, 120);
  return (
    <>
      <ChartFrame height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap="24%">
          <CartesianGrid stroke={c["--chart-grid"]} horizontal={false} />
          <XAxis type="number" tickFormatter={valueFormat} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey={labelKey} width={labelWidth} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={{ stroke: c["--chart-axis"] }} tickLine={false} />
          <Tooltip cursor={{ fill: c["--chart-grid"], opacity: 0.6 }} content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="1"
              fill={c[s.token]}
              stroke={c["--surface"]}
              strokeWidth={2}
              radius={i === series.length - 1 ? [0, 2, 2, 0] : 0}
              isAnimationActive={motion} animationDuration={700} animationEasing="ease-out"
            >
              {i === series.length - 1 && (
                <LabelList dataKey="total" position="right" formatter={(v: number) => valueFormat(v)} style={{ fontSize: 12, fill: "var(--text-secondary)", fontWeight: 600 }} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ChartFrame>
      <ChartLegend items={series.map((s) => ({ label: s.label, color: c[s.token] }))} />
    </>
  );
}

/** Distribution of averages in one-point bins; bins under the pass mark recede, the rest carry the accent. */
export function Histogram({
  bins,
  threshold,
  median,
  height = 230,
}: {
  bins: { from: number; to: number; count: number }[];
  threshold: number;
  median: number | null;
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  const data = bins.map((b) => ({ ...b, label: `${b.from}` }));
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={{ stroke: c["--chart-axis"] }} tickLine={false} interval={1} />
        <YAxis allowDecimals={false} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} width={36} />
        <ReferenceLine x={`${threshold}`} stroke={c["--chart-reference"]} strokeDasharray="4 4" label={{ value: `${threshold}/20`, position: "top", fill: c["--chart-label"], fontSize: 11 }} />
        {median !== null && (
          <ReferenceLine x={`${Math.floor(median)}`} stroke={c["--text"]} strokeWidth={1.5} />
        )}
        <Tooltip
          cursor={{ fill: c["--chart-grid"], opacity: 0.6 }}
          content={
            <ChartTooltip
              title={(d) => `Moyenne de ${d.from} à ${d.to}`}
              rows={(d) => [{ label: "Élèves", value: d.count }]}
            />
          }
        />
        <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out">
          {data.map((d) => (
            <Cell key={d.from} fill={d.from < threshold ? c["--neutral-bar"] : c["--series-1"]} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Short subject names for tight axes (the tooltip keeps the full name). */
const shortSubject = (name: string) =>
  ({ "Histoire-Géographie": "Hist.-Géo.", "Physique-Chimie": "Phys.-Chimie", "Mathématiques": "Maths", "Mathématiques appliquées": "Maths appl.", "Expression écrite": "Expression", "Éducation civique": "Civisme", "Anglais technique": "Anglais tech." } as Record<string, string>)[name] ?? name;

/** Subject profile on a 0-20 radar, with the pass mark drawn as a ring. */
export function SubjectRadar({ data, height = 280 }: { data: { subject: string; average: number; belowTen: number }[]; height?: number }) {
  const c = useChartColors();
  const motion = useMotionOK();
  const withRef = data.map((d) => ({ ...d, pass: 10 }));
  return (
    <ChartFrame height={height}>
      <RadarChart data={withRef} outerRadius="66%" margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
        <PolarGrid stroke={c["--chart-grid"]} />
        <PolarAngleAxis dataKey="subject" tickFormatter={shortSubject} tick={{ fontSize: 11, fill: c["--chart-label"] }} />
        <PolarRadiusAxis domain={[0, 20]} tickCount={5} angle={72} tick={{ fontSize: 10, fill: c["--chart-label"] }} axisLine={false} />
        <Radar dataKey="pass" stroke={c["--chart-reference"]} strokeDasharray="4 4" fill="none" isAnimationActive={motion} animationDuration={700} animationEasing="ease-out" />
        <Radar dataKey="average" stroke={c["--series-1"]} strokeWidth={2} fill={c["--series-1"]} fillOpacity={0.18} dot={{ r: 3, fill: c["--series-1"] }} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out" />
        <Tooltip
          content={
            <ChartTooltip
              title={(d) => d.subject}
              rows={(d) => [
                { label: "Moyenne", value: `${String(d.average).replace(".", ",")} / 20` },
                { label: "Élèves sous 10", value: `${String(d.belowTen).replace(".", ",")} %` },
              ]}
            />
          }
        />
      </RadarChart>
    </ChartFrame>
  );
}

/** Attendance (x) against general average (y); the bottom-left quadrant is the risk zone. */
export function RiskScatter({
  points,
  thresholds,
  height = 300,
}: {
  points: { name: string; className: string; average: number; attendance: number; absences: number }[];
  thresholds: { average: number; attendance: number };
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  const minX = Math.max(0, Math.floor(Math.min(...points.map((p) => p.attendance), thresholds.attendance) / 5) * 5 - 5);
  const atRisk = points.filter((p) => p.average < thresholds.average && p.attendance < thresholds.attendance);
  const others = points.filter((p) => !(p.average < thresholds.average && p.attendance < thresholds.attendance));
  const tooltip = (
    <ChartTooltip
      title={(d) => d.name}
      rows={(d) => [
        { label: "Classe", value: d.className },
        { label: "Moyenne", value: `${String(d.average).replace(".", ",")} / 20` },
        { label: "Présence", value: `${String(d.attendance).replace(".", ",")} %` },
        { label: "Absences", value: d.absences },
      ]}
    />
  );
  return (
    <>
      <ChartFrame height={height}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={c["--chart-grid"]} />
          <XAxis type="number" dataKey="attendance" name="Présence" domain={[minX, 100]} ticks={Array.from({ length: (100 - minX) / 5 + 1 }, (_, i) => minX + i * 5)} tickFormatter={(v) => `${v} %`} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={{ stroke: c["--chart-axis"] }} tickLine={false} />
          <YAxis type="number" dataKey="average" name="Moyenne" domain={[0, 20]} ticks={[0, 5, 10, 15, 20]} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} width={36} />
          <ZAxis range={[36, 36]} />
          <ReferenceArea x1={minX} x2={thresholds.attendance} y1={0} y2={thresholds.average} fill={c["--status-critical"]} fillOpacity={0.07} stroke="none" />
          <ReferenceLine x={thresholds.attendance} stroke={c["--chart-reference"]} strokeDasharray="4 4" />
          <ReferenceLine y={thresholds.average} stroke={c["--chart-reference"]} strokeDasharray="4 4" />
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: c["--chart-axis"] }} content={tooltip} />
          <Scatter data={others} fill={c["--series-2"]} fillOpacity={0.45} stroke={c["--surface"]} strokeWidth={1} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out" />
          <Scatter data={atRisk} fill={c["--status-critical"]} stroke={c["--surface"]} strokeWidth={1.5} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out" />
        </ScatterChart>
      </ChartFrame>
      <ChartLegend
        items={[
          { label: "Élèves", color: c["--series-2"] },
          { label: `À risque (moyenne < ${thresholds.average} et présence < ${thresholds.attendance} %)`, color: c["--status-critical"], value: atRisk.length },
        ]}
      />
    </>
  );
}

/** Area of a single series over months (payroll). */
export function AreaTrend<T extends Record<string, any>>({
  data,
  xKey,
  yKey,
  xFormat,
  yFormat,
  tooltipTitle,
  tooltipRows,
  height = 220,
}: {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  xFormat: (v: any) => string;
  yFormat: (v: number) => string;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  height?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
        <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={{ stroke: c["--chart-axis"] }} tickLine={false} />
        <YAxis tickFormatter={yFormat} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} width={52} />
        <Tooltip cursor={{ stroke: c["--chart-axis"] }} content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />} />
        <Area type="monotone" dataKey={yKey} stroke={c["--series-2"]} strokeWidth={2} fill={c["--series-2"]} fillOpacity={0.12} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out" dot={{ r: 3, fill: c["--series-2"], stroke: c["--surface"], strokeWidth: 2 }} />
      </AreaChart>
    </ChartFrame>
  );
}
/** Change from a baseline per category: gains to the right in one hue, losses to the left in the other, zero in grey. */
export function DivergingBars<T extends Record<string, any>>({
  data,
  labelKey,
  valueKey,
  valueFormat,
  tooltipTitle,
  tooltipRows,
  rowHeight = 30,
  labelWidth = 84,
}: {
  data: T[];
  labelKey: keyof T & string;
  valueKey: keyof T & string;
  valueFormat: (v: number) => string;
  tooltipTitle: (d: T) => ReactNode;
  tooltipRows: (d: T) => { label: string; value: ReactNode }[];
  rowHeight?: number;
  labelWidth?: number;
}) {
  const c = useChartColors();
  const motion = useMotionOK();
  const extent = Math.max(0.5, ...data.map((d) => Math.abs(Number(d[valueKey]) || 0)));
  const bound = Math.ceil(extent * 2) / 2;
  const height = Math.max(data.length * rowHeight + 36, 120);
  return (
    <>
      <ChartFrame height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={c["--chart-grid"]} horizontal={false} />
          <XAxis type="number" domain={[-bound, bound]} tickFormatter={valueFormat} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={labelKey} width={labelWidth} tick={{ ...AXIS_TICK, fill: c["--chart-label"] }} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke={c["--chart-reference"]} />
          <Tooltip cursor={{ fill: c["--chart-grid"], opacity: 0.6 }} content={<ChartTooltip title={tooltipTitle} rows={tooltipRows} />} />
          <Bar dataKey={valueKey} radius={2} maxBarSize={18} isAnimationActive={motion} animationDuration={700} animationEasing="ease-out">
            {data.map((d, i) => {
              const v = Number(d[valueKey]) || 0;
              return <Cell key={i} fill={v > 0 ? c["--series-2"] : v < 0 ? c["--series-1"] : c["--neutral-bar"]} />;
            })}
            <LabelList dataKey={valueKey} position="right" formatter={(v: number) => valueFormat(v)} style={{ fontSize: 12, fill: "var(--text-secondary)", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ChartFrame>
      <ChartLegend items={[{ label: "Progression", color: c["--series-2"] }, { label: "Recul", color: c["--series-1"] }]} />
    </>
  );
}