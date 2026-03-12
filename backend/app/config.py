from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://rainman:rainman_dev@localhost:5432/rainman"
    database_url_sync: str = "postgresql+psycopg2://rainman:rainman_dev@localhost:5432/rainman"
    ncbi_email: str = "dev@timelabs.com"
    ncbi_api_key: str = ""
    blast_bin_dir: str = ""
    blast_tmp_dir: str = "/tmp/blast_tmp"

    class Config:
        env_file = ".env"

settings = Settings()
