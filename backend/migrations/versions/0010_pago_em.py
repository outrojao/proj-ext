"""pago_em — âncora da numeração diária

Revision ID: 0010_pago_em
Revises: 0009_timezone_pagamento
Create Date: 2026-11-19 10:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_pago_em"
down_revision: Union[str, Sequence[str], None] = "0009_timezone_pagamento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pedidos",
        sa.Column("pago_em", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pedidos", "pago_em")
