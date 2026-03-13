import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Carrega .env pro os.environ (necessario pra MAFFT_BINARIES e outras env de sistema)
load_dotenv()

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://rainman:rainman_dev@localhost:5432/rainman"
    database_url_sync: str = "postgresql+psycopg2://rainman:rainman_dev@localhost:5432/rainman"
    ncbi_email: str = "dev@timelabs.com"
    ncbi_api_key: str = ""
    redis_url: str = "redis://localhost:6379/0"
    mafft_bin: str = "mafft"
    fasttree_bin: str = "FastTree"
    iqtree_bin: str = "iqtree2"
    iqtree_threads: int = 4
    work_dir: str = "/tmp/gpf_work"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
