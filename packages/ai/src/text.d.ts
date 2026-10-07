/** Files imported as text (`import prompt from "./x.txt" with { type: "text" }`): the tool prompts. */
declare module "*.txt" {
  const content: string
  export default content
}
