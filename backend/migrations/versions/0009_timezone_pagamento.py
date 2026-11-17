"""timezone pagamento declarado

Revision ID: 0009_timezone_pagamento
Revises: 0008_aplica_em
Create Date: 2026-11-16 21:46:28.934480
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_timezone_pagamento"
down_revision: Union[str, Sequence[str], None] = "0008_aplica_em"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "pedidos",
        "pagamento_declarado_em",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="pagamento_declarado_em AT TIME ZONE 'UTC'",
    )


def downgrade() -> None:
    op.alter_column(
        "pedidos",
        "pagamento_declarado_em",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=True,
        postgresql_using="pagamento_declarado_em AT TIME ZONE 'UTC'",
    )




