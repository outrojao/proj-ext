.PHONY: install run dev test clean

install:
	pip install -r requirements.txt
	cp .env.example .env
	@echo "Instalação concluída! Edite o arquivo .env com suas API keys."

run:
	uvicorn main:app --host 0.0.0.0 --port $${PORT:-8000}

dev:
	uvicorn main:app --reload --host 0.0.0.0 --port $${PORT:-8000}

migrate:
	alembic upgrade head

test:
	pip install -r requirements-dev.txt
	pytest -v

clean:
	rm -rf venv __pycache__ routers/__pycache__ tests/__pycache__
