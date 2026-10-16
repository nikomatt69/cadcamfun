# Stock, origin and fixtures

- The stock is a box in the coordinates of the G-code; its top is Z0 by default and cuts go to negative Z.
- Origin: workpiece centre, corner, or custom; the verification uses the same origin as the generator, so state it when you set it.
- The vise, clamps or plate are setup fields (`workholding`, `clampDepth`, ... in the operation params, see machines-and-axes); with `workholdingConfigured: true` they are passed to the verification automatically. Other fixtures: describe them as boxes (`fixtures`: id and min/max X, Y, Z in program coordinates) so a toolpath into them is caught.
- Describe the holder (`holderDiameter`, `stickout`) when you know it; unknown means not checked, not safe.
- A second setup (flipping the part) is a new operation with its own stock; do not reuse the first one's depths.
