from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_env: str = 'development'
    database_url: str = ''
    migration_database_url: str = ''
    gemini_api_key: str = ''
    gemini_model: str = 'gemini-2.5-flash-lite'
    cors_origins: str = 'http://localhost:8080,http://127.0.0.1:8080'
    max_tool_calls: int = Field(default=8, ge=1, le=20)
    max_model_rounds: int = Field(default=4, ge=1, le=8)
    model_timeout_seconds: int = Field(default=30, ge=1, le=90)
