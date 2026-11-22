# /// script
# [tool.orcaslicer.plugin]
# name = "Formnaro Chat"
# version = "0.1.1"
# description = "Gemeinsamer KI-Chat für Formnaro und OrcaSlicer"
# author = "Formnaro"
# ///
"""OrcaSlicer sidebar for the local Formnaro Agenten-Chat."""

import http.client
import json
import os
import re
import threading
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import orca


INSTANCE = "system"
DEFAULT_PROFILE = Path(os.environ.get("APPDATA", str(Path.home()))) / "offlinecad"
CONNECTION = Path(os.environ.get("FORMNARO_ORCA_CONNECTION_FILE", DEFAULT_PROFILE / "ai-bridge.json"))
MAX_REPLY = 384_000
DISCONNECTED = "Formnaro starten und im Agenten-Chat die lokale Verbindung einschalten."

PAGE = r"""<!doctype html>
<html lang="de">
<meta charset="utf-8">
<style>
:root{color-scheme:light dark} html,body{margin:0;height:100%;overflow:hidden}
body{display:grid;grid-template-rows:auto 1fr auto;background:var(--orca-bg);color:var(--orca-fg);font:14px system-ui,sans-serif}
header,form{padding:12px;min-width:0} header{border-bottom:1px solid var(--orca-border,#8886)}
h1{font-size:15px;font-weight:650;margin:0 0 4px} #connection,#status{font-size:12px;color:var(--orca-muted,inherit);overflow-wrap:anywhere}
#log{overflow:auto;min-height:0;padding:10px 12px;display:flex;flex-direction:column;gap:9px}
article{padding:8px 10px;border:1px solid var(--orca-border,#8886);border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;flex:none}
article.user{border-inline-start:3px solid var(--orca-accent,#009688)}
article.tool,article.notice{font-size:12px;color:var(--orca-muted,inherit);padding:5px 8px}
article.error{border-inline-start:3px solid #c9564e}
form{display:grid;gap:8px;border-top:1px solid var(--orca-border,#8886)}
textarea{box-sizing:border-box;display:block;width:100%;min-height:64px;max-height:160px;resize:vertical;font:inherit}
.actions{display:flex;gap:8px;justify-content:flex-end}
button{padding:6px 10px} #send{font-weight:650} [hidden]{display:none!important}
</style>
<header><h1>Formnaro KI</h1><div id="connection" role="status">Suche Formnaro …</div></header>
<div id="log" role="log" aria-label="Gemeinsamer Agentenverlauf" aria-live="polite"></div>
<form id="compose">
 <label for="prompt">Auftrag an den Agenten</label>
 <textarea id="prompt" maxlength="10000" placeholder="Zum Beispiel: Ändere den Halter in Formnaro und slice ihn erneut."></textarea>
 <div class="actions"><button id="cancel" type="button" hidden>Abbrechen</button><button id="send" disabled>Senden</button></div>
 <div id="status" role="status"></div>
</form>
<script>
const $ = id => document.getElementById(id);
let current = {}, lastEntries = '', outstanding = null, retry = null;
function display(state) {
  current = state;
  $('connection').textContent = state.model ? [state.provider, state.model].join(' · ') : 'Keine Verbindung zu Formnaro';
  const report = state.message || (state.ready ? state.status : 'Anbieter und Modell in Formnaro wählen.');
  $('status').textContent = report || '';
  $('send').disabled = !state.ready || state.busy || !!outstanding;
  $('cancel').hidden = !state.busy || !state.requestId;
  const signature = JSON.stringify(state.entries || []);
  if (signature !== lastEntries) {
    lastEntries = signature;
    const log = $('log'), atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    log.replaceChildren(...(state.entries || []).map(entry => {
      const row = document.createElement('article');
      row.className = entry.kind;
      row.textContent = entry.text;
      return row;
    }));
    if (atEnd) log.scrollTop = log.scrollHeight;
  }
}
window.orca.onMessage(message => {
  if (message.kind === 'state') {
    display(message.state);
  } else {
    if (outstanding && message.id === outstanding.id) {
      if (message.kind === 'accepted') {
        if ($('prompt').value.trim() === outstanding.prompt) $('prompt').value = '';
        retry = null;
      } else retry = outstanding;
      outstanding = null;
    }
    if (message.message) $('status').textContent = message.message;
    $('send').disabled = !current.ready || current.busy || !!outstanding;
  }
});
$('compose').onsubmit = event => {
  event.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt || $('send').disabled) return;
  // The Python side binds this WebView ID to an independent Formnaro request ID.
  const id = retry?.prompt === prompt ? retry.id : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  outstanding = { id, prompt };
  $('send').disabled = true;
  $('status').textContent = 'Wird an Formnaro übergeben …';
  window.orca.postMessage({ action: 'send', id, prompt });
};
$('prompt').onkeydown = event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    $('compose').requestSubmit();
  }
};
$('cancel').onclick = () => window.orca.postMessage({ action:'cancel', requestId:current.requestId });
function refresh() {
  if (!document.hidden) window.orca.postMessage({ action: 'state' });
}
document.addEventListener('visibilitychange', refresh);
window.addEventListener('focus', refresh);
window.addEventListener('pageshow', refresh);
refresh();
setInterval(refresh, 1400);
</script>
"""


