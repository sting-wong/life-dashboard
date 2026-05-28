import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, Link } from "@remix-run/react";
import { db } from "~/db/index.server";
import { notes, categories } from "~/db/schema.server";
import { eq } from "drizzle-orm";
import { ArrowLeft, Trash2, Link2, ExternalLink } from "lucide-react";
import { formatDate } from "~/lib/utils";
import { useState } from "react";
import BlockEditor from "~/components/BlockEditor";
import { syncNoteLinks, getBacklinks, getForwardLinks } from "~/lib/sync-links.server";
import { syncNoteTags } from "~/lib/sync-tags.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const note = db.select().from(notes).where(eq(notes.id, params.id!)).get();
  if (!note) throw new Response("Not Found", { status: 404 });

  const allCategories = db.select().from(categories).all();
  const backlinks = getBacklinks(note.id);
  const forwardLinks = getForwardLinks(note.id);

  return json({ note, categories: allCategories, backlinks, forwardLinks });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update") {
    const title = formData.get("title") as string;
    if (!title?.trim()) return json({ error: "标题不能为空" }, { status: 400 });

    const content = (formData.get("content") as string) || "";

    db.update(notes)
      .set({
        title: title.trim(),
        content,
        categoryId: (formData.get("categoryId") as string) || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notes.id, params.id!))
      .run();

    // Sync wiki links [[...]] and inline tags #tag
    syncNoteLinks(params.id!, content);
    syncNoteTags(params.id!, content);
  }

  if (intent === "delete") {
    db.delete(notes).where(eq(notes.id, params.id!)).run();
    return redirect("/notes");
  }

  return redirect(`/notes/${params.id}`);
}

export default function NoteDetail() {
  const { note, categories: catList, backlinks, forwardLinks } = useLoaderData<typeof loader>();
  const [content, setContent] = useState(note.content || "");

  const isLink = note.type === "link";
  const hostname = note.sourceUrl ? (() => { try { return new URL(note.sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })() : "";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link to="/notes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回笔记列表
      </Link>

      {/* Source card for link notes */}
      {isLink && note.sourceUrl && (
        <a
          href={note.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 mb-5 rounded-2xl border border-[#E8ECEA] bg-[#F8FAF9] hover:bg-[#F0F4F2] transition-colors group"
        >
          {note.ogImage && (
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 shrink-0">
              <img src={note.ogImage} alt="" className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Link2 size={11} className="text-primary-500 shrink-0" />
              <span className="text-[11px] text-[#8A8F98] truncate">{hostname}</span>
            </div>
            <p className="text-[13px] font-medium text-gray-800 truncate">{note.title}</p>
          </div>
          <ExternalLink size={14} className="text-gray-300 group-hover:text-primary-500 transition-colors shrink-0" />
        </a>
      )}

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="update" />

        <div>
          <input
            type="text"
            name="title"
            defaultValue={note.title}
            required
            className="w-full text-2xl font-bold text-gray-900 border-none px-0 focus:outline-none focus:ring-0"
            placeholder="标题"
          />
        </div>

        <div>
          <select
            name="categoryId"
            defaultValue={note.categoryId || ""}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">无分类</option>
            {catList.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Block Editor (WYSIWYG) */}
        <BlockEditor
          content={content}
          onChange={setContent}
          placeholder="开始输入... 支持 [[双向链接]] 和 #行内标签"
        />

        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            保存
          </button>
        </div>
      </Form>

      <Form method="post" className="flex justify-end -mt-10">
        <input type="hidden" name="intent" value="delete" />
        <button
          type="submit"
          className="flex items-center gap-1 px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          onClick={(e) => !confirm("确定删除此笔记？") && e.preventDefault()}
        >
          <Trash2 size={16} />
          删除
        </button>
      </Form>

      {/* Forward Links */}
      {forwardLinks.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
            <Link2 size={14} />
            本文链接到
          </h3>
          <div className="flex flex-wrap gap-2">
            {forwardLinks.map((link) => (
              <Link
                key={link.id}
                to={`/notes/${link.targetNoteId}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-full hover:bg-primary-100 transition-colors"
              >
                {link.targetTitle}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Backlinks Panel */}
      {backlinks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
            <Link2 size={14} />
            反向链接（哪些笔记链接到本文）
          </h3>
          <ul className="space-y-1.5">
            {backlinks.map((link) => (
              <li key={link.id}>
                <Link
                  to={`/notes/${link.sourceNoteId}`}
                  className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                >
                  {link.sourceTitle}
                </Link>
                {link.context && (
                  <span className="text-xs text-gray-400 ml-2">{link.context}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          创建于 {formatDate(note.createdAt)} · 更新于 {formatDate(note.updatedAt)}
        </p>
      </div>
    </div>
  );
}
