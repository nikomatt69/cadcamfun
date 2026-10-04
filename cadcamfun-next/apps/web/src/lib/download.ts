export const download = (filename: string, content: string, type = "text/plain") => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement("a"), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
