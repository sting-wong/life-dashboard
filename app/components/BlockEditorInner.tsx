import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { useEffect, useRef } from "react";
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
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt("输入链接 URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const buttonClass = (active: boolean) =>
    cn(
      "p-1.5 rounded hover:bg-gray-100 text-gray-600",
      active && "bg-gray-100 text-primary-600"
    );

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-gray-200 bg-gray-50/50 rounded-t-lg">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={buttonClass(editor.isActive("bold"))} title="粗体 (Ctrl+B)"><Bold size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={buttonClass(editor.isActive("italic"))} title="斜体 (Ctrl+I)"><Italic size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={buttonClass(editor.isActive("strike"))} title="删除线"><Strikethrough size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={buttonClass(editor.isActive("code"))} title="行内代码"><Code size={16} /></button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={buttonClass(editor.isActive("heading", { level: 1 }))} title="一级标题"><Heading1 size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={buttonClass(editor.isActive("heading", { level: 2 }))} title="二级标题"><Heading2 size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={buttonClass(editor.isActive("heading", { level: 3 }))} title="三级标题"><Heading3 size={16} /></button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={buttonClass(editor.isActive("bulletList"))} title="无序列表"><List size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={buttonClass(editor.isActive("orderedList"))} title="有序列表"><ListOrdered size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={buttonClass(editor.isActive("taskList"))} title="任务列表"><ListTodo size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={buttonClass(editor.isActive("blockquote"))} title="引用"><Quote size={16} /></button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <button type="button" onClick={addLink} className={buttonClass(editor.isActive("link"))} title="插入链接"><LinkIcon size={16} /></button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={cn(buttonClass(false), !editor.can().undo() && "opacity-30")} title="撤销"><Undo size={16} /></button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={cn(buttonClass(false), !editor.can().redo() && "opacity-30")} title="重做"><Redo size={16} /></button>
    </div>
  );
};

export default function BlockEditor({
  content,
  onChange,
  placeholder = "开始输入...",
  editable = true,
}: BlockEditorProps) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: "text-primary-600 underline cursor-pointer hover:text-primary-700",
        },
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none p-4 min-h-[300px] focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = html;
      }
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
      {editable && <MenuBar editor={editor} />}
      <EditorContent editor={editor} />
      {/* Hidden input to participate in Remix Form */}
      <input type="hidden" name="content" ref={hiddenInputRef} defaultValue={content} />
    </div>
  );
}
