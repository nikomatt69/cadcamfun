/** Files imported as text (`import prompt from "./x.txt" with { type: "text" }`): prompts and skill playbooks. */
declare module "*.txt" {
  const content: string
  export default content
}

declare module "*.md" {
  const content: string
  export default content
}
