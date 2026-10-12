declare module "occt-import-js" {
  export interface OcctMesh { name: string; color?: [number, number, number]; attributes: { position: { array: number[] } }; index: { array: number[] }; brep_faces: Array<{ first: number; last: number; color: [number, number, number] | null }> }
  export interface OcctNode { name: string; meshes: number[]; children: OcctNode[] }
  export interface OcctResult { success: boolean; root?: OcctNode; meshes?: OcctMesh[] }
  export interface OcctModule {
    ReadStepFile(data: Uint8Array, parameters: Record<string, unknown>): OcctResult
    ReadIgesFile(data: Uint8Array, parameters: Record<string, unknown>): OcctResult
    ReadBrepFile(data: Uint8Array, parameters: Record<string, unknown>): OcctResult
  }
  export default function createOcct(options?: { wasmBinary?: Uint8Array; locateFile?: (path: string) => string; print?: (text: string) => void; printErr?: (text: string) => void }): Promise<OcctModule>
}
