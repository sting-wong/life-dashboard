import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { db } from "~/db/index.server";
import { notes, categories, noteTags, tags } from "~/db/schema.server";
import { eq, desc, like, and, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { formatDate, cn } from "~/lib/utils";
import { Plus, FileText, Search, FolderTree, Trash2, Edit3, Link2 } from "lucide-react";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get("category");
  const searchQuery = url.searchParams.get("q") || "";
  const typeFilter = url.searchParams.get("type") || ""; // "link" | "note" | ""

  let allNotes = db.select().from(notes).orderBy(desc(notes.updatedAt)).all();

  if (categoryId) {
    allNotes = allNotes.filter((n) => n.categoryId === categoryId);
  }
  if (typeFilter === "link" || typeFilter === "note") {
    allNotes = allNotes.filter((n) => n.type === typeFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    allNotes = allNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.content && n.content.toLowerCase().includes(q))
    );
  }

  // linkCount reuses the already-fetched full list to avoid a second query
  const allNotesForCount = db.select({ type: notes.type }).from(notes).all();
  const linkCount = allNotesForCount.filter((n) => n.type === "link").length;
  const allCategories = db.select().from(categories).all();
  const allTags = db.select().from(tags).all();

  // Batch fetch all noteTags in one query, then join in memory — avoids N+1
  const allNoteTagLinks = db.select({ noteId: noteTags.noteId, tagId: noteTags.tagId })
    .from(noteTags)
    .all();
  const tagById = new Map(allTags.map((t) => [t.id, t]));
  const tagMap: Record<string, { name: string; id: string }[]> = {};
  for (const { noteId, tagId } of allNoteTagLinks) {
    const tag = tagById.get(tagId);
    if (!tag) continue;
    if (!tagMap[noteId]) tagMap[noteId] = [];
    tagMap[noteId].push({ name: tag.name, id: tag.id });
  }

  return json({ notes: allNotes, categories: allCategories, allTags, tagMap, selectedCategory: categoryId, searchQuery, typeFilter, linkCount });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete-note") {
    const noteId = formData.get("noteId") as string;
    db.delete(notes).where(eq(notes.id, noteId)).run();
  }

  if (intent === "create-category") {
    const name = formData.get("name") as string;
    if (name?.trim()) {
      db.insert(categories).values({
        id: uuid(),
        name: name.trim(),
        color: "#3b82f6",
        createdAt: new Date().toISOString(),
      }).run();
    }
  }

  if (intent === "delete-category") {
    const categoryId = formData.get("categoryId") as string;
    // Unlink notes from this category
    db.update(notes).set({ categoryId: null }).where(eq(notes.categoryId, categoryId)).run();
    db.delete(categories).where(eq(categories.id, categoryId)).run();
  }

  return redirect(`/notes${new URL(request.url).search}`);
}

