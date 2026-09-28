import React, { useMemo } from "react";
import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Task } from "@shared/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  completed: {
    label: "Completed",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

interface CompletedTrendChartProps {
  tasks: Task[];
  className?: string;
}

/**
 * "Tasks completed last 14 days" area chart, computed client-side from the
 * tasks already fetched (uses updatedAt for completed tasks).
 */
export function CompletedTrendChart({ tasks, className }: CompletedTrendChartProps) {
  const { data, total } = useMemo(() => {
    const days: { date: string; completed: number }[] = [];
    const now = new Date();
    let sum = 0;

    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      const count = tasks.filter((t) => {
        if (t.status !== "completed" || !t.updatedAt) return false;
        const updated = new Date(t.updatedAt);
        return !isNaN(updated.getTime()) && updated >= dayStart && updated < dayEnd;
      }).length;
      sum += count;
      days.push({ date: format(dayStart, "MMM d"), completed: count });
    }

    return { data: days, total: sum };
  }, [tasks]);

  return (
    <Card
      className={
        "relative overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border " +
        (className || "")
      }
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">Tasks completed</CardTitle>
            <CardDescription>Completions over the last 14 days</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight">{total}</p>
            <p className="text-xs text-muted-foreground">in 14 days</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={30}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--color-completed)", strokeOpacity: 0.25 }}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="completed"
              type="monotone"
              fill="url(#fillCompleted)"
              stroke="var(--color-completed)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export default CompletedTrendChart;
