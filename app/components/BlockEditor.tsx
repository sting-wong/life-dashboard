import { Suspense, lazy, useState, useEffect } from "react";

interface BlockEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  borderless?: boolean;
}

const BlockEditorInner = lazy(() => import("./BlockEditorInner"));

function EditorFallback({ content }: { content: string }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <textarea
        name="content"
        defaultValue={content}
        rows={18}
        className="w-full px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        placeholder="编辑器加载中..."
        readOnly
      />
    </div>
  );
}

export default function BlockEditor(props: BlockEditorProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // SSR: render a fallback textarea that can still submit via form
  if (!mounted) {
    return (
      <div>
        <EditorFallback content={props.content} />
        <input type="hidden" name="content" value={props.content} />
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div>
        <EditorFallback content={props.content} />
        <input type="hidden" name="content" value={props.content} />
      </div>
    }>
      <BlockEditorInner {...props} />
    </Suspense>
  );
}
