import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigate } from "@remix-run/react";
import { db } from "~/db/index.server";
import { notes, noteLinks } from "~/db/schema.server";
import { ArrowLeft, GitGraph } from "lucide-react";
import GraphView from "~/components/GraphView";
import { useState, useEffect } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const allNotes = db.select({
    id: notes.id,
    title: notes.title,
  }).from(notes).all();

  const allLinks = db.select({
    sourceNoteId: noteLinks.sourceNoteId,
    targetNoteId: noteLinks.targetNoteId,
  }).from(noteLinks).all();

  // Build graph data
  const linkCountMap = new Map<string, number>();
  for (const link of allLinks) {
    linkCountMap.set(link.sourceNoteId, (linkCountMap.get(link.sourceNoteId) || 0) + 1);
    linkCountMap.set(link.targetNoteId, (linkCountMap.get(link.targetNoteId) || 0) + 1);
  }

  const graphNodes = allNotes.map((n) => ({
    id: n.id,
    title: n.title,
    linkCount: linkCountMap.get(n.id) || 0,
  }));

  const graphLinks = allLinks.map((l) => ({
    source: l.sourceNoteId,
    target: l.targetNoteId,
  }));

  return json({
    graphNodes,
    graphLinks,
    totalNotes: allNotes.length,
    totalLinks: allLinks.length,
  });
}

export default function GraphPage() {
  const { graphNodes, graphLinks, totalNotes, totalLinks } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleNodeClick = (nodeId: string) => {
    navigate(`/notes/${nodeId}`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link to="/notes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} />
        返回笔记
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
          <GitGraph size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">知识图谱</h1>
          <p className="text-sm text-gray-500">
            {totalNotes} 个节点 · {totalLinks} 条连线
          </p>
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-6">
        节点代表笔记，连线代表 [[双向链接]] 关系。节点越大表示链接数越多。点击节点跳转到对应笔记。
      </p>

      <GraphView
        nodes={graphNodes}
        links={graphLinks}
        onNodeClick={handleNodeClick}
      />
    </div>
  );
}
