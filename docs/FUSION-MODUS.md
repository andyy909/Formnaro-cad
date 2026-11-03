# Fusion workspace

Fusion offers a toolbar, browser and construction steps for users familiar
with Autodesk Fusion. It uses Formnaro's modelling tools, projects and formats.

## Layout

- **Top toolbar** groups solid, sketch, mesh and utility commands by task.
  Open a group's menu to see its additional commands.
- **Left browser** shows the model tree, visibility and retained sources.
  Insert primitives from the browser or use its document settings to configure
  the workplane.
- **Right panel** shows properties when you double-click an item or select a
  construction step. Editing tools retain their preview, apply and cancel
  controls. Open the optional AI chat from the top-right control.
- **Bottom construction steps** show retained sources in dependency order.
  Select a step to inspect its source and properties. The steps represent
  model dependencies. Features cannot be reordered or played back here.
- Standard views remain at the top right. The bottom navigation bar also
  offers fit, projection and orientation controls.

## First model

1. Select **Fusion** and start an extrusion from the solid tools.
2. Set the contour and dimensions in the native sketch editor. Preview and
   apply to create a native CAD body.
3. To make a cut, select an unlocked part, start an extrusion cut and pick its
   reference face.
4. Use fillet, chamfer, hole, shell, pattern and mirror on suitable selections.
   Loft and sweep require compatible native sketches.

New primitives are native CAD bodies. The mesh tab edits existing meshes.
Normal mode keeps its own CAD and mesh preferences. The unit is millimetres and
Z points up. Exchange and project formats follow Formnaro's existing support.

## Mouse and keyboard

With Fusion navigation enabled, drag with the middle button to pan.
Hold Shift while middle-dragging, or right-drag, to rotate. Scroll to zoom.

| Shortcut | Action |
| --- | --- |
| **S** | Search and select a tool |
| **E**, **F**, **H** | Extrude, fillet, hole |
| **M**, **I**, **J** | Move, measure, joints |

Fusion settings store navigation, shortcuts and the starting tab independently.
The mode also has its own editable context menu. Text inputs, active tool
sessions and standard save, copy, paste and Undo shortcuts retain their
existing controls.

Apply or cancel an open edit before switching modes. The switch preserves
geometry and Undo history and restores the saved sidebar arrangement when you
leave.

The implementation is in `src/cad-fusion-state.js`, `src/cad-fusion-ui.js` and
`src/cad-fusion.css`. Preferences use `offlinecad-workbench-mode-v1` and
`offlinecad-fusion-settings-v1` or `Daten/fusion-einstellungen.json`.
Previously saved context-menu layouts keep their existing mode assignments.
