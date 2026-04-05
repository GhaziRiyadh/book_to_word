"""start

Revision ID: 687083db5d82
Revises: 
Create Date: 2026-04-05 20:06:26.807725

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '687083db5d82'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema - Full Initial Schema."""
    # Create books table
    op.create_table(
        'books',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_books_title'), 'books', ['title'], unique=False)

    # Create pages table
    op.create_table(
        'pages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('book_id', sa.String(), nullable=True),
        sa.Column('page_number', sa.Integer(), nullable=True),
        sa.Column('image_path', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create ocr_results table
    op.create_table(
        'ocr_results',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('page_id', sa.String(), nullable=True),
        sa.Column('extracted_text', sa.Text(), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('embedding', sa.LargeBinary(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['page_id'], ['pages.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('ocr_results')
    op.drop_table('pages')
    op.drop_index(op.f('ix_books_title'), table_name='books')
    op.drop_table('books')
