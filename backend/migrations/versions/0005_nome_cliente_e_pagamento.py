"""add customer name and payment declaration timestamp to orders

Revision ID: 0005_nome_cliente_e_pagamento
Revises: 0004_painel_fila_posicao
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_nome_cliente_e_pagamento"
down_revision = "0004_painel_fila_posicao"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pedidos", sa.Column("nome_cliente", sa.String(length=40), nullable=True))
    op.add_column("pedidos", sa.Column("pagamento_declarado_em", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("pedidos", "pagamento_declarado_em")
    op.drop_column("pedidos", "nome_cliente")
