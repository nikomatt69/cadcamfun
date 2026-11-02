# The library: tools, materials, machines, costs and parts

The libraries are the person's data, shared with the screens: whatever you write is what the person sees in the Library and Costs screens, and what the CAM actions read. Writing is `library_edit` (and `parts` for reusable components). Nothing here is generated for you: every value comes from the person, a datasheet they attached, or a standard you can cite.

## Before you write
1. Read first: `library` action `lookup_tool`, `lookup_material`, `lookup_machine_config` (a query; an empty one lists the newest) or `lookup_component`. If a row exists, replace it with `id` and keep every field you do not change: a replace sends the whole row.
2. An id that does not exist is refused; there is no "create with this id". Omit `id` to create.
3. Ask for the number you do not have (flutes, shank, spindle ceiling) instead of guessing it. An optional field you do not know is left out, never filled with a typical value.

## Cutters (`upsert_tool`)
- Required: `name`, `type`, `diameter` (mm), `material` (carbide, HSS...). The `type` is what the operation says the cutter IS: the skill composed-cam-programs lists the types the generator accepts.
- `cuttingLength`, `totalLength`, `shankDiameter`, `holderDiameter`, `holderLength` and `stickout` (mm) are what the verification uses for reach and collisions: without them it reports "not checked", not "safe". Put in what the datasheet or the holder drawing says.
- `cornerRadius` (0 is sharp), `tipAngle`, `threadPitch` draw the cutter model: include them only for a cutter that has them (a bull-nose radius, a V-bit angle, a thread mill pitch).

## Materials (`upsert_material`)
`properties` is a free map (`{name: number|string|boolean}`) with units in the key or the description. The machining materials the CAM kernel uses for cutting data (ISO P/M/K/N/S/H, Kienzle values) are the built-in table of `cam` action `materials`, not these rows: a library material gives the name and the properties (density, hardness) the person wants on screen. When an action asks for a material family (`cam` action `compare_setups` `params.material`), give the kernel family and say which library row it stands for.

## Machines (`upsert_machine_config`)
- `kind` mill|lathe|3Dprinter, `controller` (the real control name), `post` (generic|fanuc|grbl|linuxcnc|haas|siemens|heidenhain|okuma|mazak), `workVolume`, `spindle`, `feed`, `rotary`, `turning`, `workOffsets`, `probing`. Preserve measured limits and the manufacturer `reference`.
- A configuration the kernel can machine is used by `cam` action `manufacture` / `cam_edit` action `manufacture` as `machineConfig`, and it wins over a preset id. One without a spindle ceiling or with a kind the kernel does not machine is refused with the reason: read it, ask for the missing number, write again.
- After saving, read it back with `lookup_machine_config` and run `cam` action `machine` or `manufacture` with `planOnly` to see the limits the kernel really took.

## Costs (`set_cost`) and defaults (`set_default`)
- `kind: "material"` (`materialId`, `costPerUnit`, `wasteFactor`, `minimumCharge`), `"tool_wear"` (`toolId`, `wearRatePerMeter`, `replacementCost`, `replacementThreshold`) or `"operation"` (`name`, `machineHourlyRate`, `operatorHourlyRate`, `setupTime` in minutes); `currencyCode` on any. Omit `id` to create, give it to update.
- You can write costs but no action reads them back and none computes a price. Do not quote a price from them: take the machining time from `cam` action `setup_sheet` or the analysis, ask for the rates, and show the arithmetic. The Costs screen does the estimate from these rows.
- `set_default` (`materialId`, `toolId`, `machineConfigId`, any subset) seeds new operations of the open project.

## Reusable parts (`parts`)
`parts` action `save` gathers existing elements (`ids`) into a named component, children relative to its origin; `insert` places a saved `componentId` with an optional `transform` and returns new drawing ids; `delete` removes the saved component, not its instances. Look it up with `library` action `lookup_component` (saved ids) and do not confuse these with `component_list` (instances on the open canvas, with canvas element ids). After an insert, run `cad` action `check`.

## Deleting
`library_edit` action `delete` (`kind`, `id`, `confirm: true`) only when the person asked for it; the result says what still refers to the row. `confirm` is never permission by itself.
