# Solid workspace

Solid offers a feature toolbar and a left-hand manager for users familiar with
SolidWorks. It uses Formnaro's own modelling tools and file formats.

## Create and edit parts

1. Select **Solid** from the workspace modes.
2. Start an extruded boss from the Features tab. The native sketch editor
   supports rectangles, circles, closed contours, dimensions and formulas.
3. Set the sketch dimensions and extrusion height, preview, and apply.
4. For an extruded cut, select a visible, unlocked part and pick its reference
   face. The cut depth starts at that face.
5. The same workspace offers fillets, chamfers, holes, shell, patterns and
   mirroring. Loft and sweep require compatible native sketches. The current
   selection determines which commands are available.

Use the Sketch, Inspect, Assembly and Mesh & Convert tabs for related tasks.
Additional Formnaro tools are available through the menus. The left manager
shows the model tree, properties, primitives or document options. Double-click
an object to open its properties. Choose a standard view from the tree or use
the active workplane for a new sketch. Feature dialogs open in the manager.
The sketch editor and file and AI dialogs retain their own windows.

New primitives are native CAD bodies. Existing meshes remain editable. Normal
mode keeps its own CAD, mesh or automatic preference. The unit is millimetres
and Z points up. Open the optional AI chat from the top-right control.

## Context menu

Right-click a model part or its tree item to open the context menu. Selecting
a face lets commands such as sketch-on-face and extruded cut reuse that native
face. Right-clicking a member of an existing multi-selection keeps the
selection. Locked parts allow inspection and disable commands that modify them.

When a tool is open, the menu offers Cancel and, after a valid preview, Apply.
Right-drag rotates the view. In context-menu settings you can add, remove,
reorder or reset up to 32 entries per mode. Enabled function plugins can be
assigned. An unavailable plugin keeps its assignment and is disabled.

## Navigation and shortcuts

With Solid navigation enabled, drag with the middle button to rotate.
Hold Ctrl to pan or Shift to zoom. The mouse wheel also zooms.

| Shortcut | Action |
| --- | --- |
| **S** | Quick tools |
| **Space** | View orientation |
| **F** | Fit model |
| **Ctrl+1** through **Ctrl+7** | Front, rear, left, right, top, bottom and isometric |

Solid settings store navigation, shortcuts and the starting tab independently.
Typing and active tool sessions retain their existing controls. Save, copy,
paste and Undo retain their standard shortcuts.

Apply or cancel the current operation before switching workspace. The mode
switch preserves model geometry and Undo history and restores the saved
sidebar layout when you leave.

The implementation is in `src/cad-solid-state.js`, `src/cad-solid-ui.js` and
`src/cad-solid.css`. Preferences use `offlinecad-workbench-mode-v1` and
`offlinecad-solid-settings-v1` or `Daten/solid-einstellungen.json`. Context
menus use `offlinecad-context-menu-v1` and `Daten/rechtsklick-menues.json`.
The workspace does not require a newer project format.
