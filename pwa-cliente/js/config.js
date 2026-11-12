// ÚNICO lugar para parâmetros do PWA.
export const CONFIG = {
  // TESTE LOCAL — backend dev rodando em http://localhost:8000 (.env temporário).
  // Para produção, troque pelos valores abaixo:
  // API_BASE: "https://proj-ext-api.onrender.com",
  // API_KEY: "sua-chave-pwa-cliente-aqui",
  API_BASE: "http://localhost:8000",
  API_KEY: "sua-chave-pwa-aqui",
  NOME_LOJA: "LutzGrill",

  // Modo demo: simula itens, pedido, confirmação da loja e aprovação do Pix
  // sem backend. Usar para testar o fluxo de ponta a ponta.
  MODO_DEMO: false, // TESTE LOCAL: false (backend dev em http://localhost:8000)
  MODO_DEMO_APROVA_MS: 8000, // tempo até o Pix "cair" no demo
  DEMO_CONFIRMAR_MS: 6000, // tempo até a "loja" confirmar o pedido no demo

  // Sessão salva (cookie + sessionStorage): expira após 5 min de inatividade
  TTL_MS: 300000,

  // Pollings
  POLL_STATUS_MS: 4000,
  POLL_PIX_MS: 3000,
  PIX_TIMEOUT_MS: 600000, // 10 min antes de oferecer "gerar novo QR"

  // Agendamento: somente para hoje
  AVISO_MIN: 20, // minutos mínimos de preparo p/ descartar slots passados
  HORARIO: { abre: "08:00", fecha: "22:00", passo_min: 15 },
};
