import base64
import io
import unicodedata
import qrcode


def _sanitizar(texto: str) -> str:
    """Remove acentos e caracteres especiais para compatibilidade ASCII."""
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _tlv(id: str, value: str) -> str:
    """Monta um campo TLV: id (2) + tamanho (2) + valor."""
    return f"{id}{len(value):02d}{value}"


def crc16_ccitt(data: str) -> str:
    """CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF)."""
    crc = 0xFFFF
    for byte in data.encode("ascii"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if (crc & 0x8000) else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def build_pix_payload(chave: str, nome: str, cidade: str, valor: float, txid: str) -> str:
    """
    Monta o payload Pix Estático "copia e cola" completo (com CRC16 no final).
    """
    nome = _sanitizar(nome).strip()[:25]
    cidade = _sanitizar(cidade).strip()[:15]
    # No Pix estático, o txid só pode conter letras e números (a-z, A-Z, 0-9) ou "***"
    txid = _sanitizar(txid).strip()[:25] or "***"

    # Campo 26 deve conter apenas o GUI (00) e a Chave Pix (01)
    merchant_account = (
        _tlv("00", "BR.GOV.BCB.PIX")
        + _tlv("01", chave.strip())
    )
    campo_62 = _tlv("05", txid)

    body = (
        _tlv("00", "01")
        # Campo 01 omitido (ou "11" para estático; nunca "12" sem URL dinâmica)
        + _tlv("26", merchant_account)
        + _tlv("52", "0000")
        + _tlv("53", "986")
        + (_tlv("54", f"{valor:.2f}") if valor and valor > 0 else "")
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
