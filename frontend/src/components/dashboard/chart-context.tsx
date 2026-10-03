"use client";

import { createContext, ReactElement, useContext } from "react";
import { ResponsiveContainer } from "recharts";

/** Title of the card a chart sits in: it becomes the accessible name of the figure. */
export const ChartTitleContext = createContext<string>("");

/**
 * Wraps a chart so assistive technologies meet one named figure instead of hundreds of unnamed
 * shapes (the chart library marks each bar, dot and slice as an image without a name). The figures
 * themselves are given next to the chart (legend, key numbers) or in the tables of the same page.
 */
export function ChartFrame({ height, children }: { height: number; children: ReactElement }) {
  const title = useContext(ChartTitleContext);
  return (
    <div role="img" aria-label={title ? `Graphique : ${title}` : "Graphique"} style={{ width: "100%", height }}>
      <div aria-hidden="true" style={{ width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
