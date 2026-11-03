# AI and automation in Formnaro

Formnaro's CAD tools, project files and exports work offline. **Settings → AI / API** lets you configure the optional in-app assistant or enable the local interface for an external agent. These are separate paths.

## Use the in-app assistant

1. Open **Settings → AI / API**, choose a provider and configure its available sign-in or API-key option. Credentials are stored separately from model files.
2. Select a model from the provider's list. Cloud requests can include the model context and attachments used for the task.
3. Ask for an operation and inspect its preview. Apply the preview when it matches your intent. An applied batch is one Undo step.

The usage view reports available token counts and estimates costs for models with a known standard tariff. Account invoices and subscription allowances come from the provider. [Provider setup and usage details in German](KI-ANBIETER-UND-AGENTEN.md)

## Connect an external MCP client

1. Start Formnaro and enable its local interface under **Settings → AI / API**. Copy the connection file path shown there.
2. In your client's MCP settings, run the Python 3.10+ adapter with the script path and the connection path. In a portable package, use the bundled `ai/offlinecad_ai.py` in the program folder. In a source checkout, use `scripts/offlinecad_ai.py` as shown below. The adapter reads the connection token locally. Keep the file and token private. [Example client configuration](../ai/mcp-config-example.json)

   ```powershell
   python scripts/offlinecad_ai.py --connection "C:/PATH/TO/ai-bridge.json" --mcp --profile compact
   ```

3. Read `offlinecad_context` and `offlinecad_scene` first. For a model edit, preview the command batch against the scene's revision and inspect its result. Apply the returned preview ID against that same revision. After a revision conflict, read the current scene and prepare a new preview.

The adapter connects to Formnaro over loopback. Any cloud connection used by the external client is governed by that client. The published r36 adapter supports MCP handshake versions up to `2025-11-25`. The updated source adapter also supports `2026-07-28` over stdio. [MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [Formnaro command contract](../ai/OfflineCAD-KI-Kontext.json)
