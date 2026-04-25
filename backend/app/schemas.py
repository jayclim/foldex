from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    gene: str = Field(..., examples=["BRCA1"])
    mutation: str = Field(..., examples=["c.5096G>A p.Arg1699Gln"])


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class AnalyzeResponse(BaseModel):
    job_id: str
    status: JobStatus


class MutationSchema(BaseModel):
    submitted: str | None = None
    cdna_hgvs: str | None = None
    protein_hgvs: str | None = None
    reference_aa: str | None = None
    alternate_aa: str | None = None
    protein_position: int | None = None


class VariantRecord(BaseModel):
    gene: str | None = None
    mutation_text: str | None = None
    input_text: str | None = None
    display_name: str | None = None
    query_terms: list[str] | None = None
    mutation: MutationSchema | dict[str, Any] | None = None
    source: str | None = None
    wild_type_sequence: str | None = None
    mutant_sequence: str | None = None
    sequence: str | None = None


class SimilarVariant(BaseModel):
    name: str | None = None
    gene: str | None = None
    source: str | None = None
    clinical_significance: str | None = None
    review_status: str | None = None
    description: str | None = None
    mutation: Any | None = None
    protein_position: int | None = None
    alternate_aa: str | None = None
    mutant_sequence: str | None = None
    evidence: Any | None = None
    similarity_score: float | None = None
    similarity_reasons: list[str] | None = None


class StructureViewer(BaseModel):
    format: str | None = None
    data: str | None = None
    recommended_viewer: str | None = None
    available: bool | None = None


class ProteinStructure(BaseModel):
    label: str | None = None
    source: str | None = None
    sequence: str | None = None
    sequence_length: int | None = None
    mutation: Any | None = None
    pdb: str | None = None
    viewer: StructureViewer | None = None
    warnings: list[str] | None = None


class SimilarVariantStructure(BaseModel):
    variant: SimilarVariant | None = None
    structure: ProteinStructure | None = None


class StructuresPayload(BaseModel):
    wild_type: ProteinStructure | None = None
    unknown_variant: ProteinStructure | None = None
    similar_variants: list[SimilarVariantStructure] | None = None


class ReportWildType(BaseModel):
    gene: str | None = None
    protein: str | None = None
    uniprot: Any | None = None
    sequence_length: int | None = None
    description: str | None = None


class ReportUnknownVariant(BaseModel):
    display_name: str | None = None
    mutation: Any | None = None
    features: Any | None = None
    description: str | None = None


class ReportClassificationSummary(BaseModel):
    alpha_missense: Any | None = None
    clinvar: list[Any] | None = None
    gnomad: Any | None = None
    overall_interpretation: str | None = None


class ReportJson(BaseModel):
    status: str | None = None
    variant: VariantRecord | None = None
    classification_summary: ReportClassificationSummary | None = None
    wild_type: ReportWildType | None = None
    unknown_variant: ReportUnknownVariant | None = None
    similar_variants: list[SimilarVariant] | None = None
    structures: StructuresPayload | None = None
    warnings: list[str] | None = None
    disclaimer: str | None = None


class ReportData(BaseModel):
    markdown: str | None = None
    json: ReportJson | None = None


class AnalysisResult(BaseModel):
    variant: VariantRecord | None = None
    annotations: dict[str, Any] | None = None
    similar_variants: list[SimilarVariant] | None = None
    structures: StructuresPayload | None = None
    report: ReportData | None = None


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    result: AnalysisResult | None = None
    error: str | None = None
