"""add per-item extras (adicionais) and per-order-line extra selection

Revision ID: 0007_adicionais
Revises: 0006_observacao_pedido
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_adicionais"
down_revision = "0006_observacao_pedido"
branch_labels = None
depends_on = None


def upgrade():
    # Adicional é um Item que aponta para o item-base (ex.: "Queijo extra" → X-Burger).
    # CASCADE: remover o item-base remove os adicionais dele.
    op.add_column("itens", sa.Column("adicional_de", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_itens_adicional_de",
        "itens",
        "itens",
        ["adicional_de"],
        ["id"],
        ondelete="CASCADE",
    )
    # Escolha por linha do pedido (cada pedido guarda os seus próprios):
    # [{"item_id": int, "quantidade": int}, ...]
    op.add_column(
        "pedido_itens",
        sa.Column("adicionais", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade():
    op.drop_column("pedido_itens", "adicionais")
    op.drop_constraint("fk_itens_adicional_de", "itens", type="foreignkey")
    op.drop_column("itens", "adicional_de")
