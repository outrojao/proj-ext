"""Migra o vínculo de adicionais de 1:1 (adicional_de) para M:N (aplica_em)

Revision ID: 0008_aplica_em
Revises: 0007_adicionais
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_aplica_em"
down_revision = "0007_adicionais"
branch_labels = None
depends_on = None


def upgrade():
    # Cada item lista os ids dos itens-base onde ele vale (JSONB).
    # Não-nula (mesmo vazia) = o item é um adicional; None = item-base.
    op.add_column(
        "itens",
        sa.Column("aplica_em", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # Backfill sem perda: cada adicional antigo tinha exatamente 1 item-base.
    # (Postgres não casta integer[] → jsonb direto; array_to_json faz o meio-termo)
    op.execute("UPDATE itens SET aplica_em = ARRAY_TO_JSON(ARRAY[adicional_de]) WHERE adicional_de IS NOT NULL")
    op.drop_constraint("fk_itens_adicional_de", "itens")
    op.drop_column("itens", "adicional_de")


def downgrade():
    op.add_column("itens", sa.Column("adicional_de", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_itens_adicional_de",
        "itens",
        "itens",
        ["adicional_de"],
        ["id"],
        ondelete="CASCADE",
    )
    # O mundo antigo só cabia 1 item-base: volta o primeiro alvo da lista.
    op.execute(
        "UPDATE itens SET adicional_de = (aplica_em->>0)::int "
        "WHERE aplica_em IS NOT NULL AND jsonb_array_length(aplica_em) > 0"
    )
    op.drop_column("itens", "aplica_em")
