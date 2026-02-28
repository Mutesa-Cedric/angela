import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

export const ENTITY_LINK_EVENT = "angela:entity-link-click";
const ENTITY_ID_REGEX = /\b\d{2,7}_[A-Za-z0-9]{6,}\b/g;

export interface RenderMarkdownOptions {
  entityLinks?: boolean;
  onEntityClick?: (entityId: string) => void;
}

export function markdownToSafeHtml(markdown: string): string {
  const source = (markdown || "").trim();
  if (!source) return "";

  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
  });
}

export function renderMarkdownInto(
  el: HTMLElement,
  markdown: string,
  options: RenderMarkdownOptions = {},
): void {
  const html = markdownToSafeHtml(markdown);
  el.innerHTML = html || "<p>No content.</p>";

  const shouldLinkEntities = options.entityLinks ?? true;
  if (!shouldLinkEntities) return;

  linkifyEntityIdsInElement(el);
  bindEntityLinks(el, options.onEntityClick);
}

function bindEntityLinks(el: HTMLElement, onEntityClick?: (entityId: string) => void): void {
  for (const anchor of Array.from(el.querySelectorAll<HTMLAnchorElement>("a"))) {
    const href = anchor.getAttribute("href") || "";
    const fromHref = extractEntityIdFromHref(href);
    const fromData = anchor.dataset.entityId;
    const entityId = fromData || fromHref;
    if (!entityId) continue;

    anchor.dataset.entityId = entityId;
    anchor.classList.add("entity-link");
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onEntityClick) {
        onEntityClick(entityId);
      } else {
        window.dispatchEvent(new CustomEvent(ENTITY_LINK_EVENT, { detail: { entityId } }));
      }
    });
  }
}

function extractEntityIdFromHref(href: string): string | null {
  if (!href) return null;
  if (href.startsWith("entity://")) {
    return decodeURIComponent(href.slice("entity://".length));
  }
  if (href.startsWith("#entity:")) {
    return decodeURIComponent(href.slice("#entity:".length));
  }
  return null;
}

function linkifyEntityIdsInElement(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    const text = textNode.nodeValue || "";
    if (!parent || !text) {
      node = walker.nextNode();
      continue;
    }
    const tag = parent.tagName;
    if (tag === "A" || tag === "CODE" || tag === "PRE" || tag === "SCRIPT" || tag === "STYLE") {
      node = walker.nextNode();
      continue;
    }
    ENTITY_ID_REGEX.lastIndex = 0;
    if (ENTITY_ID_REGEX.test(text)) {
      textNodes.push(textNode);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || "";
    ENTITY_ID_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    let last = 0;
    const fragment = document.createDocumentFragment();
    let hasMatch = false;

    while ((match = ENTITY_ID_REGEX.exec(text)) !== null) {
      hasMatch = true;
      const entityId = match[0];
      const idx = match.index;

      if (idx > last) {
        fragment.appendChild(document.createTextNode(text.slice(last, idx)));
      }

      const a = document.createElement("a");
      a.href = `entity://${encodeURIComponent(entityId)}`;
      a.dataset.entityId = entityId;
      a.className = "entity-link";
      a.textContent = entityId;
      fragment.appendChild(a);

      last = idx + entityId.length;
    }

    if (!hasMatch) continue;
    if (last < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(last)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

