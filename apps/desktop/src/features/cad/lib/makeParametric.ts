/**
 * Makes an element of the drawing parametric: the same solid as a history of named parameters (`parametricFromElement`), as the
 * element the editor stores. The assistant does the same through `cad_edit` `parametric_convert`; this is the person's button.
 */
import { CONVERTIBLE_TYPES, parametricFromElement } from "@cadcamfun/core"

export type ParametricTwin =
  | { readonly ok: true; readonly twin: Record<string, unknown>; readonly notes: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

/** True for the elements that have measures to turn into parameters (not a mesh, a boolean, text or a part that already is parametric). */
export const canMakeParametric = (element: { readonly type?: unknown } | undefined): boolean =>
  element !== undefined && typeof element.type === "string" && CONVERTIBLE_TYPES.includes(element.type)

/** The parametric element for `element`, placed where it stands and looking as it does; `depth` extrudes a flat shape. */
export const makeParametric = (element: Readonly<Record<string, unknown>>, options: { readonly depth?: number } = {}): ParametricTwin => {
  const converted = parametricFromElement(element, options.depth === undefined ? {} : { depth: options.depth })
  if ("error" in converted) return { ok: false, error: converted.error }
  const { name, ...carried } = converted.carry
  return {
    ok: true,
    notes: converted.notes,
    twin: { ...carried, type: "parametric", name: `${typeof name === "string" ? name : String(element["type"])} (parametric)`, history: converted.history, ...converted.placement }
  }
}
