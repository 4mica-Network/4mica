"use client";

import { useEffect, useId, useMemo, useState } from "react";

type MermaidDiagramProps = {
  code: string;
  className?: string;
};

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (
    id: string,
    code: string,
  ) => Promise<{ svg: string }> | { svg: string };
};

type MermaidWindow = Window &
  typeof globalThis & {
    mermaid?: MermaidApi;
    __mermaidInitialized?: boolean;
  };

const themeVariables = {
  background: "#050B1D",
  primaryColor: "#0B1430",
  primaryBorderColor: "#1E3A8A",
  primaryTextColor: "#E7F1FF",
  lineColor: "#7BCBFF",
  secondaryColor: "#0A1230",
  tertiaryColor: "#0F1B3B",
  textColor: "#C8D7F2",
  noteTextColor: "#E7F1FF",
  noteBkgColor: "#0B1430",
  noteBorderColor: "#1E3A8A",
};

const MERMAID_SRC =
  "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";

const loadMermaid = () =>
  new Promise<MermaidApi>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Mermaid can only render in the browser."));
      return;
    }

    const mermaidWindow = window as MermaidWindow;
    const existing = mermaidWindow.mermaid;
    if (existing) {
      resolve(existing);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-mermaid]",
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (mermaidWindow.mermaid) {
          resolve(mermaidWindow.mermaid);
          return;
        }
        reject(new Error("Mermaid unavailable."));
      });
      existingScript.addEventListener("error", () =>
        reject(new Error("Failed to load Mermaid.")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = MERMAID_SRC;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-mermaid", "true");
    script.onload = () => {
      if (mermaidWindow.mermaid) {
        resolve(mermaidWindow.mermaid);
        return;
      }
      reject(new Error("Mermaid unavailable."));
    };
    script.onerror = () => reject(new Error("Failed to load Mermaid."));
    document.head.appendChild(script);
  });

export default function MermaidDiagram({
  code,
  className,
}: MermaidDiagramProps) {
  const diagramId = useId().replace(/[:]/g, "-");
  const diagram = useMemo(() => code.trim(), [code]);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const mermaidWindow = window as MermaidWindow;

    const renderDiagram = async () => {
      try {
        const mermaid = await loadMermaid();
        if (!mermaid) {
          throw new Error("Mermaid unavailable.");
        }

        if (!mermaidWindow.__mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "loose",
            themeVariables,
          });
          mermaidWindow.__mermaidInitialized = true;
        }

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${diagramId}`,
          diagram,
        );
        if (isActive) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch {
        if (isActive) {
          setError("Unable to render diagram.");
        }
      }
    };

    renderDiagram();

    return () => {
      isActive = false;
    };
  }, [diagram, diagramId]);

  return (
    <div
      className={`mermaid-diagram rounded-xl border border-white/10 bg-surface-solid p-4 ${
        className ?? ""
      }`}
    >
      {error ? (
        <div className="space-y-2">
          <p className="text-rose-300 text-sm">{error}</p>
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/20 p-3 text-ink-body text-xs">
            {diagram}
          </pre>
        </div>
      ) : svg ? (
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid returns SVG markup that must be mounted as HTML.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="text-ink-muted text-sm">Rendering diagram…</div>
      )}
    </div>
  );
}
