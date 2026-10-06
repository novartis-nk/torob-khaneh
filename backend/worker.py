from __future__ import annotations

import os
import socket
import time

from .onboarding import IntegrationArtifactStore, SourceOnboardingOrchestrator
from .ports import CrawlRequest, ValidationError
from .postgres import PostgresRepository
from .source_ai import AIProviderError, OpenAIResponsesClient, SourceIntelligenceAgent


def run() -> None:
    """Claim automatic source-discovery tasks with PostgreSQL row locks.

    AI research and artifact generation are isolated from the public HTTP
    process. Generated adapters and scraper plans remain review-only.
    """
    repository = PostgresRepository(os.environ["DATABASE_URL"])
    client = OpenAIResponsesClient()
    orchestrator = SourceOnboardingOrchestrator(SourceIntelligenceAgent(client), IntegrationArtifactStore())
    worker_id = f"source-discovery-{socket.gethostname()}"
    while True:
        task = repository.claim_source_task(worker_id)
        if task is None:
            time.sleep(float(os.environ.get("WORKER_POLL_SECONDS", "2")))
            continue
        print(f"claimed source discovery {task['id']} for {task['url']}", flush=True)
        request = CrawlRequest(
            id=task["request_id"], url=task["url"], domain=task["domain"],
            vertical=task["vertical"], notes=task["notes"], status=task["status"],
            adapter_key=task.get("adapter_key"), created_at=str(task["created_at"]),
            method=task["method"], api_url=task.get("api_url"), task_id=task.get("task_id"),
        )
        try:
            result = orchestrator.onboard(request)
            repository.complete_source_task(task["id"], result)
            print(f"completed source discovery {task['id']} as {result.resolved_method}", flush=True)
        except (AIProviderError, TimeoutError, ConnectionError) as error:
            repository.fail_source_task(task["id"], str(error), retry=True)
            print(f"retryable source discovery failure {task['id']}: {error}", flush=True)
        except (ValidationError, ValueError) as error:
            repository.fail_source_task(task["id"], str(error), retry=False)
            print(f"source discovery needs review {task['id']}: {error}", flush=True)
        except Exception as error:  # pragma: no cover - worker safety boundary
            repository.fail_source_task(task["id"], f"unexpected:{type(error).__name__}", retry=True)
            print(f"unexpected source discovery failure {task['id']}: {type(error).__name__}", flush=True)


if __name__ == "__main__":
    run()
