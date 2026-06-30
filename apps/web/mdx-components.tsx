import { slugify } from "@components/slugify";
import Link from "next/link";

function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  return "";
}

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement>;
type ParagraphProps = React.HTMLAttributes<HTMLParagraphElement>;
type OrderedListProps = React.HTMLAttributes<HTMLOListElement>;
type UnorderedListProps = React.HTMLAttributes<HTMLUListElement>;
type ListItemProps = React.HTMLAttributes<HTMLLIElement>;
type EmProps = React.HTMLAttributes<HTMLElement>;
type StrongProps = React.HTMLAttributes<HTMLElement>;
type AnchorProps = React.ComponentPropsWithoutRef<"a">;
type BlockquoteProps = React.HTMLAttributes<HTMLElement>;

const linkClass =
  "text-brand-teal underline underline-offset-2 transition-colors hover:text-brand-soft";

const components = {
  h1: (props: HeadingProps) => (
    <h1
      className="mb-8 font-semibold text-3xl text-ink-strong tracking-tight md:text-4xl"
      {...props}
    />
  ),
  h2: ({ children, ...props }: HeadingProps) => (
    <>
      <h2
        id={slugify(childrenToText(children))}
        className="mt-10 mb-3 scroll-mt-28 font-semibold text-ink-strong text-xl"
        {...props}
      >
        {children}
      </h2>
      <div className="mb-4 h-px w-full bg-white/10" />
    </>
  ),
  h3: ({ children, ...props }: HeadingProps) => (
    <h3
      id={slugify(childrenToText(children))}
      className="mt-6 mb-2 scroll-mt-28 font-medium text-ink-strong text-lg"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: (props: HeadingProps) => (
    <h4
      className="mt-4 mb-2 font-medium text-base text-ink-strong"
      {...props}
    />
  ),
  p: (props: ParagraphProps) => (
    <p className="pb-3 text-ink-body leading-relaxed" {...props} />
  ),
  ol: (props: OrderedListProps) => (
    <ol
      className="list-decimal space-y-1.5 py-2 pl-5 text-ink-body"
      {...props}
    />
  ),
  ul: (props: UnorderedListProps) => (
    <ul
      className="list-disc space-y-1.5 pt-1 pb-3 pl-5 text-ink-body marker:text-ink-subtle"
      {...props}
    />
  ),
  li: (props: ListItemProps) => (
    <li className="pl-1 text-ink-body leading-relaxed" {...props} />
  ),
  em: (props: EmProps) => <em className="text-ink-strong italic" {...props} />,
  strong: (props: StrongProps) => (
    <strong className="font-semibold text-ink-strong" {...props} />
  ),
  a: ({ href, children, ...props }: AnchorProps) => {
    if (href?.startsWith("/")) {
      return (
        <Link href={href} className={linkClass} {...props}>
          {children}
        </Link>
      );
    }
    if (href?.startsWith("#")) {
      return (
        <a href={href} className={linkClass} {...props}>
          {children}
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        {...props}
      >
        {children}
      </a>
    );
  },
  Table: ({ data }: { data: { headers: string[]; rows: string[][] } }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full table-auto border-collapse text-left text-ink-body">
        <thead>
          <tr>
            {data.headers.map((header) => (
              <th
                key={`header-${header}`}
                className="border-white/10 border-b px-4 py-2 text-left font-medium text-ink-strong"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell) => (
                <td
                  key={`${row.join("-")}-${cell}`}
                  className="border-white/5 border-b px-4 py-2 text-left"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
  blockquote: (props: BlockquoteProps) => (
    <blockquote
      className="my-4 border-white/15 border-l-2 pl-4 text-ink-muted italic"
      {...props}
    />
  ),
};

declare global {
  type MDXProvidedComponents = typeof components;
}

export function useMDXComponents(): MDXProvidedComponents {
  return components;
}
