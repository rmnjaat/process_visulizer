"""Entry point for the process visualizer backend."""

import setproctitle
import uvicorn

from backend.server.app import create_app
from backend.config import Settings


def main() -> None:
    setproctitle.setproctitle("PV-Backend")
    settings = Settings()
    app = create_app(settings)
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
