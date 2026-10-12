import { Marked, Renderer } from "marked"

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char] ?? char)

const renderer = new Renderer()
renderer.html = ({ text }) => escapeHtml(text)
renderer.code = ({ text, lang }) => `<pre data-language="${escapeHtml((lang ?? "").split(/\s/)[0] ?? "")}"><code>${escapeHtml(text)}</code></pre>`
renderer.image = ({ text }) => `<span class="assistant-image-reference">${escapeHtml(text)}</span>`
renderer.link = function ({ href, tokens }) {
  const label = this.parser.parseInline(tokens)
  try {
    const url = new URL(href)
    if (url.protocol !== "https:" && url.protocol !== "http:") return label
    return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`
  } catch {
    return label
  }
}

// Raw model HTML is text, and images never make network requests. Only the built-in Markdown renderer emits markup.
const markdown = new Marked({ renderer, async: false, gfm: true, breaks: true })

export const renderAssistantMarkdown = (text: string): string => {
  try {
    return markdown.parse(text, { async: false })
  } catch {
    return `<p>${escapeHtml(text)}</p>`
  }
}
