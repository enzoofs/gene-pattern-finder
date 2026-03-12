"""v2: add collections, analysis_jobs; drop analysis_results

Revision ID: 5b7ed2ffeef1
Revises:
Create Date: 2026-03-12 15:55:55.070956

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5b7ed2ffeef1'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create jobstatus enum
    op.execute("CREATE TYPE jobstatus AS ENUM ('queued', 'aligning', 'preview_tree', 'full_tree', 'conservation', 'done', 'failed')")

    # Create collections table (reuses existing seqtype enum)
    op.execute("""
        CREATE TABLE collections (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            seq_type seqtype NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # Create analysis_jobs table
    op.execute("""
        CREATE TABLE analysis_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            collection_id UUID NOT NULL REFERENCES collections(id),
            status jobstatus NOT NULL DEFAULT 'queued',
            progress_pct INTEGER NOT NULL DEFAULT 0,
            progress_msg TEXT,
            error_msg TEXT,
            alignment TEXT,
            preview_tree TEXT,
            tree TEXT,
            tree_model VARCHAR(100),
            bootstrap_data JSON,
            conservation JSON,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            finished_at TIMESTAMPTZ
        )
    """)

    # Create collection_species table
    op.execute("""
        CREATE TABLE collection_species (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            collection_id UUID NOT NULL REFERENCES collections(id),
            species_id UUID NOT NULL REFERENCES species(id),
            sequence_id UUID NOT NULL REFERENCES sequences(id)
        )
    """)

    # Drop old analysis_results table
    op.execute("DROP TABLE IF EXISTS analysis_results")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS collection_species")
    op.execute("DROP TABLE IF EXISTS analysis_jobs")
    op.execute("DROP TABLE IF EXISTS collections")
    op.execute("DROP TYPE IF EXISTS jobstatus")
    # Recreating analysis_results is omitted — dev migration
