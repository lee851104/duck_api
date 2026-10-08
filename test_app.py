import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch

import app


class ApplicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = app.KeyStore(Path(self.temp.name) / 'key.dat')
        self.server = app.make_server(0, self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temp.cleanup()

    def request(self, path, body=None, headers=None):
        h = {'Origin': self.origin, 'X-Duck-Token': self.server.token}
        h.update(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h['Content-Type'] = 'application/json'
        req = urllib.request.Request(self.origin + path, data=data, headers=h)
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_batch_accepts_fifty_and_rejects_fifty_one(self):
        batch = [{'id': i, 'raw': f'社區{i}\n香蕉1根'} for i in range(1, 51)]
        self.assertEqual(app.validate_batch({'orders': batch}), batch)
        with self.assertRaises(app.UserError):
            app.validate_batch({'orders': batch + [{'id': 51, 'raw': '另一單'}]})

    def test_luna_request_keeps_structured_output_and_notes_local(self):
        response = {'status': 'completed', 'output': [
            {'type': 'reasoning'},
            {'type': 'message', 'content': [{'type': 'output_text', 'text': '{"orders": []}'}]}]}
        with patch('app.openai_request', return_value=response) as api:
            result = app.call_openai('fake-key', [{'id': 1, 'raw': '測試社區\n香蕉6根\n載具：/AB12+34'}])
        payload = api.call_args.args[2]
        self.assertEqual(payload['model'], 'gpt-6-luna')
        self.assertEqual(payload['reasoning']['effort'], 'low')
        self.assertTrue(payload['text']['format']['strict'])
        self.assertFalse(payload['store'])
        self.assertNotIn('/AB12+34', payload['input'])
        self.assertEqual(result, {'orders': []})

    def test_secret_encrypted_and_not_returned(self):
        key = 'sk-test-only-not-a-real-credential-123456'
        code, data = self.request('/api/settings', {'key': key})
        self.assertEqual(code, 200)
        self.assertNotIn(key, json.dumps(data))
        self.assertNotIn(key.encode(), self.store.path.read_bytes())
        self.assertEqual(app.KeyStore(self.store.path).read(), key)
        self.assertTrue(self.request('/api/status')[1]['configured'])
        self.assertEqual(self.request('/api/settings/clear', {})[0], 200)
        self.assertFalse(self.store.path.exists())

    def test_missing_key_and_cross_origin(self):
        self.assertEqual(self.request('/api/organize', {'orders': [{'id': 1, 'raw': 'A\n香蕉+1'}]})[0], 400)
        self.assertEqual(self.request('/api/settings', {'key': 'abc'}, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('/api/settings', {'key': 'abc'}, {'X-Duck-Token': 'wrong'})[0], 403)
        self.assertEqual(self.request('/key.dat')[0], 404)

    def test_duplicate_server_cannot_bind_same_port(self):
        with self.assertRaises(OSError):
            other = app.make_server(self.server.server_port, self.store)
            other.server_close()

    def test_storage_permission_error_has_actionable_message(self):
        with patch.object(Path, 'mkdir', side_effect=PermissionError('access denied')):
            code, data = self.request('/api/settings', {'key': 'sk-test-only-not-a-real-credential-123456'})
        self.assertEqual(code, 500)
        self.assertIn('設定資料夾', data['error'])
        self.assertIn('啟動菜騎鴨.exe', data['error'])
        self.assertNotIn('sk-', data['error'])

    def test_batch_single_call_aliases_and_processing(self):
        self.store.write('sk-test-only-not-a-real-credential-123456')
        response = {'orders': [
            {'id': 1, 'place': '市鎮之櫻B606', 'issues': [], 'items': [
                {'name': '白龍王玉米', 'qty': 2, 'unit': '', 'process': '剝'},
                {'name': '小黃瓜', 'qty': 2, 'unit': '', 'process': ''}]},
            {'id': 2, 'place': '和築好好窩D13-2', 'issues': [], 'items': [
                {'name': '小黃瓜', 'qty': 2, 'unit': '根', 'process': ''}]}]}
        with patch('app.call_openai', return_value=response) as api:
            code, data = self.request('/api/organize', {'orders': [{'id': 1, 'raw': 'one'}, {'id': 2, 'raw': 'two'}]})
            self.assertEqual(code, 200)
            api.assert_called_once()
        self.assertEqual(data['orders'][0]['items'][0]['name'], '玉米')
        self.assertEqual(data['orders'][0]['items'][0]['process'], '剝')
        self.assertEqual(data['orders'][0]['items'][1]['unit'], '根')
        self.assertEqual(data['orders'][1]['place'], '好好窩D13-2')

    def test_incomplete_output_is_rejected_but_uncertainty_is_retained(self):
        batch = [{'id': 1, 'raw': 'A'}, {'id': 2, 'raw': 'B'}]
        with self.assertRaises(app.UserError):
            app.validate_output({'orders': []}, batch)
        result = {'orders': [{'id': 1, 'place': 'A', 'items': [], 'issues': ['數量不明']} ]}
        parsed = app.validate_output(result, batch[:1])
        self.assertEqual(parsed[0]['items'], [])
        self.assertEqual(parsed[0]['issues'], ['數量不明'])
        with self.assertRaises(app.UserError):
            app.validate_batch({'orders': [{'id': 1, 'raw': 'A'}] * 11})

    def test_confirmed_products_survive_other_uncertain_lines(self):
        payload = {'orders': [{'id': 7, 'place': '測試社區', 'issues': ['地瓜葉無數量'],
                              'items': [{'name': '香蕉', 'qty': 6, 'unit': '根', 'process': ''}]}]}
        result = app.validate_output(payload, [{'id': 7, 'raw': '測試社區\n香蕉6根\n地瓜葉'}])
        self.assertEqual(result[0]['items'][0]['qty'], 6)
        self.assertEqual(result[0]['issues'], ['地瓜葉無數量'])

    def test_api_refusal_and_incomplete_are_not_results(self):
        for response in [{'status': 'incomplete', 'output': []},
                         {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'refusal'}]}]}]:
            with self.assertRaises(app.UserError):
                app.response_json(response)

    def test_non_product_notes_are_preserved_separately(self):
        record = {'id': 1, 'place': 'A', 'items': [{'name': '香蕉', 'qty': 3, 'unit': '根', 'process': ''}],
                  'issues': ['地瓜葉數量不明'], 'notes': ['載具：/AB12+34', '請放管理室']}
        result = app.validate_output({'orders': [record]}, [{'id': 1, 'raw': 'A\n香蕉3根\n載具：/AB12+34\n請放管理室'}])[0]
        self.assertEqual(result['notes'], ['載具：/AB12+34', '請放管理室'])
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['issues'], ['地瓜葉數量不明'])

    def test_normalization_explanations_do_not_request_user_action(self):
        record = {'id': 1, 'place': 'A', 'items': [{'name': '蒜仁', 'qty': 1, 'unit': '', 'process': ''}],
                  'notes': [], 'issues': [
                      {'kind': 'information', 'source': '剝皮蒜仁+1', 'message': '已對照為蒜仁，名稱調整'},
                      {'kind': 'information', 'source': '大黃瓜+1', 'message': '缺單位保留空字串'},
                      {'kind': 'missing_quantity', 'source': '地瓜葉', 'message': '請補上地瓜葉的數量'}]}
        result = app.validate_output({'orders': [record]}, [{'id': 1, 'raw': 'A\n剝皮蒜仁+1\n地瓜葉'}])[0]
        self.assertEqual(result['issues'], ['地瓜葉：請補上地瓜葉的數量'])

    def test_notes_only_order_is_not_a_missing_product_warning(self):
        record = {'id': 1, 'place': 'A', 'items': [], 'issues': [], 'notes': ['請放管理室']}
        result = app.validate_output({'orders': [record]}, [{'id': 1, 'raw': 'A\n請放管理室'}])[0]
        self.assertEqual(result['issues'], [])
        self.assertEqual(result['notes'], ['請放管理室'])

    def test_invoice_identifiers_kept_local_and_mixed_lines_not_dropped(self):
        raw = 'A\n香蕉+2\n載具：/AB12+34\n統編：12345678\n小黃瓜+1 載具另給'
        text, notes = app.split_reference_notes(raw)
        self.assertNotIn('/AB12+34', text)
        self.assertIn('小黃瓜+1 載具另給', text)
        result = app.validate_output({'orders': [{'id': 1, 'place': 'A', 'items': [], 'issues': [], 'notes': []}]}, [{'id': 1, 'raw': raw}])[0]
        self.assertEqual(result['notes'], notes)


if __name__ == '__main__':
    unittest.main()
