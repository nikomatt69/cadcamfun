declare module "/wasm/optimizer/cad_cam_optimizer.js" {
  export function init(): void;

  export class ArcData {
    free(): void;
    constructor(
      center_x: number,
      center_y: number,
      radius: number,
      start_angle: number,
      end_angle: number,
      is_clockwise: boolean
    );
    center_x: number;
    center_y: number;
    radius: number;
    start_angle: number;
    end_angle: number;
    is_clockwise: boolean;
  }

  export class CADCAMOptimizer {
    free(): void;
    constructor();
    optimize_mesh(vertices: Float32Array, indices: Uint32Array, reduction_factor: number): MeshData;
    csg_operation(
      operation: string,
      mesh_a_vertices: Float32Array,
      mesh_a_indices: Uint32Array,
      mesh_b_vertices: Float32Array,
      mesh_b_indices: Uint32Array
    ): MeshData;
    calculate_normals(vertices: Float32Array, indices: Uint32Array): Float32Array;
    batch_geometries(geometries: any): MeshData;
    parse_gcode(gcode: string): GCodePoint[];
    optimize_toolpath(points: any): GCodePoint[];
    frustum_cull(view_projection_matrix: Float32Array, bounding_boxes: any): Array<any>;
    calculate_lod_levels(camera_distance: number, object_sizes: Float32Array): Uint8Array;
    create_instances(geometries: any): any;
    calculate_snap_points(vertices: Float32Array, threshold: number): Float32Array;
    detect_features(vertices: Float32Array, indices: Uint32Array): any;
  }

  export class GCodePoint {
    free(): void;
    constructor(x: number, y: number, z: number);
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly feed_rate: number | undefined;
    readonly is_rapid: boolean;
    readonly is_arc: boolean;
    readonly line_number: number;
    command: string;
    get arc_data(): ArcData | undefined;
    set arc_data(value: ArcData | null | undefined);
  }

  export class MeshData {
    free(): void;
    constructor(vertices: Float32Array, indices: Uint32Array);
    vertices: Float32Array;
    indices: Uint32Array;
    normals: Float32Array;
  }

  export class WorkerOptimizer {
    free(): void;
    constructor();
    process_message(msg_type: string, data: any): any;
  }

  export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

  const initWasm: (module_or_path?: InitInput | Promise<InitInput>) => Promise<any>;
  export default initWasm;
}
