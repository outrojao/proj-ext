#include <WiFi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C LCD = LiquidCrystal_I2C(0x27, 16, 2);
const int RED_LIGHT = 19;
const int GREEN_LIGHT = 5;
const int BLUE_LIGHT = 18;

#define WIFI_SSID     "Wokwi-GUEST"
#define WIFI_PASSWORD     ""

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
  LCD.setCursor(0, 0);
  LCD.print("Connecting to ");
  LCD.setCursor(0, 1);
  LCD.print("WiFi ");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    setColor(255,0,0); //RED ON
    spinner();
    delay(250);
    setColor(0,0,0); //RED OFF
  }

  LCD.clear();
  setColor(0,255,0); // GREEN ON
  Serial.println("");
  Serial.println("WiFi connected!");
  LCD.print("Online!");
  LCD.setCursor(0,0);
  delay(1000);
  setColor(0,0,0); // GREEN OFF
  LCD.clear();
}

void loop() {
  //BUSCAR OS PEDIDOS DA LISTA E SEMPRE MOSTRAR O PRIMEIRO QUE TIVER STATUS DE PRONTO
  // ACENDE A LUZ AMARELO QUANDO O MESMO PEDIDO ESTIVER APARECENDO POR TEMPO DEMAIS EX: 10min
  // SE O PEDIDO ULTRAPASSAR O LIMITE DE 10min PASSA PRO PROXIMO DA LISTA
  LCD.print("0-0");
  LCD.setCursor(0,0);
  delay(250);
  LCD.clear();
}