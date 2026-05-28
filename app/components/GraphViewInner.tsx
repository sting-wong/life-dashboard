import { useEffect, useRef } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";

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

const SVG_NS = "http://www.w3.org/2000/svg";

function createSVGElement(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

export default function GraphViewInner({ nodes, links, onNodeClick }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container || nodes.length === 0) return;

    const width = container.clientWidth;
    const height = 500;

    // Clear
    svg.innerHTML = "";
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));

    // Prepare data
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const colors = ["#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b", "#10b981"];

    const simNodes = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      radius: Math.max(12, Math.min(40, 10 + n.linkCount * 4)),
      color: colors[n.id.charCodeAt(0) % colors.length],
    }));

    const simLinks: { source: string; target: string }[] = [];
    for (const link of links) {
      if (nodeMap.has(link.source) && nodeMap.has(link.target)) {
        simLinks.push({ source: link.source, target: link.target });
      }
    }

    // Create SVG groups
    const linkGroup = createSVGElement("g", { class: "links" });
    const nodeGroup = createSVGElement("g", { class: "nodes" });
    svg.appendChild(linkGroup);
    svg.appendChild(nodeGroup);

    // Create line elements
    const lineEls: SVGLineElement[] = [];
    for (const link of simLinks) {
      const line = createSVGElement("line", {
        stroke: "#d1d5db",
        "stroke-width": "1.5",
        "stroke-opacity": "0.6",
      }) as SVGLineElement;
      linkGroup.appendChild(line);
      lineEls.push(line);
    }

    // Create node group elements
    const nodeEls: SVGGElement[] = [];
    const nodeData: any[] = [];

    for (const node of simNodes) {
      const g = createSVGElement("g", {
        cursor: "pointer",
      }) as SVGGElement;

      g.addEventListener("click", () => onNodeClick(node.id));

      const circle = createSVGElement("circle", {
        r: String(node.radius),
        fill: node.color,
        stroke: "#fff",
        "stroke-width": "2",
        opacity: "0.85",
      });

      const label = node.title.length > 10
        ? node.title.slice(0, 10) + "..."
        : node.title;
      const text = createSVGElement("text", {
        "text-anchor": "middle",
        dy: "0.35em",
        "font-size": String(Math.max(9, Math.min(12, node.radius * 0.4))),
        fill: "#fff",
        "pointer-events": "none",
      });
      text.textContent = label;

      const title = createSVGElement("title");
      title.textContent = node.title;

      g.appendChild(circle);
      g.appendChild(text);
      g.appendChild(title);
      nodeGroup.appendChild(g);
      nodeEls.push(g);
      nodeData.push(node);
    }

    // Simulation
    const simulation = forceSimulation(simNodes as any)
      .force("link", forceLink(simLinks).id((d: any) => d.id).distance(100))
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collision", forceCollide().radius((d: any) => d.radius + 5));

    simulation.on("tick", () => {
      for (let i = 0; i < simLinks.length; i++) {
        const link = simLinks[i] as any;
        lineEls[i].setAttribute("x1", String(link.source.x));
        lineEls[i].setAttribute("y1", String(link.source.y));
        lineEls[i].setAttribute("x2", String(link.target.x));
        lineEls[i].setAttribute("y2", String(link.target.y));
      }

      for (let i = 0; i < simNodes.length; i++) {
        const node = simNodes[i] as any;
        nodeEls[i].setAttribute("transform", `translate(${node.x},${node.y})`);
      }
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links, onNodeClick]);

  return (
    <div ref={containerRef} className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {nodes.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] text-gray-400 text-sm">
          暂无数据 — 创建包含 [[双向链接]] 的笔记来生成知识图谱
        </div>
      ) : (
        <svg ref={svgRef} />
      )}
    </div>
  );
}
