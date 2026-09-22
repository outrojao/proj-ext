#include <WiFi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

LiquidCrystal_I2C LCD = LiquidCrystal_I2C(0x27, 16, 2);
const int RED_LIGHT = 19;
const int GREEN_LIGHT = 5;
const int BLUE_LIGHT = 18;

#define WIFI_SSID     "Wokwi-GUEST"
#define WIFI_PASSWORD     ""
#define API_KEY_ESP32 "sua-chave-esp32-aqui"
#define BACKEND_HOST "proj-ext-api.onrender.com"
#define BACKEND_PORT 443
#define BACKEND_WS_PATH "/ws/esp32?api_key=" API_KEY_ESP32

#define DISPLAY_TIMEOUT_SECONDS 600

const unsigned long DISPLAY_TIMEOUT_MS =
  DISPLAY_TIMEOUT_SECONDS * 1000UL;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;

WebSocketsClient webSocket;
int currentOrderId = -1;
int currentOrderNumber = -1;
unsigned long orderDisplayedAt = 0;
unsigned long lastWiFiReconnectAttempt = 0;
bool webSocketConnected = false;
bool timeoutPending = false;
int timeoutOrderId = -1;
int timeoutOrderNumber = -1;

void setColor(int redValue, int greenValue,  int blueValue) {
  analogWrite(RED_LIGHT, redValue);
  analogWrite(GREEN_LIGHT,  greenValue);
  analogWrite(BLUE_LIGHT, blueValue);
}

void spinner() {
  static int8_t counter = 0;
  const char* glyphs = "\xa1\xa5\xdb";
  LCD.setCursor(15, 1);
  LCD.print(glyphs[counter++]);
  if (counter == strlen(glyphs)) {
    counter = 0;
  }
}

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
  orderDisplayedAt = 0;
  setColor(0, 0, 0);
  showMessage("Aguardando", "pedido...");
}

void showCurrentOrder() {
  char orderText[17];
  snprintf(orderText, sizeof(orderText), "PEDIDO #%d", currentOrderNumber);
  showMessage(orderText, "Dirija-se ao caixa");
  setColor(0, 255, 0);
}

void sendPanelEvent(
    const char* eventName,
    int orderId,
    int orderNumber
) {
  if (!webSocketConnected) {
    return;
  }

  JsonDocument message;
  message["event"] = eventName;
  JsonObject data = message["data"].to<JsonObject>();
  data["pedido_id"] = orderId;
  data["numero"] = orderNumber;
  if (strcmp(eventName, "tempo_excedido") == 0) {
    data["tempo_exibicao"] = DISPLAY_TIMEOUT_SECONDS;
  }

  String serializedMessage;
  serializeJson(message, serializedMessage);
  webSocket.sendTXT(serializedMessage);

  if (strcmp(eventName, "tempo_excedido") == 0) {
    timeoutPending = false;
  }
}

void sendPendingTimeout() {
  if (!timeoutPending) {
    return;
  }

  sendPanelEvent(
      "tempo_excedido",
      timeoutOrderId,
      timeoutOrderNumber
  );
}

void processWebSocketMessage(uint8_t* payload, size_t length) {
  JsonDocument message;
  DeserializationError error = deserializeJson(message, payload, length);
  if (error) {
    Serial.printf("Invalid WebSocket JSON: %s\n", error.c_str());
    return;
  }

  const char* eventName = message["event"] | "";
  JsonVariant data = message["data"];
  if (data.isNull()) {
    data = message.as<JsonVariant>();
  }

  if (strcmp(eventName, "pedido_pronto") == 0) {
    currentOrderId = data["pedido_id"] | -1;
    currentOrderNumber = data["numero"] | -1;
    if (currentOrderId < 0 || currentOrderNumber < 0) {
      Serial.println("pedido_pronto missing order data");
      return;
    }

    orderDisplayedAt = millis();
    showCurrentOrder();
    sendPanelEvent("painel_pronto", currentOrderId, currentOrderNumber);
    return;
  }

  if (strcmp(eventName, "pedido_entregue") == 0) {
    int deliveredOrderId = data["pedido_id"] | -1;
    if (deliveredOrderId == currentOrderId) {
      clearCurrentOrder();
    }
    return;
  }

  if (strcmp(eventName, "fila_vazia") == 0) {
    clearCurrentOrder();
    return;
  }

  Serial.printf("Unknown WebSocket event: %s\n", eventName);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      webSocketConnected = false;
      setColor(255, 0, 0);
      showMessage("API offline", "Reconectando...");
      Serial.println("WebSocket disconnected");
      break;

    case WStype_CONNECTED:
      webSocketConnected = true;
      setColor(0, 255, 0);
      showMessage("API conectada", "Aguardando...");
      Serial.println("WebSocket connected");
      sendPendingTimeout();
      break;

    case WStype_TEXT:
      processWebSocketMessage(payload, length);
      break;

    default:
      break;
  }
}

void connectWebSocket() {
  webSocket.beginSSL(BACKEND_HOST, BACKEND_PORT, BACKEND_WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void reconnectWiFiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  webSocketConnected = false;
  if (millis() - lastWiFiReconnectAttempt < WIFI_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastWiFiReconnectAttempt = millis();
  setColor(255, 0, 0);
  showMessage("WiFi offline", "Reconectando...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
}

void checkDisplayTimeout() {
  if (currentOrderId < 0 || orderDisplayedAt == 0) {
    return;
  }

  if (millis() - orderDisplayedAt >= DISPLAY_TIMEOUT_MS) {
    timeoutOrderId = currentOrderId;
    timeoutOrderNumber = currentOrderNumber;
    timeoutPending = true;
    setColor(255, 255, 0);
    clearCurrentOrder();
    orderDisplayedAt = 0;
    sendPendingTimeout();
  }
}

void printLocalTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    LCD.setCursor(0, 1);
    LCD.println("Connection Err");
    return;
  }

  LCD.setCursor(8, 0);
  LCD.println(&timeinfo, "%H:%M:%S");

  LCD.setCursor(0, 1);
  LCD.println(&timeinfo, "%d/%m/%Y   %Z");
}

void setup() {
  Serial.begin(115200);

  LCD.init();
  LCD.backlight();
  showMessage("Conectando", "WiFi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    setColor(255,0,0); //RED ON
    spinner();
    delay(250);
    setColor(0,0,0); //RED OFF
  }

  setColor(0,255,0); // GREEN ON
  Serial.println("");
  Serial.println("WiFi connected!");
  showMessage("WiFi conectado", "Conectando API");
  delay(1000);
  setColor(0,0,0); // GREEN OFF
  connectWebSocket();
}

void loop() {
  reconnectWiFiIfNeeded();
  webSocket.loop();
  checkDisplayTimeout();
}