export default function NotesList() {
  const { notes: noteList, categories: catList, allTags, tagMap, selectedCategory, searchQuery, typeFilter, linkCount } = useLoaderData<typeof loader>();
  const [showNewCategory, setShowNewCategory] = useState(false);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">笔记</h1>
          <p className="text-sm text-[#8A8F98] mt-1">记录想法、知识和灵感。</p>
        </div>
        <Link
          to="/notes/new"
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus size={15} />
          新建笔记
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:gap-6 gap-4">
        {/* Category sidebar — only when there are notes */}
        {noteList.length > 0 && <div className="w-full md:w-48 md:shrink-0">
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2 md:mb-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">分类</h3>
              <button
                onClick={() => setShowNewCategory(!showNewCategory)}
                className="text-gray-400 hover:text-gray-600"
              >
                <Plus size={14} />
              </button>
            </div>

            {showNewCategory && (
              <Form method="post" className="mb-2 flex gap-1">
                <input type="hidden" name="intent" value="create-category" />
                <input
                  type="text"
                  name="name"
                  placeholder="名称"
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                />
                <button type="submit" className="px-2 py-1 text-xs bg-primary-600 text-white rounded">添加</button>
              </Form>
            )}

            <div className="flex md:flex-col flex-row flex-wrap gap-1 md:gap-0 md:space-y-0.5">
              <Link
                to="/notes"
                className={cn(
                  "block px-2 py-1.5 text-sm rounded-md",
                  !selectedCategory && !typeFilter ? "bg-primary-50 text-primary-700" : "text-gray-600 hover:bg-gray-50"
                )}
              >
                全部
              </Link>
              {linkCount > 0 && (
                <Link
                  to="/notes?type=link"
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md",
                    typeFilter === "link" ? "bg-primary-50 text-primary-700" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Link2 size={13} />
                  链接收藏
                  <span className="ml-auto text-[10px] text-[#8A8F98]">{linkCount}</span>
                </Link>
              )}
              {catList.map((cat) => (
                <div key={cat.id} className="group flex items-center">
                  <Link
                    to={`/notes?category=${cat.id}`}
                    className={cn(
                      "flex-1 px-2 py-1.5 text-sm rounded-md truncate",
                      selectedCategory === cat.id ? "bg-primary-50 text-primary-700" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: cat.color || "#3b82f6" }} />
                    {cat.name}
                  </Link>
                  <Form method="post" className="opacity-0 group-hover:opacity-100">
                    <input type="hidden" name="intent" value="delete-category" />
                    <input type="hidden" name="categoryId" value={cat.id} />
                    <button type="submit" className="p-1 text-gray-300 hover:text-red-500"
                      onClick={(e) => !confirm("删除此分类？") && e.preventDefault()}>
                      <Trash2 size={12} />
                    </button>
                  </Form>
                </div>
              ))}
            </div>
          </div>
        </div>}

        {/* Notes list */}
        <div className="flex-1">
          {/* Search — only when there are notes */}
          {noteList.length > 0 && <div className="mb-4">
            <Form method="get" className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="q"
                defaultValue={searchQuery}
                placeholder="搜索笔记..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {selectedCategory && <input type="hidden" name="category" value={selectedCategory} />}
              {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
            </Form>
          </div>}

          {/* Note cards */}
          <div className="space-y-3">
            {noteList.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-3">
                  <FileText size={22} className="text-primary-400" />
                </div>
                <p className="text-[14px] font-semibold text-gray-700 mb-1">还没有笔记</p>
                <p className="text-[12px] text-gray-500 mb-4">选择一个模板快速开始，或直接新建</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  {[
                    { label: "📝 会议记录", title: "会议记录" },
                    { label: "💡 灵感速记", title: "灵感速记" },
                    { label: "📁 项目文档", title: "项目文档" },
                  ].map((t) => (
                    <Link key={t.title} to={`/notes/new?title=${encodeURIComponent(t.title)}`}
                      className="px-3 py-2 border border-dashed border-gray-200 rounded-xl text-[12px] text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                      {t.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              noteList.map((note) => {
                const isLink = note.type === "link";
                const hostname = note.sourceUrl ? (() => { try { return new URL(note.sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })() : "";
                return (
                  <Link
                    key={note.id}
                    to={`/notes/${note.id}`}
                    className="block card card-hover p-4"
                  >
                    <div className="flex items-start gap-3">
                      {/* Link thumbnail */}
                      {isLink && note.ogImage && (
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                          <img src={note.ogImage} alt="" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-medium text-gray-900 truncate">{note.title}</h3>
                          {isLink && (
                            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full">
                              <Link2 size={9} />链接
                            </span>
                          )}
                        </div>
                        {isLink && hostname ? (
                          <p className="text-[11px] text-[#8A8F98] mt-0.5 truncate">{hostname}</p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {note.content?.replace(/<[^>]*>/g, "").replace(/[#*`\[\]]/g, "").slice(0, 150) || "无内容"}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {note.categoryId && (
                        <span className="text-xs text-gray-400">
                          {catList.find((c) => c.id === note.categoryId)?.name || "未分类"}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(note.updatedAt)}</span>
                    </div>
                    {(tagMap[note.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tagMap[note.id].map((tag) => (
                          <Link
                            key={tag.id}
                            to={`/tags/${encodeURIComponent(tag.name)}`}
                            className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded hover:bg-primary-50 hover:text-primary-600 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{tag.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
