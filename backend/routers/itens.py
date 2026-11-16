"""
Router de itens do cardápio.
"""

import os
from uuid import uuid4

import boto3
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import tipo_cliente
from database import get_db
from models import Item
from schemas import ItemCreate, ItemResponse

router = APIRouter(prefix="/itens", tags=["itens"])

# Imagens do cardápio → Cloudflare R2: o admin PWA faz o upload direto na
# R2 (PUT presigned); este endpoint só assina a URL. Especificação em
# PLANO-IMAGEM-CARDAPIO-UPLOAD.md (raiz do projeto).
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "lutzgrill-imagens")
R2_PUBLIC_BASE = os.getenv("R2_PUBLIC_BASE", "").rstrip("/")

_s3 = None


def _cliente_s3():
    """Cliente S3/R2 (lazy). Nos testes, monkeypatch `mod_itens._s3` com um fake."""
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",  # exigido pelo SDK, não usado pela R2
        )
    return _s3


def validar_aplica_em(db: Session, item_id: int | None, aplica_em: list[int] | None) -> None:
    """
    Valida a aplicabilidade de um adicional (M:N com itens-base).

    Regras por alvo: precisa existir, não pode ser o próprio item (no
    update) e não pode ser ele próprio um adicional (aprofundar só 1
    nível — "adicional de adicional" não existe no fluxo do cardápio).
    `aplica_em=None` = item comum: nada a validar.
    """
    if aplica_em is None:
        return
    for alvo_id in set(aplica_em):
        if item_id is not None and alvo_id == item_id:
            raise HTTPException(status_code=400, detail="Item não pode aplicar em si mesmo")
        alvo = db.query(Item).filter(Item.id == alvo_id).first()
        if not alvo:
            raise HTTPException(status_code=400, detail=f"Item-base {alvo_id} não encontrado")
        if alvo.aplica_em is not None:
            raise HTTPException(status_code=400, detail=f"'{alvo.nome}' já é adicional de outro item")


@router.get("", response_model=list[ItemResponse])
def listar_itens(disponivel: bool | None = None, db: Session = Depends(get_db)):
    """Lista todos os itens do cardápio. Filtra por disponibilidade se informado."""
    query = db.query(Item)
    if disponivel is not None:
        query = query.filter(Item.disponivel == disponivel)
    return query.all()


@router.post("", response_model=ItemResponse, status_code=201)
def criar_item(item: ItemCreate, request: Request, db: Session = Depends(get_db)):
    """Cria um novo item no cardápio (com ou sem vínculo de adicional)."""
    if tipo_cliente(request.headers.get("X-API-Key")) != "pwa_admin":
        raise HTTPException(status_code=401, detail="Apenas o admin pode cadastrar itens")
    if item.aplica_em is not None and not item.aplica_em:
        raise HTTPException(status_code=400, detail="Adicional precisa de pelo menos um item-base")
    validar_aplica_em(db, None, item.aplica_em)
    db_item = Item(
        nome=item.nome,
        descricao=item.descricao,
        preco=item.preco,
        disponivel=item.disponivel,
        imagem=item.imagem,
        categoria=item.categoria,
        aplica_em=item.aplica_em,
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
def atualizar_item(item_id: int, item: ItemCreate, request: Request, db: Session = Depends(get_db)):
    """Atualiza um item do cardápio."""
    if tipo_cliente(request.headers.get("X-API-Key")) != "pwa_admin":
        raise HTTPException(status_code=401, detail="Apenas o admin pode alterar itens")
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    # Atribuição sempre (inclusive None): o form do admin envia o campo em
    # todo PUT — lista = adicional, None = item comum.
    validar_aplica_em(db, item_id, item.aplica_em)
    # Um adicional nunca fica sem item-base: sem base ele não existe no
    # cardápio do cliente (adicionais só aparecem alinhados a um item-base).
    if db_item.aplica_em and not item.aplica_em:
        raise HTTPException(
            status_code=400,
            detail="Adicional precisa de pelo menos um item-base — para tirar do cardápio, remova o item",
        )
    db_item.nome = item.nome
    db_item.descricao = item.descricao
    db_item.preco = item.preco
    db_item.disponivel = item.disponivel
    db_item.imagem = item.imagem
    db_item.categoria = item.categoria
    db_item.aplica_em = item.aplica_em
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{item_id}", status_code=204)
def deletar_item(item_id: int, request: Request, db: Session = Depends(get_db)):
    """Remove um item do cardápio.

    Os adicionais que aplicam no item perdem esse id (desvinculam — e
    sobrevivem, porque podem servir a outros itens). Se era o ÚNICO
    item-base do adicional, o adicional também é removido: sem base, ele
    não existe no cardápio do cliente.

    shortcut: varre todos os itens em Python em vez de filtrar no banco —
    JSONB armazena None como JSON null, então IS NOT NULL não separa
    item-base de adicional; o cardápio é pequeno, o scan basta.
    """
    if tipo_cliente(request.headers.get("X-API-Key")) != "pwa_admin":
        raise HTTPException(status_code=401, detail="Apenas o admin pode excluir itens")
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    for ad in db.query(Item).all():
        if ad.aplica_em and item_id in ad.aplica_em:
            restantes = [alvo for alvo in ad.aplica_em if alvo != item_id]
            if restantes:
                ad.aplica_em = restantes
            else:
                db.delete(ad)
    db.delete(db_item)
    db.commit()


class AutorizacaoImagem(BaseModel):
    nome: str
    tipo: str
    tamanho: int


@router.post("/imagem/autorizacao", status_code=201)
def autorizar_imagem(dados: AutorizacaoImagem, request: Request):
    """
    Autoriza o upload direto do admin PWA para a R2 (presigned PUT de 15 min).
    O arquivo NUNCA passa pelo backend — ele apenas assina a URL. O browser
    faz o PUT com o Content-Type exato devolvido (travado na assinatura).
    """
    if tipo_cliente(request.headers.get("X-API-Key")) != "pwa_admin":
        raise HTTPException(status_code=401, detail="Chave de API inválida para esta operação")
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_PUBLIC_BASE):
        raise HTTPException(status_code=503, detail="Hospedagem de imagens não configurada (variáveis R2_*)")

    TIPO_MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    ext = dados.nome.rsplit(".", 1)[-1].lower() if "." in dados.nome else ""
    if ext not in TIPO_MIME or dados.tipo != TIPO_MIME[ext]:
        raise HTTPException(status_code=400, detail="Formato inválido (aceitos: jpg, png, webp)")
    if dados.tamanho > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem acima de 5 MB")

    mime = TIPO_MIME[ext]
    chave = f"imagem-{uuid4().hex}.{ext}"
    # Assinatura local (sem rede): trava bucket+chave+Content-Type por 15 min
    upload_url = _cliente_s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": R2_BUCKET, "Key": chave, "ContentType": mime},
        ExpiresIn=900,
    )
    return {
        "chave": chave,
        "url": f"{R2_PUBLIC_BASE}/{chave}",
        "uploadUrl": upload_url,
        "contentType": mime,
    }
