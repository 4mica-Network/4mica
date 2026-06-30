"use client";

import CodeTabs from "../../blog/CodeTabs";

type CodeBlockProps = {
  code: string;
  language?: string;
  className?: string;
};

export default function CodeBlock({
  code,
  language = "rust",
  className,
}: CodeBlockProps) {
  return (
    <CodeTabs
      blocks={[{ code, language }]}
      hideTabs
      contentClassName={className}
    />
  );
}
