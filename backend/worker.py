from __future__ import annotations

import os
import socket
import time

from .postgres import PostgresRepository


def run() -> None:
    """Claim crawl tasks with PostgreSQL row locks.

    Fetching is intentionally a separate worker boundary: a task can be
    retried, rate-limited, and assigned an adapter without blocking HTTP.
    """
    repository = PostgresRepository(os.environ["DATABASE_URL"])
    worker_id = f"crawl-worker-{socket.gethostname()}"
    while True:
        task = repository.claim_crawl_task(worker_id)
        if task is None:
            time.sleep(float(os.environ.get("WORKER_POLL_SECONDS", "2")))
            continue
        print(f"claimed crawl task {task['id']} for {task['url']}", flush=True)
        # Adapter execution is the next stage; the claim is durable and
        # isolated from the public request/response lifecycle.


if __name__ == "__main__":
    run()
