import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Strikethrough, Code, Quote,
  List, ListOrdered, Heading1, Heading2, Heading3,
  Undo, Redo, Link as LinkIcon, ListTodo,
} from "lucide-react";
import { cn } from "~/lib/utils";

interface BlockEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  borderless?: boolean;
  hideToolbar?: boolean;
}

const WEEKLY_PLAN_HTML = `<h2>本周计划</h2><h3>本周最重要的 3 件事</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p></p></div></li><li data-type="taskItem" data-checked="false"><div><p></p></div></li><li data-type="taskItem" data-checked="false"><div><p></p></div></li></ul><h3>本周学习 / 工作安排</h3><p></p><h3>需要专注完成的任务</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p></p></div></li></ul><h3>本周复盘</h3><p></p>`;
const CONTENT_IDEAS_HTML = `<h2>内容创意整理</h2><h3>待选题</h3><ul><li><p></p></li></ul><h3>灵感来源</h3><p></p><h3>内容方向</h3><p></p><h3>进行中</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p></p></div></li></ul><h3>复盘数据</h3><p></p>`;

const SLASH_ITEMS = [
  { id: "todo", emoji: "☑", label: "Todo 清单", desc: "可勾选任务列表", group: "常用" as const, enabled: true },
  { id: "weekly-plan", emoji: "📅", label: "本周计划", desc: "插入本周计划模板", group: "常用" as const, enabled: true },
  { id: "content-ideas", emoji: "💡", label: "内容创意", desc: "插入内容创意模板", group: "常用" as const, enabled: true },
  { id: "h1", emoji: "H1", label: "一级标题", desc: "大号段落标题", group: "常用" as const, enabled: true },
  { id: "h2", emoji: "H2", label: "二级标题", desc: "中号段落标题", group: "常用" as const, enabled: true },
  { id: "h3", emoji: "H3", label: "三级标题", desc: "小号段落标题", group: "常用" as const, enabled: true },
  { id: "link-bookmark", emoji: "🔗", label: "链接收藏", desc: "收藏网页到素材库", group: "后续增强" as const, enabled: false },
  { id: "table", emoji: "⊞", label: "简单表格", desc: "行列结构整理信息", group: "后续增强" as const, enabled: false },
  { id: "image", emoji: "🖼", label: "收藏图片", desc: "插入本地或网络图片", group: "后续增强" as const, enabled: false },
];

const SLASH_GROUPS = ["常用", "后续增强"] as const;

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) return null;
  const addLink = () => {
    const url = window.prompt("输入链接 URL:");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };
  const btn = (active: boolean) =>
    cn("p-1.5 rounded hover:bg-gray-100 text-gray-600", active && "bg-gray-100 text-primary-600");
  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-gray-200 bg-gray-50/50 rounded-t-lg">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} title="粗体"><Bold size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} title="斜体"><Italic size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))} title="删除线"><Strikethrough size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive("code"))} title="行内代码"><Code size={16} /></button>
      <div className="w-px h-5 bg-gray-300 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive("heading", { level: 1 }))} title="一级标题"><Heading1 size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} title="二级标题"><Heading2 size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))} title="三级标题"><Heading3 size={16} /></button>
      <div className="w-px h-5 bg-gray-300 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title="无序列表"><List size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title="有序列表"><ListOrdered size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={btn(editor.isActive("taskList"))} title="任务列表"><ListTodo size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive("blockquote"))} title="引用"><Quote size={16} /></button>
      <div className="w-px h-5 bg-gray-300 mx-1" />
      <button type="button" onClick={addLink} className={btn(editor.isActive("link"))} title="插入链接"><LinkIcon size={16} /></button>
      <div className="w-px h-5 bg-gray-300 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={cn(btn(false), !editor.can().undo() && "opacity-30")} title="撤销"><Undo size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={cn(btn(false), !editor.can().redo() && "opacity-30")} title="重做"><Redo size={16} /></button>
    </div>
  );
};

