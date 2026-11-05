"""Read official model metadata using Vibe's existing credential, never emit it."""
import asyncio
import json
import re


async def main():
    from vibe.core.config.harness_files import init_harness_files_manager
    from vibe.core.config.vibe_schema import VibeConfigSchema
    from vibe.core.telemetry.send import get_mistral_provider_and_api_key
    from vibe.utils.http import VibeAsyncHTTPClient, build_ssl_context
    init_harness_files_manager()
    pair = get_mistral_provider_and_api_key(VibeConfigSchema())
    if pair is None:
        print('{"models":[]}')
        return
    async with VibeAsyncHTTPClient(timeout=15, verify=build_ssl_context()) as client:
        async with client.stream('GET', 'https://api.mistral.ai/v1/models', headers={'Authorization': 'Bearer ' + pair[1]}) as response:
            if response.status_code != 200:
                raise ValueError('Model metadata unavailable')
            raw = bytearray()
            async for chunk in response.aiter_bytes():
                raw.extend(chunk)
                if len(raw) > 2 * 1024 * 1024:
                    raise ValueError('Model metadata too large')
    models = []
    for item in json.loads(raw).get('data', [])[:2000]:
        cap = item.get('capabilities', {})
        ident = item.get('id', '')
        if not cap.get('completion_chat') or not cap.get('function_calling') or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}', ident):
            continue
        # Collapse aliases for the same server model, retaining the canonical ID.
        canonical = item.get('name') or ident
        row = {'id': ident, 'canonical': canonical, 'vision': cap.get('vision') is True}
        limit = item.get('max_context_length')
        if isinstance(limit, int) and not isinstance(limit, bool) and 0 < limit <= 10000000:
            row['context'] = limit
        models.append(row)
    print(json.dumps({'models': models}, ensure_ascii=True))


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception:
        print('{"models":[],"error":"Mistral-Modellliste konnte nicht geladen werden."}')
