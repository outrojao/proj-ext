// ÚNICO lugar para parâmetros do PWA.
export const CONFIG = {
  // TESTE LOCAL — backend dev rodando em http://localhost:8000 (.env temporário).
  // Para produção, troque pelos valores abaixo (e a chave real no .env do backend):
  // API_BASE: "https://proj-ext-api.onrender.com",
  // API_KEY: "sua-chave-aqui",       // API_KEY_PWA_ADMIN do .env do backend (PRIVILEGIADA)
  API_BASE: "https://proj-ext-api.onrender.com",
  API_KEY: "TyDGPJlUNXPfQqLaXORcWaUYbrMhxxE2",
  NOME_LOJA: "LutzGrill",

  // Modo demo: simula o backend E um cliente que cria pedidos e declara
  // pagamento sem rede. O atendente age manualmente em tudo (o ponto do demo).
  // TESTE LOCAL: false (backend dev em http://localhost:8000)
  MODO_DEMO: false, // TESTE: reverter p/ false ao final
  DEMO_NOVO_PEDIDO_MS: 25000, // o "cliente" do demo cria um pedido novo a cada X ms
  DEMO_DECLARA_MS: 8000, // o "cliente" declara o pagamento X ms após o CONFIRMADO

  // Polling de fallback: a fila do painel muda SEM evento para o pwa_admin,
  // então o admin re-busca pedidos + fila-painel a cada X ms (aba visível).
  POLL_FALLBACK_MS: 15000,

  // Reconexão do WebSocket (backoff exponencial com teto)
  WS_BACKOFF_INICIAL_MS: 1000,
  WS_BACKOFF_MAX_MS: 30000,

  // Sons (padrão ligado; o toggle do header persiste em localStorage)
  SOM: true,
};
