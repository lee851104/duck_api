"""Smoke-test the delivered ZIP without installed Python on the child PATH."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
import zipfile


def run():
    Path('.verification').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='duck-package-', dir='.verification') as directory:
        root = Path(directory).resolve()
        with zipfile.ZipFile('release/菜騎鴨-Windows.zip') as archive:
            assert archive.testzip() is None
            assert len(archive.namelist()) == 3, archive.namelist()
            assert not any('key' in n.lower() or '.env' in n.lower() for n in archive.namelist())
            archive.extractall(root)
        executable = root / '菜騎鴨' / '啟動菜騎鴨.exe'
        env = dict(os.environ, LOCALAPPDATA=str(root / 'private'), PATH=os.environ['SystemRoot'] + '\\System32')
        env.pop('PYTHONPATH', None)
        env.pop('PYTHONHOME', None)
        process = subprocess.Popen([str(executable), '--no-browser', '--port', '49165'], env=env,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        origin = 'http://127.0.0.1:49165'
        def request(path, body=None, token=''):
            req = urllib.request.Request(origin + path,
                  data=None if body is None else json.dumps(body).encode(),
                  headers={'Content-Type': 'application/json', 'X-Duck-Token': token, 'Origin': origin})
            with urllib.request.urlopen(req, timeout=3) as response:
                return json.load(response)
        try:
            for _ in range(80):
                try:
                    state = request('/api/status')
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(.25)
            else:
                raise AssertionError('Packaged executable failed to start')
            assert state['configured'] is False
            token = state['token']
            with urllib.request.urlopen(origin + '/') as response:
                assert 'API 設定' in response.read().decode('utf-8')
                assert "frame-ancestors 'none'" in response.headers['Content-Security-Policy']
            fake = 'sk-test-only-not-a-real-credential-123456'
            request('/api/settings', {'key': fake}, token)
            key_file = root / 'private' / 'CaiQiYa' / 'key.dat'
            assert fake.encode() not in key_file.read_bytes()
            assert request('/api/status')['configured'] is True
            request('/api/shutdown', {}, token)
            process.wait(timeout=10)
            process = subprocess.Popen([str(executable), '--no-browser', '--port', '49165'], env=env,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
            for _ in range(80):
                try:
                    state = request('/api/status')
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(.25)
            assert state['configured'] is True
            token = state['token']
            duplicate = subprocess.run([str(executable), '--no-browser', '--port', '49165'], env=env,
                                      creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
            assert duplicate.returncode == 0
            request('/api/settings/clear', {}, token)
            assert not key_file.exists()
            request('/api/shutdown', {}, token)
            process.wait(timeout=10)
            print('PASS: ZIP contents, isolated EXE startup, encrypted settings, restart persistence, duplicate launch, clear and shutdown')
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)


if __name__ == '__main__':
    run()