export default function BlockEditor({
  content,
  onChange,
  placeholder = "开始输入...",
  editable = true,
  borderless = false,
  hideToolbar = false,
}: BlockEditorProps) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const slashRef = useRef({
    open: false,
    anchorFrom: -1,
    selectedIndex: 0,
    enabledIds: [] as string[],
  });
  const execRef = useRef<(id: string) => void>(() => {});
  const [slashUI, setSlashUI] = useState({
    open: false, query: "", top: 0, left: 0, selectedIndex: 0,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: "text-primary-600 underline cursor-pointer hover:text-primary-700" },
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none" },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      if (hiddenInputRef.current) hiddenInputRef.current.value = html;

      const { state } = editor;
      const { from, empty } = state.selection;
      const closeMenu = () => {
        if (slashRef.current.open) {
          slashRef.current.open = false;
          setSlashUI(s => ({ ...s, open: false }));
        }
      };
      if (!empty) { closeMenu(); return; }

      const $from = state.doc.resolve(from);
      const blockStart = $from.start($from.depth);
      const textBefore = state.doc.textBetween(blockStart, from);
      if (!textBefore.startsWith("/")) { closeMenu(); return; }

      const query = textBefore.slice(1).toLowerCase();
      const filtered = SLASH_ITEMS.filter(i => !query || i.label.includes(query) || i.id.includes(query));
      if (filtered.length === 0) { closeMenu(); return; }

      const enabledIds = filtered.filter(i => i.enabled).map(i => i.id);
      const coords = editor.view.coordsAtPos(from);
      // w-56 = 14rem = 224px at 16px base; add small buffer
      const MENU_W = 228;
      // max-h-72 = 18rem = 288px; use actual max to avoid false flip
      const MENU_H = 320;
      const MARGIN = 8;
      // coordsAtPos returns viewport-relative coordinates — correct for position:fixed
      let left = coords.left;
      let top = coords.bottom + 4;
      // Clamp right boundary to editor container edge (not full viewport),
      // so menu doesn't overflow into the sidebar on PC
      const editorRect = editor.view.dom.getBoundingClientRect();
      const boundaryRight = Math.min(window.innerWidth - MARGIN, editorRect.right);
      if (left + MENU_W > boundaryRight) {
        left = Math.max(MARGIN, boundaryRight - MENU_W);
      }
      // Prevent bottom-edge overflow — flip above the cursor line
      if (top + MENU_H > window.innerHeight - MARGIN) {
        top = Math.max(MARGIN, coords.top - MENU_H - 4);
      }

      slashRef.current = { open: true, anchorFrom: blockStart, selectedIndex: 0, enabledIds };
      setSlashUI({ open: true, query, top, left, selectedIndex: 0 });
    },
  });

  // Update execRef every render — closes over the latest editor instance
  execRef.current = (commandId: string) => {
    if (!editor) return;
    const { anchorFrom } = slashRef.current;
    const { from } = editor.state.selection;
    const chain = editor.chain().focus().deleteRange({ from: anchorFrom, to: from });
    switch (commandId) {
      case "h1": chain.toggleHeading({ level: 1 }).run(); break;
      case "h2": chain.toggleHeading({ level: 2 }).run(); break;
      case "h3": chain.toggleHeading({ level: 3 }).run(); break;
      case "todo": chain.toggleTaskList().run(); break;
      case "weekly-plan": chain.insertContent(WEEKLY_PLAN_HTML).run(); break;
      case "content-ideas": chain.insertContent(CONTENT_IDEAS_HTML).run(); break;
      default: chain.run();
    }
    slashRef.current.open = false;
    setSlashUI(s => ({ ...s, open: false }));
  };

  // Keyboard navigation for slash menu (capture phase, empty deps — uses refs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!slashRef.current.open) return;
      const { enabledIds, selectedIndex } = slashRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        slashRef.current.open = false;
        setSlashUI(s => ({ ...s, open: false }));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(selectedIndex + 1, enabledIds.length - 1);
        slashRef.current.selectedIndex = next;
        setSlashUI(s => ({ ...s, selectedIndex: next }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(selectedIndex - 1, 0);
        slashRef.current.selectedIndex = prev;
        setSlashUI(s => ({ ...s, selectedIndex: prev }));
      } else if (e.key === "Enter") {
        const id = enabledIds[selectedIndex];
        if (id) { e.preventDefault(); execRef.current(id); }
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  // Close slash menu when clicking outside the popup
  useEffect(() => {
    if (!slashUI.open) return;
    const handler = (e: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        slashRef.current.open = false;
        setSlashUI(s => ({ ...s, open: false }));
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [slashUI.open]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  const filteredItems = SLASH_ITEMS.filter(i =>
    !slashUI.query || i.label.includes(slashUI.query) || i.id.includes(slashUI.query)
  );

  return (
    <div className={borderless ? "" : "border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent"}>
      {editable && !hideToolbar && <MenuBar editor={editor} />}
      <EditorContent editor={editor} />
      <input type="hidden" name="content" ref={hiddenInputRef} defaultValue={content} />

      {slashUI.open && filteredItems.length > 0 && (
        <div
          ref={slashMenuRef}
          style={{ position: "fixed", top: slashUI.top, left: slashUI.left, zIndex: 9999 }}
          className="w-56 bg-white/95 backdrop-blur-sm rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.10),0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 overflow-y-auto max-h-72 py-1.5"
          onMouseDown={(e) => e.preventDefault()}
        >
          {SLASH_GROUPS.map(group => {
            const items = filteredItems.filter(i => i.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold text-gray-300 uppercase tracking-widest">
                  {group}
                </div>
                {items.map(item => {
                  const enabledIndex = slashRef.current.enabledIds.indexOf(item.id);
                  const isSelected = item.enabled && enabledIndex !== -1 && enabledIndex === slashUI.selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.enabled}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (item.enabled) execRef.current(item.id);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-1.5 mx-1 rounded-lg text-left transition-colors",
                        "w-[calc(100%-8px)]",
                        item.enabled
                          ? isSelected ? "bg-gray-100" : "hover:bg-gray-50 cursor-pointer"
                          : "opacity-35 cursor-not-allowed"
                      )}
                    >
                      <span className="w-6 h-6 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[12px] shrink-0 font-mono leading-none">
                        {item.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-gray-700 leading-tight">{item.label}</span>
                          {!item.enabled && (
                            <span className="text-[9px] font-medium text-amber-500 bg-amber-50 border border-amber-100 rounded px-1 leading-tight py-px shrink-0">
                              即将上线
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate leading-tight">{item.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
