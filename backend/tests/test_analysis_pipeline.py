from fastapi.testclient import TestClient

from app.main import app


def test_analysis_pipeline_completes_with_live_apis_disabled(monkeypatch) -> None:
    monkeypatch.setenv("FOLDEX_DISABLE_LIVE_APIS", "1")
    client = TestClient(app)

    response = client.post(
        "/api/analyze",
        json={"gene": "BRCA1", "mutation": "c.5096G>A p.Arg1699Gln"},
    )

    assert response.status_code == 200
    job_id = response.json()["job_id"]
    job_response = client.get(f"/api/jobs/{job_id}")
    body = job_response.json()

    assert job_response.status_code == 200
    assert body["status"] == "completed"
    assert body["result"]["variant"]["gene"] == "BRCA1"
    assert body["result"]["variant"]["mutation"]["protein_hgvs"] == "p.Arg1699Gln"
    assert body["result"]["report"]["json"]["status"] == "complete"
    assert "wild_type" in body["result"]["structures"]
    assert "unknown_variant" in body["result"]["structures"]
