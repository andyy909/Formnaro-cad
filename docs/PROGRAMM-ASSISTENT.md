# Formnaro application assistant

Use the AI chat to ask about Formnaro, find a tool, or request a demonstration.
The assistant uses the configured AI provider.

- “Where is the wall thickness map? Show me the menu.”
- “What is the difference between a loft and a sweep?”
- “Open AI settings and show me the context sizes.”
- “Show me how to build a plate with a hole.”

The assistant can look up a local catalogue of tools, their requirements and
known controls in the current workspace. Object names and document text are
data and grant no additional permissions.

During a walkthrough, a blue window border, enlarged pointer and explanation
show the current step. Tabs and menus open in the real application. Pause,
speed and stop are available in the playback controls. Press Esc, click
outside the controls or switch applications to interrupt. Disabled tools
stay disabled. The assistant can explain the selection they require.

Modelling demonstrations show intermediate previews. Apply confirms the
result in one Undo step. Discard preserves the prior model. The available
verification results describe the checks performed. An application question
leaves any existing modelling preview available.

Walkthroughs use named Formnaro controls. The interface offers no operating
system mouse, arbitrary keystrokes, selectors, applications or file paths.
It can show a file dialog and leaves the file choice to the user. Modelling
still uses the usual preview and isolated computation paths.

At your request the assistant can append a short note to the current
provider's context file. Existing text is preserved. Provider, size and
revision checks limit this operation and credential protection still applies.
Use the current model to verify context notes before acting on them.

Provider requests, including follow-up help and corrections, are included
in usage estimates. Local pointer movements use no API tokens. Internally,
`programAssistant` extends the shared context and chat replies use
`assistant.kind` values `help`, `guide`, `demonstrate` or `note`. The renderer
validates targets before playback. The external CAD `preview` contract is
unchanged.
