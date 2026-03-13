"""add insights field and status

Revision ID: c4d5e6f7g8h9
Revises: b3c4d5e6f7g8
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7g8h9'
down_revision: Union[str, None] = 'b3c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('analysis_jobs', sa.Column('insights', sa.JSON(), nullable=True))
    op.execute("ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'insights' AFTER 'network'")


def downgrade() -> None:
    op.drop_column('analysis_jobs', 'insights')
