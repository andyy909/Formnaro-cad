// Public metadata only: credentials are never supplied to the renderer.
export function providerCredentialLabel(provider,language='de'){
 const en=language==='en',state=provider.credentialState??(provider.hasKey?'session':'missing');
 return ({saved:en?'✓ Key saved':'✓ Schlüssel gespeichert',session:en?'● This session only':'● Nur diese Sitzung',unavailable:en?'! Saved · unavailable on this PC':'! Gespeichert · hier nicht lesbar','signed-in':en?'✓ Signed in':'✓ Angemeldet','signed-out':en?'! Login saved · sign in again':'! Anmeldung gespeichert · neu anmelden',unchecked:en?'? Check login':'? Anmeldung prüfen',missing:provider.configured?(en?'○ Configured · no credential':'○ Eingerichtet · Zugang fehlt'):(en?'○ Not configured':'○ Noch nicht eingerichtet')})[state]??(en?'? Check status':'? Status prüfen');
}
export function providerOptionLabel(provider,language='de'){
 const status=providerCredentialLabel(provider,language);return status.slice(0,1)+' '+provider.label+' · '+status.slice(2)+(provider.lastUsedAt?(language==='en'?' · used':' · verwendet'):'');
}
export function providerAccessNote(settings,language='de'){
 const en=language==='en',host=new URL(settings.baseUrl).hostname;
 if(settings.authMode==='chatgpt')return en?'ChatGPT sign-in uses your plan and its limits. The OpenAI API key is a separate connection.':'Die ChatGPT-Anmeldung nutzt dein Abo und dessen Limits. Der OpenAI-API-Schlüssel ist ein getrennter Zugang.';
 if(settings.authMode==='mistral-vibe')return en?'Mistral browser sign-in uses your plan, allowance and pay-as-you-go settings.':'Die Mistral-Browseranmeldung nutzt deinen Tarif, dessen Kontingent und deine Einstellungen für Zusatzverbrauch.';
 if(host==='generativelanguage.googleapis.com')return en?'Google AI Pro/Ultra is not an API credential. Google does not support embedding its consumer Antigravity login in third-party apps. Use a Gemini API key here.':'Google AI Pro/Ultra ist kein API-Zugang. Google unterstützt die Einbettung seiner privaten Antigravity-Anmeldung in Drittanbieter-Apps nicht. Hier einen Gemini-API-Schlüssel verwenden.';
 if(host==='api.anthropic.com')return en?'Claude.ai sign-in for third-party apps is not permitted; use a Claude API key here.':'Eine Claude.ai-Anmeldung in Drittanbieter-Apps ist nicht freigegeben; hier einen Claude-API-Schlüssel verwenden.';
 if(/aliyuncs\.com$/.test(host))return en?'Qwen: API endpoint and key must belong to the same region. Use the address from your Alibaba Model Studio workspace.':'Qwen: Endpunkt und API-Schlüssel müssen aus derselben Region stammen. Die Adresse aus deinem Alibaba-Model-Studio-Workspace verwenden.';
 return en?'This connection uses the provider’s API billing. A chat subscription applies only if the provider explicitly includes this API access.':'Dieser Zugang verwendet die API-Abrechnung des Anbieters. Ein Chat-Abo gilt nur, wenn der Anbieter diesen API-Zugang ausdrücklich einschließt.';
}
export function renderProviderSummary(host,settings,language='de'){
 const providers=settings.providers||[],en=language==='en',saved=providers.filter(p=>p.hasSavedKey),available=providers.filter(p=>p.hasKey);
 host.replaceChildren();const summary=document.createElement('p');summary.className='small-note';summary.textContent=en?`${saved.length} saved connections · ${available.length} available. One credential per provider; switching keeps the other connections.`:`${saved.length} gespeicherte Zugänge · ${available.length} verfügbar. Je Anbieter ein Zugang; beim Wechsel bleiben die anderen erhalten.`;host.append(summary);
 const list=document.createElement('ul');list.className='ai-saved-providers';
 for(const p of providers.filter(p=>p.hasSavedKey||p.hasKey||p.configured||p.lastUsedAt||p.id===settings.providerId)){const row=document.createElement('li');row.textContent=providerOptionLabel(p,language);row.dataset.provider=p.id;if(p.id===settings.providerId){row.textContent+=' · '+(en?'selected':'ausgewählt');row.setAttribute('aria-current','true');}list.append(row);}host.append(list);
 const note=document.createElement('p');note.className='small-note';note.textContent=en?'“Saved” describes local storage, not a successful connection test. “Used” is recorded after a successful request from this version onward.':'„Gespeichert“ beschreibt die lokale Ablage, keinen bestandenen Verbindungstest. „Verwendet“ wird ab dieser Version nach einer erfolgreichen Anfrage erfasst.';host.append(note);
}
