"""add panel queue position to orders

Revision ID: 0004_painel_fila_posicao
Revises: 0003_senha_retirada
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_painel_fila_posicao"
down_revision = "0003_senha_retirada"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pedidos", sa.Column("painel_fila_posicao", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("pedidos", "painel_fila_posicao")
