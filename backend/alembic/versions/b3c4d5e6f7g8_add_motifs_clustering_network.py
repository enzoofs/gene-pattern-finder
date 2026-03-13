"""add motifs clustering network fields

Revision ID: b3c4d5e6f7g8
Revises: a1b2c3d4e5f6
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7g8'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new JSON columns to analysis_jobs
    op.add_column('analysis_jobs', sa.Column('motifs', sa.JSON(), nullable=True))
    op.add_column('analysis_jobs', sa.Column('clustering', sa.JSON(), nullable=True))
    op.add_column('analysis_jobs', sa.Column('network', sa.JSON(), nullable=True))

    # Update JobStatus enum to include new values
    # PostgreSQL requires ALTER TYPE to add new enum values
    op.execute("ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'motifs' AFTER 'conservation'")
    op.execute("ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'clustering' AFTER 'motifs'")
    op.execute("ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'network' AFTER 'clustering'")


def downgrade() -> None:
    op.drop_column('analysis_jobs', 'network')
    op.drop_column('analysis_jobs', 'clustering')
    op.drop_column('analysis_jobs', 'motifs')
    # Note: PostgreSQL does not support removing enum values easily.
    # The enum values motifs, clustering, network will remain but be unused.
