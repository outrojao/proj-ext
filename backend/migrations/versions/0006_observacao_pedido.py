"""add optional observation note to orders

Revision ID: 0006_observacao_pedido
Revises: 0005_nome_cliente_e_pagamento
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_observacao_pedido"
down_revision = "0005_nome_cliente_e_pagamento"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pedidos", sa.Column("observacao", sa.String(length=200), nullable=True))


def downgrade():
    op.drop_column("pedidos", "observacao")
