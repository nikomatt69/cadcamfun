/** `solid-motionone` for `bun test`: the same components, rendering plain elements without animation. */
import { createComponent, spread } from "solid-js/web"
import { splitProps, type JSX } from "solid-js"

const ANIMATION = ["initial", "animate", "exit", "transition", "hover", "press", "inView", "variants", "options", "tag"] as const

const element = (tag: string) => (props: Record<string, unknown>): JSX.Element => {
  const [, rest] = splitProps(props, ANIMATION)
  const node = document.createElement(tag)
  spread(node, rest, false, false)
  return node
}

export const Motion = new Proxy({} as Record<string, (props: Record<string, unknown>) => JSX.Element>, {
  get: (_target, tag: string) => element(tag)
})
export const Presence = (props: { children?: JSX.Element }): JSX.Element => props.children
export const MotionComponent = (props: Record<string, unknown>): JSX.Element => createComponent(element((props.tag as string) ?? "div"), props)
