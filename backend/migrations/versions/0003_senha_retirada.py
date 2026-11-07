"""add pickup password to orders and image/category to items

Revision ID: 0003_senha_retirada
Revises: 0002_painel_display_state
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_senha_retirada"
down_revision = "0002_painel_display_state"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "pedidos",
        sa.Column("senha_retirada", sa.String(length=4), nullable=True, unique=True),
    )
    op.add_column("itens", sa.Column("imagem", sa.String(), nullable=True))
    op.add_column("itens", sa.Column("categoria", sa.String(), nullable=True))


def downgrade():
    op.drop_column("itens", "categoria")
    op.drop_column("itens", "imagem")
    op.drop_column("pedidos", "senha_retirada")
