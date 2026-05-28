import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { notes, noteTags, tags } from "~/db/schema.server";
import { eq } from "drizzle-orm";
import { ArrowLeft, Tag } from "lucide-react";
import { formatDate } from "~/lib/utils";

export async function loader({ params }: LoaderFunctionArgs) {
  const tagName = decodeURIComponent(params.name!).toLowerCase();

  const tag = db.select().from(tags).where(eq(tags.name, tagName)).get();
  if (!tag) throw new Response("Tag not found", { status: 404 });

  // Get all note IDs associated with this tag
  const noteTagLinks = db.select({ noteId: noteTags.noteId })
    .from(noteTags)
    .where(eq(noteTags.tagId, tag.id))
    .all();

  const taggedNotes = noteTagLinks
    .map((link) => db.select().from(notes).where(eq(notes.id, link.noteId)).get())
    .filter(Boolean);

  // Get all tags for tag cloud
  const allTags = db.select().from(tags).all();
  const tagCounts = allTags.map((t) => {
    const count = db.select().from(noteTags).where(eq(noteTags.tagId, t.id)).all().length;
    return { ...t, count };
  }).filter((t) => t.count > 0);

  return json({ tag, taggedNotes, tagCounts });
}

export default function TagPage() {
  const { tag, taggedNotes, tagCounts } = useLoaderData<typeof loader>();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/notes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回笔记列表
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
          <Tag size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">#{tag.name}</h1>
          <p className="text-sm text-gray-500">{taggedNotes.length} 篇笔记</p>
        </div>
      </div>

      {/* Tag cloud */}
      <div className="flex flex-wrap gap-2 mb-8">
        {tagCounts.map((t) => (
          <Link
            key={t.id}
            to={`/tags/${encodeURIComponent(t.name)}`}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-full transition-colors ${
              t.id === tag.id
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            #{t.name}
            <span className="text-xs opacity-70">{t.count}</span>
          </Link>
        ))}
      </div>

      {/* Notes with this tag */}
      {taggedNotes.length === 0 ? (
        <p className="text-gray-400 text-center py-8">此标签下暂无笔记</p>
      ) : (
        <div className="space-y-3">
          {taggedNotes.map((note) => note && (
            <Link
              key={note.id}
              to={`/notes/${note.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow"
            >
              <h3 className="text-sm font-medium text-gray-900 truncate">{note.title}</h3>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                {note.content?.replace(/<[^>]*>/g, "").replace(/[#*`\[\]]/g, "").slice(0, 150) || "无内容"}
              </p>
              <p className="text-xs text-gray-400 mt-2">{formatDate(note.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
