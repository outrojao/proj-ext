
#include <WiFi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// --------------------------------------------------
// LCD I2C
// --------------------------------------------------

#define I2C_SDA 23
#define I2C_SCL 22

LiquidCrystal_I2C LCD(0x27, 16, 2);

// --------------------------------------------------
// LED RGB - CATODO COMUM
// --------------------------------------------------

const int RED_LIGHT = 14;
const int GREEN_LIGHT = 12;
const int BLUE_LIGHT = 13;

// --------------------------------------------------
// WIFI REAL
// --------------------------------------------------

#define WIFI_SSID "Desktop_F5927578"
#define WIFI_PASSWORD "2951191203180462"

// --------------------------------------------------
// BACKEND LOCAL
// --------------------------------------------------

#define API_KEY_ESP32 "7ojPfK7zX6d5cJkWuJq1IoVuXF2cp37c"

#define BACKEND_HOST "proj-ext-api.onrender.com"
#define BACKEND_PORT 443

#define BACKEND_WS_PATH "/ws/esp32?api_key=" API_KEY_ESP32

// --------------------------------------------------
// CONFIGURACOES
// --------------------------------------------------

#define DISPLAY_TIMEOUT_SECONDS 600

const unsigned long DISPLAY_TIMEOUT_MS =
    DISPLAY_TIMEOUT_SECONDS * 1000UL;

const unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;

WebSocketsClient webSocket;

int currentOrderId = -1;
int currentOrderNumber = -1;

// Nome opcional do cliente (máximo 40 caracteres)
char currentCustomerName[41] = "";

unsigned long orderDisplayedAt = 0;
unsigned long lastWiFiReconnectAttempt = 0;

bool webSocketConnected = false;

// --------------------------------------------------
// LED RGB
// --------------------------------------------------

void setColor(int redValue, int greenValue, int blueValue) {
    analogWrite(RED_LIGHT, redValue);
    analogWrite(GREEN_LIGHT, greenValue);
    analogWrite(BLUE_LIGHT, blueValue);
}

// --------------------------------------------------
// LCD
// --------------------------------------------------

void showMessage(const char* line1, const char* line2 = "") {

    LCD.clear();

    LCD.setCursor(0, 0);
    LCD.print(line1);

    LCD.setCursor(0, 1);
    LCD.print(line2);
}

void clearCurrentOrder() {

    currentOrderId = -1;
    currentOrderNumber = -1;

    // Limpa o nome do cliente
    currentCustomerName[0] = '\0';

    orderDisplayedAt = 0;

    setColor(0, 0, 0);

    showMessage("Aguardando", "pedido...");
}

// --------------------------------------------------
// EXIBIR PEDIDO ATUAL
// --------------------------------------------------

void showCurrentOrder() {

    char orderText[17];
    char secondLine[17];

    // Primeira linha: número do pedido
    snprintf(
        orderText,
        sizeof(orderText),
        "PEDIDO #%d",
        currentOrderNumber
    );

    // Segunda linha: nome do cliente ou RETIRADA
    if (strlen(currentCustomerName) > 0) {

        snprintf(
            secondLine,
            sizeof(secondLine),
            "%.16s",
            currentCustomerName
        );

    } else {

        snprintf(
            secondLine,
            sizeof(secondLine),
            "RETIRADA"
        );
    }

    showMessage(orderText, secondLine);

    setColor(0, 255, 0);

    orderDisplayedAt = millis();
}

// --------------------------------------------------
// PROCESSAMENTO DOS EVENTOS
// --------------------------------------------------

void processWebSocketMessage(uint8_t* payload, size_t length) {

    JsonDocument message;

    DeserializationError error =
        deserializeJson(message, payload, length);

    if (error) {

        Serial.printf(
            "Erro ao interpretar JSON: %s\n",
            error.c_str()
        );

        return;
    }

    const char* eventName = message["event"] | "";

    JsonVariant data = message["data"];

    if (data.isNull()) {
        data = message.as<JsonVariant>();
    }

    Serial.printf("Evento recebido: %s\n", eventName);

    // --------------------------------------------------
    // PEDIDO PRONTO
    // --------------------------------------------------

    if (strcmp(eventName, "pedido_pronto") == 0) {

        int orderId = data["pedido_id"] | -1;
        int orderNumber = data["numero"] | -1;

        if (orderId < 0 || orderNumber < 0) {

            Serial.println("Dados do pedido invalidos.");

            return;
        }

        // Recebe o nome opcional
        const char* customerName = data["nome_cliente"] | "";

        strncpy(
            currentCustomerName,
            customerName,
            sizeof(currentCustomerName) - 1
        );

        currentCustomerName[
            sizeof(currentCustomerName) - 1
        ] = '\0';

        currentOrderId = orderId;
        currentOrderNumber = orderNumber;

        Serial.printf(
            "Pedido recebido: ID=%d | Numero=%d | Cliente=%s\n",
            currentOrderId,
            currentOrderNumber,
            strlen(currentCustomerName) > 0
                ? currentCustomerName
                : "Sem nome"
        );

        showCurrentOrder();

        return;
    }

    // --------------------------------------------------
    // PEDIDO ENTREGUE
    // --------------------------------------------------

    if (strcmp(eventName, "pedido_entregue") == 0) {

        int deliveredOrderId = data["pedido_id"] | -1;

        if (deliveredOrderId == currentOrderId) {

            Serial.println("Pedido entregue.");

            clearCurrentOrder();
        }

        return;
    }

    // --------------------------------------------------
    // FILA VAZIA
    // --------------------------------------------------

    if (strcmp(eventName, "fila_vazia") == 0) {

        Serial.println("Nenhum pedido na fila.");

        clearCurrentOrder();

        return;
    }

    Serial.printf("Evento desconhecido: %s\n", eventName);
}

