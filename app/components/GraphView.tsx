import { Suspense, lazy, useState, useEffect } from "react";

interface GraphNode {
  id: string;
  title: string;
  linkCount: number;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphViewProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (nodeId: string) => void;
}

const GraphViewInner = lazy(() => import("./GraphViewInner"));

export default function GraphView(props: GraphViewProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-center h-[400px] text-gray-400 text-sm">
          图谱加载中...
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-center h-[400px] text-gray-400 text-sm">
          图谱加载中...
        </div>
      </div>
    }>
      <GraphViewInner {...props} />
    </Suspense>
  );
}
