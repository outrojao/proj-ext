"""create initial PostgreSQL schema

Revision ID: 0001_initial_schema
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("CREATE SEQUENCE pedido_numero_seq START WITH 1"))

    op.create_table(
        "itens",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("nome", sa.String(), nullable=False),
        sa.Column("descricao", sa.String(), nullable=True),
        sa.Column("preco", sa.Numeric(10, 2), nullable=False),
        sa.Column("disponivel", sa.Boolean(), nullable=True),
    )
    op.create_index("ix_itens_id", "itens", ["id"])

    op.create_table(
        "pedidos",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("numero", sa.Integer(), nullable=True),
        sa.Column("horario_agendamento", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("origem", sa.String(), nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
    )
    op.create_index("ix_pedidos_id", "pedidos", ["id"])
    op.create_index("ix_pedidos_numero", "pedidos", ["numero"])

    op.create_table(
        "pedido_itens",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("pedido_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"]),
        sa.ForeignKeyConstraint(["item_id"], ["itens.id"]),
    )
    op.create_index("ix_pedido_itens_id", "pedido_itens", ["id"])


def downgrade():
    op.drop_index("ix_pedido_itens_id", table_name="pedido_itens")
    op.drop_table("pedido_itens")
    op.drop_index("ix_pedidos_numero", table_name="pedidos")
    op.drop_index("ix_pedidos_id", table_name="pedidos")
    op.drop_table("pedidos")
    op.drop_index("ix_itens_id", table_name="itens")
    op.drop_table("itens")
    op.execute(sa.text("DROP SEQUENCE pedido_numero_seq"))
