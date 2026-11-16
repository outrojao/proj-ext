"""Testes de POST /itens/imagem/autorizacao (presigned URL, sem rede)."""

import types

import routers.itens as mod_itens

ADMIN_KEY = "test-key-app"
CLIENTE_KEY = "test-key-pwa"
PUBLICO = "https://pub-abc123.r2.dev"


def _fake_s3():
    def assinar(metodo, Params, ExpiresIn):
        assert metodo == "put_object" and Params["Bucket"] == "lutzgrill-imagens"
        assert Params["Key"].startswith("imagem-") and ExpiresIn == 900
        return f"https://1234.r2.cloudflarestorage.com/lutzgrill-imagens/{Params['Key']}?X-Amz-Signature=abc"
    return types.SimpleNamespace(generate_presigned_url=assinar)


def _env_r2(monkeypatch):
    monkeypatch.setattr(mod_itens, "R2_ACCOUNT_ID", "1234")
    monkeypatch.setattr(mod_itens, "R2_ACCESS_KEY_ID", "id-teste")
    monkeypatch.setattr(mod_itens, "R2_SECRET_ACCESS_KEY", "segredo-teste")
    monkeypatch.setattr(mod_itens, "R2_PUBLIC_BASE", PUBLICO)
    monkeypatch.setattr(mod_itens, "R2_BUCKET", "lutzgrill-imagens")
    monkeypatch.setattr(mod_itens, "_s3", _fake_s3())


def _chamar(client, payload, key=ADMIN_KEY):
    return client.post("/itens/imagem/autorizacao", json=payload, headers={"X-API-Key": key})


def test_autorizacao_ok(client, monkeypatch):
    _env_r2(monkeypatch)
    resposta = _chamar(client, {"nome": "foto.jpeg", "tipo": "image/jpeg", "tamanho": 1024})
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["url"].startswith(PUBLICO + "/imagem-") and corpo["url"].endswith(".jpeg")
    assert corpo["chave"] in corpo["uploadUrl"]
    assert "lutzgrill-imagens/" in corpo["uploadUrl"] and "X-Amz-Signature" in corpo["uploadUrl"]
    assert corpo["contentType"] == "image/jpeg"


def test_tipo_nao_confere_com_extensao_400(client, monkeypatch):
    _env_r2(monkeypatch)
    assert _chamar(client, {"nome": "foto.png", "tipo": "image/jpeg", "tamanho": 10}).status_code == 400


def test_extensao_invalida_400(client, monkeypatch):
    _env_r2(monkeypatch)
    assert _chamar(client, {"nome": "foto.gif", "tipo": "image/gif", "tamanho": 10}).status_code == 400
    assert _chamar(client, {"nome": "semextensao", "tipo": "image/png", "tamanho": 10}).status_code == 400


def test_acima_de_5mb_400(client, monkeypatch):
    _env_r2(monkeypatch)
    assert _chamar(client, {"nome": "foto.png", "tipo": "image/png", "tamanho": 5 * 1024 * 1024 + 1}).status_code == 400


def test_chave_do_cliente_401(client, monkeypatch):
    _env_r2(monkeypatch)
    assert _chamar(client, {"nome": "foto.png", "tipo": "image/png", "tamanho": 10}, key=CLIENTE_KEY).status_code == 401


def test_sem_config_r2_503(client, monkeypatch):
    _env_r2(monkeypatch)
    monkeypatch.setattr(mod_itens, "R2_ACCOUNT_ID", "")
    assert _chamar(client, {"nome": "foto.png", "tipo": "image/png", "tamanho": 10}).status_code == 503
