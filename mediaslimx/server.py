"""Bound HTTP shutdown without leaving a native dialog request waiting."""
import uvicorn


class LocalServer(uvicorn.Server):
    def __init__(self, config, stop_native_picker):
        super().__init__(config)
        self.stop_native_picker = stop_native_picker

    async def shutdown(self, sockets=None):
        # Uvicorn waits for HTTP workers before sending lifespan.shutdown.
        # Release the blocking native dialog first; cancelling its coroutine
        # alone would leave the underlying synchronous worker/window alive.
        self.stop_native_picker()
        await super().shutdown(sockets=sockets)


def run_server(app, port):
    config = uvicorn.Config(app, host="127.0.0.1", port=port, access_log=False,
                            timeout_graceful_shutdown=5)
    server = LocalServer(config, app.state.stop_native_picker)
    try:
        server.run()
    except KeyboardInterrupt:
        # Uvicorn re-raises SIGINT after its normal shutdown has completed.
        # Match uvicorn.run(): Ctrl+C is an ordinary service exit, not a crash.
        pass
    finally:
        # Also close a registered helper when startup/server execution fails.
        # This is only a bounded HTTP grace period, not a media transaction
        # deadline or a new force-kill path for media encoders or browsers.
        server.stop_native_picker()
