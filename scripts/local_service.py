"""Start/stop this checkout's loopback server through the macOS user session."""
import hashlib
import json
import os
import pathlib
import plistlib
import re
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
LABEL = 'local.neumathe.' + hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
DOMAIN = 'gui/' + str(os.getuid())
TARGET = DOMAIN + '/' + LABEL
LOCAL = ROOT / '.local'
URL = 'http://127.0.0.1:4178/'
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def healthy():
    try:
        with HTTP.open(URL + 'api/health', timeout=1) as response:
            return json.load(response).get('service') == 'local-neumathe'
    except Exception:
        return False


def launch(*args):
    return subprocess.run(['/bin/launchctl', *args], capture_output=True, text=True)


def main():
    LOCAL.mkdir(exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] == 'stop':
        result = launch('bootout', TARGET)
        if result.returncode == 0:
            for _ in range(30):
                if not healthy():
                    break
                time.sleep(.1)
            (LOCAL / 'server.pid').unlink(missing_ok=True)
            print('本地网站已停止。')
        else:
            print('本项目的本地网站当前未运行。')
        return
    if not healthy():
        python = ROOT / '.tools/pdf/bin/python'
        if not python.exists():
            raise RuntimeError('缺少 Python 环境，请按照 README.txt 安装 requirements.txt')
        config = {
            'Label': LABEL,
            'ProgramArguments': [str(python), '-u', str(ROOT / 'server.py'), '--port', '4178'],
            'WorkingDirectory': str(ROOT),
            'RunAtLoad': True,
            'StandardOutPath': str(LOCAL / 'server.log'),
            'StandardErrorPath': str(LOCAL / 'server.log'),
        }
        plist = LOCAL / 'local-server.plist'
        with plist.open('wb') as stream:
            plistlib.dump(config, stream)
        if launch('print', TARGET).returncode == 0:
            result = launch('kickstart', TARGET)
        else:
            result = launch('bootstrap', DOMAIN, str(plist))
        if result.returncode:
            raise RuntimeError('本地服务启动失败：' + result.stderr.strip())
        for _ in range(50):
            if healthy():
                break
            time.sleep(.1)
        else:
            raise RuntimeError('本地服务未就绪，请查看 .local/server.log，确认 4178 端口可用')
    status = launch('print', TARGET)
    # A moved checkout has a different launchd label and ProgramArguments. A healthy
    # server belonging to another checkout must not be claimed as this one's service.
    if status.returncode:
        raise RuntimeError('4178 端口上的网站属于其他项目目录，请先从原目录停止该服务')
    pid = re.search(r'\bpid = (\d+)', status.stdout)
    if pid:
        (LOCAL / 'server.pid').write_text(pid[1])
    subprocess.run(['/usr/bin/open', URL], check=False)
    print('网站已启动：' + URL)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