// --------------------------------------------------
// WEBSOCKET
// --------------------------------------------------

void webSocketEvent(
    WStype_t type,
    uint8_t* payload,
    size_t length
) {

    switch (type) {

        case WStype_DISCONNECTED:

            webSocketConnected = false;

            setColor(255, 0, 0);

            showMessage("API offline", "Reconectando...");

            Serial.println("WebSocket desconectado.");

            break;

        case WStype_CONNECTED:

            webSocketConnected = true;

            setColor(0, 0, 255);

            showMessage("API conectada", "Aguardando pedido");

            Serial.println("WebSocket conectado.");

            break;

        case WStype_TEXT:

            processWebSocketMessage(payload, length);

            break;

        case WStype_ERROR:

            Serial.println("Erro no WebSocket.");

            break;

        default:

            break;
    }
}

void connectWebSocket() {

    // Registra o evento antes de iniciar a conexão
    webSocket.onEvent(webSocketEvent);

    webSocket.beginSSL(
        BACKEND_HOST,
        BACKEND_PORT,
        BACKEND_WS_PATH
    );

    webSocket.setReconnectInterval(5000);

    Serial.println("Iniciando conexao WebSocket...");

    Serial.print("Backend: ");
    Serial.println(BACKEND_HOST);
}

// --------------------------------------------------
// WIFI
// --------------------------------------------------

void reconnectWiFiIfNeeded() {

    if (WiFi.status() == WL_CONNECTED) {
        return;
    }

    webSocketConnected = false;

    if (
        millis() - lastWiFiReconnectAttempt <
        WIFI_RECONNECT_INTERVAL_MS
    ) {
        return;
    }

    lastWiFiReconnectAttempt = millis();

    setColor(255, 0, 0);

    showMessage("WiFi offline", "Reconectando...");

    Serial.println("Tentando reconectar WiFi...");

    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// --------------------------------------------------
// TEMPO DE EXIBICAO
// --------------------------------------------------

void checkDisplayTimeout() {

    if (
        currentOrderId < 0 ||
        orderDisplayedAt == 0 ||
        !webSocketConnected
    ) {
        return;
    }

    if (
        millis() - orderDisplayedAt >=
        DISPLAY_TIMEOUT_MS
    ) {

        Serial.println(
            "Tempo de exibicao expirado. Reconectando WebSocket."
        );

        orderDisplayedAt = 0;

        setColor(255, 255, 0);

        showMessage("Atualizando fila", "Aguarde...");

        webSocket.disconnect();
    }
}

// --------------------------------------------------
// SETUP
// --------------------------------------------------

void setup() {

    Serial.begin(115200);

    // Inicializacao I2C
    Wire.begin(I2C_SDA, I2C_SCL);

    // Inicializacao LCD
    LCD.init();
    LCD.backlight();

    // Inicializacao LED RGB
    pinMode(RED_LIGHT, OUTPUT);
    pinMode(GREEN_LIGHT, OUTPUT);
    pinMode(BLUE_LIGHT, OUTPUT);

    setColor(0, 0, 0);

    showMessage("Iniciando painel", "Conectando WiFi...");

    // Conectar ao WiFi
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Conectando ao WiFi");

    while (WiFi.status() != WL_CONNECTED) {

        delay(500);

        setColor(255, 0, 0);

        Serial.print(".");
    }

    Serial.println();
    Serial.println("WiFi conectado!");

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    setColor(0, 255, 0);

    showMessage("WiFi conectado", "Conectando API...");

    delay(1000);

    // Conectar ao backend
    connectWebSocket();
}

// --------------------------------------------------
// LOOP
// --------------------------------------------------

void loop() {

    reconnectWiFiIfNeeded();

    if (WiFi.status() == WL_CONNECTED) {

        webSocket.loop();
    }

    checkDisplayTimeout();
}