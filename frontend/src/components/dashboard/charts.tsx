"use client";

import { ReactNode, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

/** Chart colors, read from the CSS design tokens so globals.css stays the single source of truth. */
const TOKEN_FALLBACKS = {
  "--chart-1": "#00954a",
  "--chart-1-soft": "#9fd5b7",
  "--chart-grid": "#e8ecea",
  "--chart-axis": "#c9d1cd",
  "--chart-label": "#5f6d67",
  "--chart-reference": "#8a9690",
  "--surface": "#ffffff",
  "--neutral-bar": "#b8c2bd",
};
type TokenName = keyof typeof TOKEN_FALLBACKS;

export function useChartColors() {
  const [colors, setColors] = useState<Record<TokenName, string>>(TOKEN_FALLBACKS);
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const resolved = { ...TOKEN_FALLBACKS };
    (Object.keys(TOKEN_FALLBACKS) as TokenName[]).forEach((name) => {
      const value = styles.getPropertyValue(name).trim();
      if (value) resolved[name] = value;
    });
    setColors(resolved);
  }, []);
  return colors;
}

const AXIS_TICK = { fontSize: 12 };

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
  return (
    <ResponsiveContainer width="100%" height={height}>
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
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
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
  return (
    <ResponsiveContainer width="100%" height={height}>
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
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={highlightIndex === undefined || i === highlightIndex ? c["--chart-1"] : c["--chart-1-soft"]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
  const top = reference !== undefined ? 20 : 4;
  const height = Math.max(data.length * rowHeight + 36 + top, 120);
  return (
    <ResponsiveContainer width="100%" height={height}>
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
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
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
    </ResponsiveContainer>
  );
}
