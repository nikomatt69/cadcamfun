import { describe, expect, test } from "bun:test"
import { renderAssistantMarkdown } from "../src/features/ai/lib/markdown.ts"
import { Window } from "happy-dom"

const parse = (text: string) => {
  const window = new Window()
  const body = window.document.body
  body.innerHTML = renderAssistantMarkdown(text)
  return body
}

describe("assistant Markdown presentation", () => {
  test("renders CAD dimensions, a machining table and G-code without altering values", () => {
    const body = parse("## Bracket\n\n**Stock**: `80 x 40 x 8 mm`\n\n- Drill two holes\n- Verify clearance\n\n| Cutter | Feed |\n| --- | --- |\n| 6 mm | 800 mm/min |\n\n```gcode\nG21\nG1 X40.000 F800\n```")
    expect(body.querySelector("h2")?.textContent).toBe("Bracket")
    expect(body.querySelector("strong")?.textContent).toBe("Stock")
    expect(body.querySelectorAll("li")).toHaveLength(2)
    expect(body.querySelector("td")?.textContent).toBe("6 mm")
    expect(body.querySelector("pre code")?.textContent).toBe("G21\nG1 X40.000 F800")
    expect(body.querySelector("pre")?.getAttribute("data-language")).toBe("gcode")
  })

  test("model HTML, scripts and SVG remain inert text", () => {
    const body = parse('<script>alert(1)</script>\n\n<svg onload="alert(1)"></svg>\n\n<img src="https://remote.test/pixel" onerror="alert(1)">')
    expect(body.querySelector("script,svg,img")).toBeNull()
    expect(body.textContent).toContain("<script>alert(1)</script>")
    expect(body.querySelector("[onload],[onerror]")).toBeNull()
  })

  test("links allow only explicit web URLs and images never load", () => {
    const body = parse('[Unsafe](javascript:alert%281%29) [Encoded](javascript&#58;alert%281%29) [File](file:///tmp/a) [Settings](/settings) [Source](https://example.com/?x=1&y=2)\n\n![Drawing](https://remote.test/pixel.png)')
    const links = body.querySelectorAll("a")
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute("href")).toBe("https://example.com/?x=1&y=2")
    expect(links[0]?.getAttribute("rel")).toContain("noopener")
    expect(body.querySelector("img")).toBeNull()
    expect(body.textContent).toContain("Drawing")
  })

  test("code and language names cannot inject markup; incomplete streamed fences render", () => {
    const body = parse('```gcode\" onclick=\"alert(1)\n<img src=x onerror=alert(1)>\n')
    expect(body.querySelector("img,[onclick],[onerror]")).toBeNull()
    expect(body.querySelector("code")?.textContent).toBe("<img src=x onerror=alert(1)>")
    expect(parse("**Building the").textContent).toContain("Building the")
  })
})
