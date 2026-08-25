#!/usr/bin/env python3
"""
Audit the static export for SEO regressions.

Run from the repo root after `pnpm --filter @4mica/web build`:

    python3 apps/web/scripts/seo-audit.py            # human-readable table
    python3 apps/web/scripts/seo-audit.py --json     # full machine-readable report

Reports broken internal links, every external link, and a per-page table of
title/description lengths, canonical, robots directive, h1 count, and the
JSON-LD types present. Exits non-zero when an internal link is broken.

The "issues" column flags a page when: the title is empty or over 62 chars, an
indexable page's description falls outside 70-162 chars, there is not exactly
one h1, the canonical is missing or relative, or og:image is absent.
"""

import collections
import json
import pathlib
import re
import sys

OUT = pathlib.Path("apps/web/out")

TITLE_MAX = 62
DESC_MIN, DESC_MAX = 70, 162

href_re = re.compile(r'(?:href|src)="([^"]+)"')
canon_re = re.compile(r'<link rel="canonical" href="([^"]+)"')
title_re = re.compile(r"<title>(.*?)</title>", re.S)
desc_re = re.compile(r'<meta name="description" content="([^"]*)"')
robots_re = re.compile(r'<meta name="robots" content="([^"]*)"')
ogimg_re = re.compile(r'<meta property="og:image" content="([^"]*)"')
h1_re = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
ld_re = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
tag_re = re.compile(r"<[^>]+>")


def page_url(path):
    rel = path.relative_to(OUT).as_posix()
    return "/" if rel == "index.html" else "/" + rel[: -len(".html")]


def exists(link):
    """Resolve an internal link against the exported file tree."""
    target = link.split("#")[0].split("?")[0]
    if target in ("", "/"):
        return (OUT / "index.html").exists()
    target = target.lstrip("/")
    candidates = (
        target,
        f"{target}.html",
        f"{target}/index.html",
        f"{target.rstrip('/')}.html",
    )
    return any((OUT / candidate).exists() for candidate in candidates)


def jsonld_types(html):
    types = set()
    for block in ld_re.findall(html):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        for node in data.get("@graph", [data]):
            if isinstance(node, dict) and node.get("@type"):
                types.add(node["@type"])
    return sorted(types)


def collect():
    if not OUT.exists():
        sys.exit(f"{OUT} not found — run `pnpm --filter @4mica/web build` first.")

    broken = collections.defaultdict(set)
    external = collections.Counter()
    pages = []

    for file in sorted(OUT.rglob("*.html")):
        html = file.read_text(errors="ignore")
        url = page_url(file)

        for link in href_re.findall(html):
            if link.startswith(("mailto:", "tel:", "data:", "javascript:", "#")):
                continue
            if link.startswith(("http://", "https://", "//")):
                external[link.split("#")[0]] += 1
            elif not exists(link):
                broken[link].add(url)

        if "/_next/" in str(file) or file.name == "404.html":
            continue

        title = title_re.search(html)
        description = desc_re.search(html)
        canonical = canon_re.search(html)
        robots = robots_re.search(html)
        og_image = ogimg_re.search(html)
        title_text = tag_re.sub("", title.group(1)).strip() if title else ""
        description_text = description.group(1) if description else ""

        pages.append(
            {
                "url": url,
                "title": title_text,
                "title_len": len(title_text),
                "description": description_text,
                "desc_len": len(description_text),
                "canonical": canonical.group(1) if canonical else None,
                "robots": robots.group(1) if robots else None,
                "og_image": og_image.group(1) if og_image else None,
                "h1_count": len(h1_re.findall(html)),
                "jsonld_types": jsonld_types(html),
            }
        )

    return {
        "broken_internal": {k: sorted(v) for k, v in sorted(broken.items())},
        "external_links": sorted(external),
        "pages": sorted(pages, key=lambda page: page["url"]),
    }


def flags(page):
    issues = []
    if not 0 < page["title_len"] <= TITLE_MAX:
        issues.append("title")
    if page["robots"] != "noindex" and not DESC_MIN <= page["desc_len"] <= DESC_MAX:
        issues.append("description")
    if page["h1_count"] != 1:
        issues.append(f"h1={page['h1_count']}")
    if not (page["canonical"] or "").startswith("https://"):
        issues.append("canonical")
    if not page["og_image"]:
        issues.append("og:image")
    return issues


def main():
    report = collect()

    if "--json" in sys.argv:
        print(json.dumps(report, indent=2))
        return 1 if report["broken_internal"] else 0

    if report["broken_internal"]:
        print("BROKEN INTERNAL LINKS")
        for link, sources in report["broken_internal"].items():
            print(f"  {link}  <- {', '.join(sources)}")
    else:
        print("Internal links: OK (no broken targets)")

    print(f"\n{'URL':<36}{'title':>6}{'desc':>6}{'h1':>4}  {'robots':<14}issues")
    for page in report["pages"]:
        issues = ", ".join(flags(page)) or "-"
        print(
            f"{page['url']:<36}{page['title_len']:>6}{page['desc_len']:>6}"
            f"{page['h1_count']:>4}  {str(page['robots']):<14}{issues}"
        )

    print(f"\nExternal hosts referenced ({len(report['external_links'])}):")
    for link in report["external_links"]:
        print(f"  {link}")

    return 1 if report["broken_internal"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
