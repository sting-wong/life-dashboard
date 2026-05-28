import { Suspense, lazy, useState, useEffect } from "react";

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

const AnalyticsChartInner = lazy(() => import("./AnalyticsChartInner"));

export default function AnalyticsChart(props: AnalyticsChartProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm bg-gray-50 rounded-lg">
        图表加载中...
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm bg-gray-50 rounded-lg">
        图表加载中...
      </div>
    }>
      <AnalyticsChartInner {...props} />
    </Suspense>
  );
}
