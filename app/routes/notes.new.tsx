import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { notes, categories } from "~/db/schema.server";
import { v4 as uuid } from "uuid";
import { ArrowLeft, Link2, FileText, Loader2, AlertCircle, ExternalLink, X, Plus, Tag } from "lucide-react";
import BlockEditor from "~/components/BlockEditor";
import { useState, useRef } from "react";
import { syncNoteLinks } from "~/lib/sync-links.server";
import { syncNoteTags } from "~/lib/sync-tags.server";
import { cn } from "~/lib/utils";

export async function loader({ request }: LoaderFunctionArgs) {
  const allCategories = db.select().from(categories).all();
  return json({ categories: allCategories });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const title = formData.get("title") as string;
  if (!title?.trim()) return json({ error: "标题不能为空" }, { status: 400 });

  const now = new Date().toISOString();
  const noteId = uuid();
  const type = (formData.get("type") as string) === "link" ? "link" : "note";
  const sourceUrl = (formData.get("sourceUrl") as string) || null;
  const ogImage = (formData.get("ogImage") as string) || null;

  // Tags are embedded as #tag in content by the client
  const content = (formData.get("content") as string) || "";

  db.insert(notes).values({
    id: noteId,
    title: title.trim(),
    content,
    categoryId: (formData.get("categoryId") as string) || null,
    type,
    sourceUrl,
    ogImage,
    createdAt: now,
    updatedAt: now,
  }).run();

  syncNoteLinks(noteId, content);
  syncNoteTags(noteId, content);

  return redirect(`/notes/${noteId}`);
}

interface UrlMeta {
  url: string;
  title: string;
  description: string;
  image: string;
  favicon: string;
  siteName: string;
  hostname: string;
  suggestedTags: string[];
}

export default function NewNote() {
  const { categories: catList } = useLoaderData<typeof loader>();
  const [mode, setMode] = useState<"note" | "link">("note");
  const [content, setContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [meta, setMeta] = useState<UrlMeta | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const fetchUrl = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setFetching(true);
    setFetchError("");
    setMeta(null);
    setSelectedTags([]);
    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "解析失败");
      setMeta(data);
      setEditTitle(data.title || "");
    } catch (err: any) {
      setFetchError(err.message || "无法解析该链接");
    } finally {
      setFetching(false);
    }
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !selectedTags.includes(t)) {
      setSelectedTags((prev) => [...prev, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => setSelectedTags((prev) => prev.filter((t) => t !== tag));

  // Encode selected tags as #tag tokens appended to content (picked up by syncNoteTags)
  const contentWithTags = (base: string) => {
    if (selectedTags.length === 0) return base;
    const tagStr = selectedTags.map((t) => `#${t}`).join(" ");
    return base ? `${base}\n<p>${tagStr}</p>` : `<p>${tagStr}</p>`;
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link to="/notes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回笔记列表
      </Link>

      <div className="flex items-center gap-1 p-1 bg-[#F4F6F5] rounded-xl w-fit mb-6">
        <button type="button" onClick={() => setMode("note")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
            mode === "note" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
          <FileText size={14} />普通笔记
        </button>
        <button type="button" onClick={() => { setMode("link"); setTimeout(() => urlInputRef.current?.focus(), 50); }}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
            mode === "link" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
          <Link2 size={14} />链接收藏
        </button>
      </div>

      {mode === "note" && (
        <Form method="post" className="space-y-4">
          <input type="hidden" name="type" value="note" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
            <input type="text" name="title" required placeholder="输入笔记标题"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
            <select name="categoryId"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option value="">无分类</option>
              {catList.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
            <BlockEditor content={content} onChange={setContent} placeholder="开始输入... 支持 [[双向链接]] 和 #行内标签" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">创建笔记</button>
            <Link to="/notes" className="px-6 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">取消</Link>
          </div>
        </Form>
      )}

      {mode === "link" && (
        <div className="space-y-5">
          {/* URL input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">粘贴链接</label>
            <div className="flex gap-2">
              <input ref={urlInputRef} type="url" value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fetchUrl(urlInput); } }}
                placeholder="https://..."
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              <button type="button" onClick={() => fetchUrl(urlInput)}
                disabled={fetching || !urlInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0">
                {fetching ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                {fetching ? "解析中..." : "解析"}
              </button>
            </div>
            {fetchError && (
              <p className="flex items-center gap-1.5 mt-2 text-[12px] text-red-500">
                <AlertCircle size={13} />{fetchError}
              </p>
            )}
          </div>

          {/* Preview card */}
          {meta && (
            <div className="rounded-2xl border border-[#E8ECEA] overflow-hidden bg-white">
              {meta.image && (
                <div className="w-full h-32 sm:h-44 bg-gray-100 overflow-hidden">
                  <img src={meta.image} alt="" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <img src={meta.favicon} alt="" className="w-4 h-4 rounded-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-[12px] text-[#8A8F98]">{meta.siteName}</span>
                  <a href={meta.url} target="_blank" rel="noopener noreferrer"
                    className="ml-auto text-[11px] text-primary-600 hover:text-primary-700 flex items-center gap-0.5">
                    <ExternalLink size={11} />打开
                  </a>
                </div>
                <p className="text-[14px] font-semibold text-gray-900 leading-snug">{meta.title}</p>
                {meta.description && (
                  <p className="text-[12px] text-[#8A8F98] mt-1 line-clamp-2 leading-relaxed">{meta.description}</p>
                )}
              </div>
            </div>
          )}

          {/* Save form */}
          {meta && (
            <Form method="post" className="space-y-4"
              onSubmit={(e) => {
                // Inject tags into content before submit
                const form = e.currentTarget;
                const contentInput = form.querySelector<HTMLInputElement>("input[name=content]");
                if (contentInput) contentInput.value = contentWithTags(content);
              }}>
              <input type="hidden" name="type" value="link" />
              <input type="hidden" name="sourceUrl" value={meta.url} />
              <input type="hidden" name="ogImage" value={meta.image || ""} />
              <input type="hidden" name="content" value={contentWithTags(content)} />

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input type="text" name="title" required value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select name="categoryId"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                  <option value="">无分类</option>
                  {catList.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Tag size={13} />标签
                </label>

                {/* Suggested tags */}
                {meta.suggestedTags.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[11px] text-[#8A8F98] mb-1.5">建议标签（点击添加）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {meta.suggestedTags.map((tag) => {
                        const active = selectedTags.includes(tag);
                        return (
                          <button key={tag} type="button" onClick={() => active ? removeTag(tag) : addTag(tag)}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all border",
                              active
                                ? "bg-primary-600 text-white border-primary-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-primary-400 hover:text-primary-600"
                            )}>
                            {active ? <X size={10} /> : <Plus size={10} />}
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected tags */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedTags.filter((t) => !meta.suggestedTags.includes(t)).map((tag) => (
                      <span key={tag}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium bg-primary-50 text-primary-700 border border-primary-200">
                        #{tag}
                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Manual tag input */}
                <div className="flex gap-2">
                  <input ref={tagInputRef} type="text" value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                    }}
                    placeholder="输入标签，回车添加..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  <button type="button" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-600 text-[13px] rounded-lg transition-colors">
                    添加
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">批注 / 摘录（可选）</label>
                <BlockEditor content={content} onChange={setContent} placeholder="粘贴原文摘录，或写下你的想法..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">保存链接</button>
                <Link to="/notes" className="px-6 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">取消</Link>
              </div>
            </Form>
          )}
        </div>
      )}
    </div>
  );
}
