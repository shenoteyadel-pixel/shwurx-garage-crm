"use client"

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Area,
  AreaChart,
  CartesianGrid,
} from "recharts"

const RED = "oklch(0.58 0.22 26)"

export function StageBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.006 285)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "oklch(0.68 0.01 285)", fontSize: 10 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
            stroke="oklch(0.3 0.006 285)"
          />
          <YAxis allowDecimals={false} tick={{ fill: "oklch(0.68 0.01 285)", fontSize: 11 }} stroke="oklch(0.3 0.006 285)" />
          <Tooltip
            cursor={{ fill: "oklch(0.27 0.006 285 / 0.4)" }}
            contentStyle={{
              background: "oklch(0.21 0.006 285)",
              border: "1px solid oklch(0.3 0.006 285)",
              borderRadius: 10,
              color: "#fff",
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RevenueAreaChart({ data }: { data: { label: string; revenue: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RED} stopOpacity={0.5} />
              <stop offset="100%" stopColor={RED} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.006 285)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "oklch(0.68 0.01 285)", fontSize: 11 }} stroke="oklch(0.3 0.006 285)" />
          <YAxis tick={{ fill: "oklch(0.68 0.01 285)", fontSize: 11 }} stroke="oklch(0.3 0.006 285)" />
          <Tooltip
            contentStyle={{
              background: "oklch(0.21 0.006 285)",
              border: "1px solid oklch(0.3 0.006 285)",
              borderRadius: 10,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(v) => [`AED ${Number(v).toLocaleString()}`, "Revenue"]}
          />
          <Area type="monotone" dataKey="revenue" stroke={RED} strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