class BridgeError(Exception):
    pass


def request(data):
    try:
        with CONNECTION.open("rb") as descriptor_file:
            descriptor = json.loads(descriptor_file.read(16384))
        url = urlsplit(descriptor["url"])
        token = descriptor["token"]
        if (url.scheme != "http" or url.hostname != "127.0.0.1" or not url.port
                or url.username or url.password or url.path not in ("", "/") or url.query
                or url.fragment or not isinstance(token, str) or not re.fullmatch(r"[0-9a-f]{64}", token)):
            raise ValueError()
    except (OSError, ValueError, TypeError, KeyError):
        raise BridgeError(DISCONNECTED) from None
    link = http.client.HTTPConnection("127.0.0.1", url.port, timeout=4)
    try:
        link.request("POST", "/v1/agent-chat", body=json.dumps(data).encode("utf-8"),
                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "X-Formnaro-Orca-Instance": INSTANCE})
        response = link.getresponse()
        if response.status in (401, 404):
            raise BridgeError("Formnaro-Verbindung oder Version prüfen. " + DISCONNECTED)
        payload = response.read(MAX_REPLY + 1)
        if len(payload) > MAX_REPLY:
            raise BridgeError("Der Chat-Verlauf ist zu groß.")
        result = json.loads(payload)
        if not isinstance(result, dict):
            raise ValueError()
        if response.status != 200:
            detail = result.get("error")
            raise BridgeError(detail[:500] if isinstance(detail, str) else "Formnaro hat den Auftrag abgelehnt.")
        return result
    except (OSError, ValueError, http.client.HTTPException):
        raise BridgeError(DISCONNECTED) from None
    finally:
        link.close()


class ChatPanel(orca.script.ScriptPluginCapabilityBase):
    def __init__(self):
        super().__init__()
        self.panel = None
        self.chat = ChatRequests()

    def get_name(self):
        return "Formnaro KI"

    def on_load(self):
        try:
            self.execute()
        except RuntimeError:
            # During early startup, the same panel remains available via Run.
            pass

    def execute(self):
        if self.panel and self.panel.is_open():
            self.panel.show()
        else:
            self.panel = orca.host.ui.create_dock_panel(
                html=PAGE, title=self.get_name(), width=365, height=620,
                on_message=self.on_message, dock="right"
            )
        return orca.ExecutionResult.success()

    def on_message(self, message):
        panel = self.panel
        if panel and panel.is_open():
            self.chat.handle(message, panel.post)


class ChatPage(orca.pages.PagesPluginCapabilityBase):
    def __init__(self):
        super().__init__()
        self.chat = ChatRequests()

    def get_name(self):
        return "Formnaro Chat"

    def get_ui(self):
        return PAGE

    def on_message(self, message):
        self.chat.handle(message, self.post_message)


class ChatRequests:
    def __init__(self):
        self.poll_lock = threading.Lock()
        self.command_lock = threading.Lock()
        self.request_ids = {}

    def handle(self, message, post):
        if not isinstance(message, dict):
            return
        action = message.get("action")
        if action not in ("state", "send", "cancel"):
            return
        message_id = message.get("id")
        lock = self.poll_lock if action == "state" else self.command_lock
        if not lock.acquire(blocking=False):
            if action != "state":
                post({"kind": "error", "id": message_id,
                            "message": "Ein Chat-Auftrag wird gerade übergeben. Bitte erneut senden."})
            return
        data = {"action": action}
        if action == "send":
            prompt = message.get("prompt")
            if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 10000:
                lock.release()
                return
            if not isinstance(message_id, str) or not re.fullmatch(r"[0-9]{1,20}-[a-z0-9]{1,24}", message_id):
                lock.release()
                return
            if message_id not in self.request_ids:
                if len(self.request_ids) >= 64:
                    del self.request_ids[next(iter(self.request_ids))]
                self.request_ids[message_id] = str(uuid4())
            data.update(prompt=prompt, requestId=self.request_ids[message_id])
        elif action == "cancel":
            data["requestId"] = message.get("requestId")

        def work():
            try:
                result = request(data)
                if action == "state":
                    post({"kind": "state", "state": result})
                elif action == "send":
                    post({"kind": "accepted", "id": message_id, "message": "Formnaro hat den Auftrag angenommen."})
                else:
                    description = "Abbruch angefordert." if result.get("cancelled") else "Der Auftrag ist bereits beendet."
                    post({"kind": "notice", "message": description})
            except BridgeError as exc:
                if action == "state":
                    post({"kind": "state", "state": {"ready": False, "message": str(exc)}})
                else:
                    post({"kind": "error", "id": message_id, "message": str(exc)})
            finally:
                lock.release()

        try:
            threading.Thread(target=work, daemon=True).start()
        except RuntimeError:
            lock.release()
            post({"kind": "error", "id": message_id, "message": "Orca konnte die Verbindung nicht starten."})


@orca.plugin
class FormnaroChat(orca.base):
    def register_capabilities(self):
        orca.request_permissions(fs_read=[str(CONNECTION)], network_socket=["127.0.0.1"], threading=True)
        orca.register_capability(ChatPage)
        orca.register_capability(ChatPanel)
