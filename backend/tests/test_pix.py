"""
Testes do payload Pix (estilo EMV) e do QR Code.
"""

import base64

from pix import build_pix_payload, crc16_ccitt, pix_qr_base64


def test_crc16_check_value_padrao():
    """Check value da família CRC-16/CCITT-FALSE (o algoritmo usado no Pix)."""
    assert crc16_ccitt("123456789") == "29B1"


def test_payload_prefixo_e_campos():
    payload = build_pix_payload("12345678901", "Loja", "Recife", 42.5, "PED1")
    assert payload.startswith("000201")
    assert "010212" in payload  # campo 01 = MCC "12"
    assert "0014br.gov.bcb.pix" in payload
    assert "52040000" in payload
    assert "5303986" in payload
    assert "540542.50" in payload
    assert "5802BR" in payload
    assert "5904Loja" in payload
    assert "6006Recife" in payload
    assert "62080504PED1" in payload
    assert payload[-8:-6] == "63"


def test_payload_crc_valido():
    payload = build_pix_payload("chave@teste.com", "Nome", "Cidade", 10.0, "PED1")
    body = payload[:-4]
    assert crc16_ccitt(body) == payload[-4:]


def test_payload_deterministico():
    a = build_pix_payload("chave@teste.com", "Nome", "Cidade", 10.0, "PED7")
    b = build_pix_payload("chave@teste.com", "Nome", "Cidade", 10.0, "PED7")
    assert a == b


def test_truncamento_nome_e_cidade():
    payload = build_pix_payload("k", "A" * 40, "B" * 30, 1.0, "PED9")
    assert f"5925{'A' * 25}" in payload
    assert f"6015{'B' * 15}" in payload
    assert "A" * 26 not in payload
    assert "B" * 16 not in payload


def test_valor_formato_dois_decimais():
    assert "540510.00" in build_pix_payload("k", "N", "C", 10, "PED1")
    assert "54040.50" in build_pix_payload("k", "N", "C", 0.5, "PED1")
    assert "5406123.45" in build_pix_payload("k", "N", "C", 123.45, "PED1")


def test_qr_base64_png():
    uri = pix_qr_base64(build_pix_payload("k", "N", "C", 1.0, "PED1"))
    assert uri.startswith("data:image/png;base64,")
    raw = base64.b64decode(uri.split(",", 1)[1])
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"
