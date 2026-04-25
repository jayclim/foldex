from fastapi.testclient import TestClient

from app.annotator import _coding_hgvs_from_vep, _preferred_gnomad_frequency, _preferred_vep_frequency
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


def test_gnomad_frequency_helpers_return_scalar_frequency() -> None:
    direct = _preferred_gnomad_frequency(
        {
            "exome": {"allele_frequency": 0.0016},
            "genome": {"allele_frequency": 0.0127},
        }
    )
    colocated = _preferred_vep_frequency(
        [
            {
                "variant_id": "rs334",
                "frequencies": {
                    "gnomade": 0.001601,
                    "gnomadg": 0.01272,
                },
            }
        ]
    )

    assert direct["allele_frequency"] == 0.0127
    assert direct["source"] == "genome"
    assert colocated["allele_frequency"] == 0.001601
    assert colocated["source"] == "gnomade"


def test_coding_hgvs_derives_changed_base_from_vep_codons() -> None:
    vep = {
        "records": [
            {
                "transcript_consequences": [
                    {
                        "alphamissense": {"am_class": "likely_pathogenic"},
                        "cds_start": 665,
                        "codons": "gCc/gTc",
                    }
                ]
            }
        ]
    }

    assert _coding_hgvs_from_vep(vep) == "c.665C>T"
