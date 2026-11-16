from pathlib import Path
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parent.parent
Category = Literal['dano', 'obstrucao', 'desnivel', 'outra', 'inconclusiva']
Status = Literal['pendente', 'validado', 'rejeitado']

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)

class AnalysisResult(StrictModel):
    category: Category
    description: str = Field(min_length=1, max_length=1000)

class ImageInput(StrictModel):
    image: str = Field(min_length=1, max_length=12_000_000)
    consent: bool = False

class RecordInput(StrictModel):
    image: str = Field(min_length=1, max_length=12_000_000)
    address: str = Field(min_length=1, max_length=160)
    area: str = Field(min_length=1, max_length=100)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    userDescription: str = Field(default='', max_length=500)
    category: Category
    description: str = Field(min_length=1, max_length=1000)
    analysisId: str | None = Field(default=None, max_length=80)

class ReviewInput(AnalysisResult):
    status: Status
    version: int = Field(ge=1)

class LoginInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=1, max_length=128)

class RegisterInput(LoginInput):
    password: str = Field(min_length=12, max_length=128)
    inviteCode: str = Field(min_length=1, max_length=128)
