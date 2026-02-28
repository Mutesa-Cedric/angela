import pytest
from httpx import ASGITransport, AsyncClient

from app.config import DATA_PATH
from app.data_loader import store
from app.main import app


@pytest.fixture
async def client():
    store.load(DATA_PATH)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_snapshot_valid(client):
    r = await client.get("/snapshot", params={"t": 0})
    assert r.status_code == 200
    data = r.json()
    assert "meta" in data
    assert "nodes" in data
    assert "edges" in data
    assert data["meta"]["t"] == 0
    assert data["meta"]["n_buckets"] > 0
    assert len(data["nodes"]) > 0


@pytest.mark.anyio
async def test_snapshot_out_of_range(client):
    r = await client.get("/snapshot", params={"t": 9999})
    assert r.status_code == 400
    assert "out of range" in r.json()["detail"]


@pytest.mark.anyio
async def test_snapshot_negative(client):
    r = await client.get("/snapshot", params={"t": -1})
    assert r.status_code == 400


@pytest.mark.anyio
async def test_entity_known(client):
    # Get a valid entity ID from snapshot
    snap = await client.get("/snapshot", params={"t": 0})
    first_id = snap.json()["nodes"][0]["id"]

    r = await client.get(f"/entity/{first_id}", params={"t": 0})
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == first_id
    assert "risk_score" in data
    assert "reasons" in data
    assert "activity" in data


@pytest.mark.anyio
async def test_entity_unknown(client):
    r = await client.get("/entity/nonexistent_entity_xyz")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


@pytest.mark.anyio
async def test_entity_bad_bucket(client):
    snap = await client.get("/snapshot", params={"t": 0})
    first_id = snap.json()["nodes"][0]["id"]

    r = await client.get(f"/entity/{first_id}", params={"t": 9999})
    assert r.status_code == 400
