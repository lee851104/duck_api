"""Test-only simulated API server. Not shipped in the release ZIP."""
import tempfile
from pathlib import Path
import app


def simulated_response(key, orders):
    return {'orders': [{'id': o['id'], 'place': '測試社區A101', 'issues': [{'kind':'missing_quantity','source':'地瓜葉','message':'請補上數量'}], 'notes': ['請放管理室'], 'items': [
        {'name': '小黃瓜', 'qty': 2, 'unit': '根', 'process': ''},
        {'name': '白蘿蔔', 'qty': 1, 'unit': '', 'process': '去皮'}]} for o in orders]}


Path('.verification').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(dir='.verification') as folder:
    store = app.KeyStore(Path(folder) / 'key.dat')
    store.write('sk-test-only-not-a-real-credential-123456')
    app.call_openai = simulated_response
    server = app.make_server(49166, store)
    try:
        server.serve_forever()
    finally:
        server.server_close()
