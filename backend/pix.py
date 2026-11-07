"""
Geração de payload Pix "copia e cola" (estilo EMV) e QR Code.

Referência: especificação EMV® MPM do Banco Central do Brasil.
O payload é determinístico por pedido (txid = PED{id}), então
regenerar é recomputar — não há estado persistido.
"""

import base64
import io

import qrcode


def _tlv(id: str, value: str) -> str:
    """Monta um campo TLV: id (2) + tamanho (2) + valor."""
    return f"{id}{len(value):02d}{value}"


def crc16_ccitt(data: str) -> str:
    """
    CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF).

    Mesma família do check value padrão da família CRC-16/CCITT-FALSE:
    crc16_ccitt("123456789") == "29B1".
    """
    crc = 0xFFFF
    for byte in data.encode("ascii"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if (crc & 0x8000) else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def build_pix_payload(chave: str, nome: str, cidade: str, valor: float, txid: str) -> str:
    """
    Monta o payload "copia e cola" completo (com CRC16 no final).

    - nome truncado a 25 caracteres
    - cidade truncada a 15 caracteres
    - txid truncado a 25 caracteres
    """
    nome = nome[:25]
    cidade = cidade[:15]
    txid = txid[:25]

    merchant_account = (
        _tlv("00", "br.gov.bcb.pix")
        + _tlv("01", chave)
        + _tlv("02", nome)
        + _tlv("03", cidade)
    )
    campo_62 = _tlv("05", txid)

    body = (
        _tlv("00", "01")
        + _tlv("01", "12")
        + _tlv("26", merchant_account)
        + _tlv("52", "0000")
        + _tlv("53", "986")
        + _tlv("54", f"{valor:.2f}")
        + _tlv("58", "BR")
        + _tlv("59", nome)
        + _tlv("60", cidade)
        + _tlv("62", campo_62)
        + "6304"
    )
    return body + crc16_ccitt(body)


def pix_qr_base64(payload: str) -> str:
    """Gera o QR Code PNG do payload como data URI base64."""
    img = qrcode.make(payload)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"
