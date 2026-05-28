import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";

interface MetricPoint {
  date: string;
  followers?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  posts?: number;
  revenue?: number;
}

interface AnalyticsChartProps {
  data: MetricPoint[];
  metrics: string[];
  type?: "line" | "bar";
}

const COLORS: Record<string, string> = {
  followers: "#3b82f6",
  views: "#8b5cf6",
  likes: "#ef4444",
  comments: "#f59e0b",
  shares: "#10b981",
  posts: "#06b6d4",
  revenue: "#84cc16",
};

const LABELS: Record<string, string> = {
  followers: "粉丝",
  views: "播放量",
  likes: "点赞",
  comments: "评论",
  shares: "分享",
  posts: "发布数",
  revenue: "收入",
};

export default function AnalyticsChart({
  data,
  metrics,
  type = "line",
}: AnalyticsChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm bg-gray-50 rounded-lg">
        暂无数据，请先添加数据
      </div>
    );
  }

  // Format date for display
  const formattedData = data.map((d) => ({
    ...d,
    date: d.date.slice(5), // Show MM-DD
  }));

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" fontSize={12} tick={{ fill: "#9ca3af" }} />
          <YAxis fontSize={12} tick={{ fill: "#9ca3af" }} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
          />
          <Legend formatter={(value: string) => LABELS[value] || value} />
          {metrics.map((metric) => (
            <Bar key={metric} dataKey={metric} fill={COLORS[metric] || "#6b7280"} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" fontSize={12} tick={{ fill: "#9ca3af" }} />
        <YAxis fontSize={12} tick={{ fill: "#9ca3af" }} />
        <Tooltip
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
        />
        <Legend formatter={(value: string) => LABELS[value] || value} />
        {metrics.map((metric) => (
          <Line
            key={metric}
            type="monotone"
            dataKey={metric}
            stroke={COLORS[metric] || "#6b7280"}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
