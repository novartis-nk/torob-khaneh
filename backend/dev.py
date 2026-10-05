from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    environment = os.environ.copy()
    environment["PORT"] = environment.get("API_PORT", "4318")
    api = subprocess.Popen([sys.executable, "-m", "backend.app"], cwd=ROOT, env=environment)
    vite = subprocess.Popen([str(ROOT / "node_modules/.bin/vite"), "--host", "127.0.0.1", "--port", environment.get("PORT_WEB", "4317")], cwd=ROOT)
    processes = [api, vite]

    def stop(*_: object) -> None:
        for process in processes:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.2)
    finally:
        stop()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        failed = next((process.returncode for process in processes if process.returncode not in (None, 0, -signal.SIGTERM)), 0)
        raise SystemExit(failed or 0)


if __name__ == "__main__":
    main()

