"""
Router de itens do cardápio.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Item
from schemas import ItemCreate, ItemResponse

router = APIRouter(prefix="/itens", tags=["itens"])


@router.get("", response_model=list[ItemResponse])
def listar_itens(disponivel: bool | None = None, db: Session = Depends(get_db)):
    """Lista todos os itens do cardápio. Filtra por disponibilidade se informado."""
    query = db.query(Item)
    if disponivel is not None:
        query = query.filter(Item.disponivel == disponivel)
    return query.all()


@router.post("", response_model=ItemResponse, status_code=201)
def criar_item(item: ItemCreate, db: Session = Depends(get_db)):
    """Cria um novo item no cardápio."""
    db_item = Item(
        nome=item.nome,
        descricao=item.descricao,
        preco=item.preco,
        disponivel=item.disponivel,
        imagem=item.imagem,
        categoria=item.categoria,
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.get("/{item_id}", response_model=ItemResponse)
def obter_item(item_id: int, db: Session = Depends(get_db)):
    """Obtém um item específico por ID."""
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return item


@router.put("/{item_id}", response_model=ItemResponse)
def atualizar_item(item_id: int, item: ItemCreate, db: Session = Depends(get_db)):
    """Atualiza um item do cardápio."""
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    db_item.nome = item.nome
    db_item.descricao = item.descricao
    db_item.preco = item.preco
    db_item.disponivel = item.disponivel
    db_item.imagem = item.imagem
    db_item.categoria = item.categoria
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{item_id}", status_code=204)
def deletar_item(item_id: int, db: Session = Depends(get_db)):
    """Remove um item do cardápio."""
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    db.delete(db_item)
    db.commit()
