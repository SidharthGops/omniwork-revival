from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import init_db
from app.routers import members, tasks
from app.ws_manager import manager

app = FastAPI(title="OmniWork prototype")

app.include_router(members.router)
app.include_router(tasks.router)


@app.on_event("startup")
def on_startup():
    init_db()


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect inbound messages, this just keeps the connection open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.get("/member")
def member_page():
    return FileResponse("static/member.html")
