"""add LCD panel display state to orders

Revision ID: 0002_painel_display_state
Revises: 0001_initial_schema
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_painel_display_state"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pedidos", sa.Column("painel_status", sa.String(), nullable=True))
    op.add_column("pedidos", sa.Column("painel_exibido_em", sa.DateTime(), nullable=True))
    op.add_column("pedidos", sa.Column("painel_expirado_em", sa.DateTime(), nullable=True))
    op.add_column("pedidos", sa.Column("painel_entregue_em", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("pedidos", "painel_entregue_em")
    op.drop_column("pedidos", "painel_expirado_em")
    op.drop_column("pedidos", "painel_exibido_em")
    op.drop_column("pedidos", "painel_status")