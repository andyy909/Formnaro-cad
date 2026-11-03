# Formnaro repository instructions

Read `work/kontext.txt` first when it exists. Record significant local work
there. Keep that development history outside Git. In a fresh checkout, read
[the project context](docs/PROJEKTKONTEXT.md) and add significant general
changes there. Keep personal models, profiles and credentials out of shared
documentation.

Use Formnaro as the product name. Retain the existing OfflineCAD identifiers
and profile paths for compatibility.

## Direct modelling in Formnaro

1. Read `offlinecad_context` and `offlinecad_scene` through the local MCP server.
2. Compute and inspect an `offlinecad_preview` against the current revision.
3. Apply the preview with `offlinecad_apply` when the user requested the model
   change. Preserve sources, parameters, locks and unrelated parts. Connection
   checks are read-only.

If the MCP tools are unavailable, run the equivalent command with Python 3.10+
while Formnaro is open and the local AI interface is enabled.

```text
python scripts/offlinecad_ai.py --connection "<profile path>/ai-bridge.json" <command>
```

Use the connection path displayed in Formnaro. The default Windows profile
directory is `%APPDATA%/offlinecad`. The client reads the local access token
internally, so no cloud API key is required. Keep the connection file and token
out of output, prompts and packages.

Apply `context.designFreedom` from
[`ai/FORMNARO-MODELLIERFREIRAUM.json`](ai/FORMNARO-MODELLIERFREIRAUM.json)
when dimensions or design details are unspecified, including for doors and
windows at every modelling strictness level. The bridge provides this rule
during connection and in its context.
