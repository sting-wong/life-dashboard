import { Suspense, lazy, useState, useEffect } from "react";

interface BlockEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  borderless?: boolean;
  hideToolbar?: boolean;
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

  // SSR / pre-mount: render null to avoid hydration mismatch.
  // TipTap is client-only; returning null here means SSR produces no DOM for this
  // component, so there's nothing for React to reconcile during hydration.
  if (!mounted) {
    return null;
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
