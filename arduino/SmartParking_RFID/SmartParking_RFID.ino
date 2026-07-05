// ============================================================
//  SMART PARKING RFID - ESP32 (ACTUALIZADO)
//  Proyecto IoT: Estacionamiento vehicular con RFID + Supabase
// ============================================================
//
//  ARQUITECTURA NUEVA:
//    - 1 Lector RFID RC522: PUERTA UNICA (Entrada/Salida)
//    - 1 Lector RFID RC522: TOTEM DE PAGO AUTOMATICO
//    - 1 LCD 16x2 con modulo I2C (unico)
//    - 1 Servo SG90 (tranquera puerta unica)
//    - 3 LEDs:
//        * Verde  -> puerta abierta (ingreso/salida OK)
//        * Rojo   -> puerta cerrada / acceso denegado
//        * Pago   -> se enciende 2 seg al pagar exitosamente
//
//  MATERIALES:
//    - ESP32 (CP2102)
//    - 1x LCD 16x2 con modulo I2C (PCF8574)
//    - 1x Servo SG90 (tranquera)
//    - 2x Lector RFID RC522
//    - 3x LED (2 puerta + 1 pago)
//    - Resistencias 220 o 330 ohmios para cada LED
//
//  LIBRERIAS REQUERIDAS (instalar en Arduino IDE):
//    - MFRC522           (autor: GithubCommunity)
//    - LiquidCrystal I2C (autor: Frank de Brabander)
//    - ESP32Servo        (autor: Kevin Harrington)
//    - ArduinoJson       (autor: Benoit Blanchon) v6.x
//
//  CONFIGURACION PLACA: ESP32 Dev Module
//
// ============================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>

// ============================================================
//  CONFIGURACION - MODIFICA ESTOS VALORES
// ============================================================

// --- WiFi ---
const char* WIFI_SSID     = "HONOR X7b";
const char* WIFI_PASSWORD = "281169ender";

// --- Supabase ---
const char* SUPABASE_URL      = "https://vioxyggyvewwxqkfvuqd.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpb3h5Z2d5dmV3d3hxa2Z2dXFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTIwNzMsImV4cCI6MjA5ODc4ODA3M30.3q5Q3MqgRJ7B3ZnQ1qBve-RcJsxa2A3GB67cGSmAQ0U";

// --- Codigos de los lectores (deben coincidir con la BD) ---
const char* GATE_READER_CODE    = "GATE_READER_01";     // Puerta unica (entrada/salida)
const char* PAYMENT_READER_CODE = "PAYMENT_READER_01";  // Totem de pago automatico

// --- Direccion I2C del modulo LCD unico ---
#define LCD_ADDR  0x27   // LCD principal (unico)

// ============================================================
//  PINES ESP32
// ============================================================

//  SPI compartido para los dos RC522
#define PIN_SCK   18
#define PIN_MISO  19
#define PIN_MOSI  23

//  Lector RFID #1 - PUERTA (Entrada/Salida)
#define PIN_SS_GATE   5    // SDA / SS del RC522 de la puerta
#define PIN_RST_GATE  4    // RST del RC522 de la puerta

//  Lector RFID #2 - TOTEM DE PAGO
#define PIN_SS_PAYMENT   13   // SDA / SS del RC522 del totem
#define PIN_RST_PAYMENT  16   // RST del RC522 del totem

//  I2C para el LCD unico
#define PIN_SDA  21
#define PIN_SCL  22

//  Servo - tranquera puerta unica
#define PIN_SERVO_GATE  25

//  LEDs puerta (verde/rojo)
#define PIN_LED_GATE_GREEN  32  // Verde -> ingreso/salida permitida
#define PIN_LED_GATE_RED    33  // Rojo  -> denegado / lleno / no pagado

//  LED de pago (totem)
#define PIN_LED_PAYMENT     27  // Se enciende 2 seg al pagar exitosamente

// ============================================================
//  CONSTANTES DE COMPORTAMIENTO
// ============================================================

#define SERVO_ABIERTO   90   // grados del servo cuando la tranquera esta abierta
#define SERVO_CERRADO    0   // grados del servo cuando esta cerrada

#define TIEMPO_TRANQUERA_ABIERTA_MS     5000   // ms que permanece abierta la tranquera
#define TIEMPO_ENTRE_LECTURAS_MS        2000   // ms de espera anti-rebote entre lecturas
#define POLL_LCD_MSG_INTERVAL_MS        4000   // ms entre consultas de mensajes LCD
#define RECONEXION_WIFI_INTERVAL_MS    10000   // ms entre intentos de reconexion WiFi
#define PAYMENT_LED_DURATION_MS         2000   // ms que el LED de pago permanece encendido

// ============================================================
//  OBJETOS GLOBALES
// ============================================================

MFRC522 rfidGate(PIN_SS_GATE, PIN_RST_GATE);
MFRC522 rfidPayment(PIN_SS_PAYMENT, PIN_RST_PAYMENT);

LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

Servo servoGate;

// ============================================================
//  VARIABLES DE ESTADO
// ============================================================

bool     gateOpen        = false;
uint32_t gateOpenedAt    = 0;

bool     paymentLedOn    = false;
uint32_t paymentLedOnAt  = 0;

uint32_t lastLcdPoll          = 0;
uint32_t lastGateRead         = 0;
uint32_t lastPaymentRead      = 0;
uint32_t lastWifiReconnectTry = 0;

// ============================================================
//  PROTOTIPOS
// ============================================================

String   leerRFID(MFRC522& lector);
String   llamarRPC(const String& funcion, const String& body);
void     procesarPuerta(const String& rfidCode);
void     procesarPago(const String& rfidCode);
void     consultarMensajesLCD();
void     abrirTranquera();
void     cerrarTranquera();
void     ledPuerta(bool verde);
void     encenderLedPago();
void     apagarLedPago();
void     mostrarLCD(const String& linea1, const String& linea2 = "");
void     iniciarWiFi();
void     verificarWiFi();

// ============================================================
//  SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println(F("\n========================================"));
  Serial.println(F("    SMART PARKING RFID - INICIANDO"));
  Serial.println(F("    1 Puerta + 1 Totem de Pago"));
  Serial.println(F("========================================"));

  // --- LEDs ---
  pinMode(PIN_LED_GATE_GREEN, OUTPUT);
  pinMode(PIN_LED_GATE_RED,   OUTPUT);
  pinMode(PIN_LED_PAYMENT,    OUTPUT);

  // Estado inicial: puerta cerrada (rojo), LED pago apagado
  ledPuerta(false);
  digitalWrite(PIN_LED_PAYMENT, LOW);

  // --- I2C y LCD unico ---
  Wire.begin(PIN_SDA, PIN_SCL);

  lcd.init();
  lcd.backlight();
  mostrarLCD("Smart Parking", "Iniciando...");

  // --- Servo unico ---
  servoGate.setPeriodHertz(50);
  servoGate.attach(PIN_SERVO_GATE, 500, 2400);
  servoGate.write(SERVO_CERRADO);
  delay(500);

  // --- SPI y lectores RFID ---
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI);

  rfidGate.PCD_Init();
  delay(50);
  rfidPayment.PCD_Init();
  delay(50);

  Serial.print(F("RFID Puerta firmware: "));
  rfidGate.PCD_DumpVersionToSerial();
  Serial.print(F("RFID Pago firmware:   "));
  rfidPayment.PCD_DumpVersionToSerial();

  // --- WiFi ---
  iniciarWiFi();

  // --- Mensaje inicial en LCD ---
  mostrarLCD("Bienvenido al", "Estacionamiento");

  Serial.println(F("\n[OK] Sistema LISTO - esperando tarjetas...\n"));
}

// ============================================================
//  LOOP PRINCIPAL
// ============================================================

void loop() {

  // 1. Verificar y reconectar WiFi si es necesario
  verificarWiFi();

  // 2. Cerrar tranquera automaticamente por timeout
  if (gateOpen && (millis() - gateOpenedAt >= TIEMPO_TRANQUERA_ABIERTA_MS)) {
    cerrarTranquera();
  }

  // 3. Apagar LED de pago automaticamente por timeout (2 segundos)
  if (paymentLedOn && (millis() - paymentLedOnAt >= PAYMENT_LED_DURATION_MS)) {
    apagarLedPago();
  }

  // 4. Leer lector RFID de PUERTA (Entrada/Salida)
  if (millis() - lastGateRead >= TIEMPO_ENTRE_LECTURAS_MS) {
    String rfidPuerta = leerRFID(rfidGate);
    if (rfidPuerta.length() > 0) {
      lastGateRead = millis();
      Serial.println(">> PUERTA detectada: " + rfidPuerta);
      procesarPuerta(rfidPuerta);
    }
  }

  // 5. Leer lector RFID del TOTEM DE PAGO
  if (millis() - lastPaymentRead >= TIEMPO_ENTRE_LECTURAS_MS) {
    String rfidPago = leerRFID(rfidPayment);
    if (rfidPago.length() > 0) {
      lastPaymentRead = millis();
      Serial.println(">> PAGO detectado: " + rfidPago);
      procesarPago(rfidPago);
    }
  }

  // 6. Consultar mensajes del servidor para el LCD
  if (millis() - lastLcdPoll >= POLL_LCD_MSG_INTERVAL_MS) {
    lastLcdPoll = millis();
    consultarMensajesLCD();
  }
}

// ============================================================
//  LEER UID DEL RFID RC522
// ============================================================

String leerRFID(MFRC522& lector) {
  if (!lector.PICC_IsNewCardPresent()) return "";
  if (!lector.PICC_ReadCardSerial())   return "";

  String uid = "";
  for (byte i = 0; i < lector.uid.size; i++) {
    if (lector.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(lector.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  lector.PICC_HaltA();
  lector.PCD_StopCrypto1();

  return uid;
}

// ============================================================
//  LLAMADA RPC A SUPABASE VIA HTTPS POST
// ============================================================

String llamarRPC(const String& funcion, const String& body) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[RPC] WiFi desconectado, saltando llamada"));
    return "";
  }

  WiFiClientSecure client;
  // setInsecure() acepta cualquier certificado SSL.
  // Para produccion, carga el certificado raiz de Supabase.
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/" + funcion;

  Serial.println("[RPC] POST -> " + funcion);

  http.begin(client, url);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.setTimeout(12000);

  int httpCode = http.POST(body);
  String respuesta = "";

  if (httpCode > 0) {
    respuesta = http.getString();
    Serial.printf("[RPC] HTTP %d <- %s\n", httpCode, respuesta.c_str());
  } else {
    Serial.printf("[RPC] Error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  return respuesta;
}

// ============================================================
//  PROCESAR ESCANEO EN LECTOR DE PUERTA (Entrada/Salida)
//
//  La BD decide automaticamente si es ENTRADA o SALIDA:
//    - Si no tiene sesion activa -> ENTRADA
//    - Si tiene sesion pagada -> SALIDA permitida
//    - Si tiene sesion sin pagar -> SALIDA bloqueada
// ============================================================

void procesarPuerta(const String& rfidCode) {
  mostrarLCD("Verificando...", rfidCode.substring(0, min((int)rfidCode.length(), 8)));

  String body = "{\"p_rfid_code\":\"" + rfidCode + "\","
                "\"p_reader_code\":\"" + String(GATE_READER_CODE) + "\"}";

  String respuesta = llamarRPC("process_rfid_scan", body);

  // Sin respuesta = error de red
  if (respuesta.length() == 0) {
    ledPuerta(false);
    mostrarLCD("Error de red", "Reintente");
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");
    return;
  }

  // Parsear respuesta JSON
  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, respuesta) != DeserializationError::Ok) {
    Serial.println(F("[JSON] Error parseando respuesta de puerta"));
    mostrarLCD("Error sistema", "Reintente");
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");
    return;
  }

  bool   ok     = doc["ok"]     | false;
  String action = doc["action"] | "";
  String lcdMsg = doc["lcd_message"] | "";

  // --- CASO: ENTRADA PERMITIDA ---
  if (ok && action == "entry_allowed") {
    int ocupados = doc["occupied"] | 0;

    abrirTranquera();

    char linea2[17];
    snprintf(linea2, sizeof(linea2), "Ocupados: %d", ocupados);
    mostrarLCD("Ingreso Exitoso!", linea2);
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");

  // --- CASO: SALIDA PERMITIDA (ya pago) ---
  } else if (ok && action == "exit_allowed") {
    abrirTranquera();

    mostrarLCD("Buen Viaje!", "Hasta pronto");
    delay(3500);
    mostrarLCD("Bienvenido al", "Estacionamiento");

  // --- CASO: REQUIERE PAGO (intento de salida sin pagar) ---
  } else if (!ok && action == "payment_required") {
    float amountDue = doc["amount_due"] | 0.0f;

    ledPuerta(false); // LED rojo

    char linea1[17], linea2[17];
    snprintf(linea1, sizeof(linea1), "Debe: S/ %.2f", amountDue);
    snprintf(linea2, sizeof(linea2), "Pague en Totem");

    mostrarLCD(linea1, linea2);

    // Parpadeo LED rojo para alertar que no puede salir
    for (int i = 0; i < 8; i++) {
      digitalWrite(PIN_LED_GATE_RED, LOW);  delay(200);
      digitalWrite(PIN_LED_GATE_RED, HIGH); delay(200);
    }
    ledPuerta(false); // vuelve al rojo fijo

    delay(2000);
    mostrarLCD("Bienvenido al", "Estacionamiento");

  // --- CASO: ESTACIONAMIENTO LLENO ---
  } else if (!ok && lcdMsg == "Lleno") {
    ledPuerta(false);

    mostrarLCD("  LLENO!", "Sin espacios");

    // Parpadeo LED rojo como alerta
    for (int i = 0; i < 6; i++) {
      digitalWrite(PIN_LED_GATE_RED, LOW);  delay(250);
      digitalWrite(PIN_LED_GATE_RED, HIGH); delay(250);
    }
    ledPuerta(false);
    delay(1500);
    mostrarLCD("Bienvenido al", "Estacionamiento");

  // --- CASO: OTRO ERROR ---
  } else {
    ledPuerta(false);
    String msg = lcdMsg.length() > 0 ? lcdMsg : "Acceso denegado";
    mostrarLCD("Denegado", msg.substring(0, 16));
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");
  }
}

// ============================================================
//  PROCESAR ESCANEO EN TOTEM DE PAGO
//
//  Cuando un RFID se escanea en el totem:
//    - Si tiene sesion activa sin pagar -> se cobra automaticamente
//    - Si ya pago -> avisa que ya esta pagado
//    - Si no esta adentro -> avisa que no hay sesion
//  Al pagar exitosamente, se enciende el LED de pago por 2 seg
// ============================================================

void procesarPago(const String& rfidCode) {
  mostrarLCD("Procesando", "pago...");

  String body = "{\"p_rfid_code\":\"" + rfidCode + "\","
                "\"p_reader_code\":\"" + String(PAYMENT_READER_CODE) + "\"}";

  String respuesta = llamarRPC("process_rfid_scan", body);

  if (respuesta.length() == 0) {
    mostrarLCD("Error de red", "Reintente");
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");
    return;
  }

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, respuesta) != DeserializationError::Ok) {
    Serial.println(F("[JSON] Error parseando respuesta de pago"));
    mostrarLCD("Error sistema", "Reintente");
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");
    return;
  }

  bool   ok     = doc["ok"]     | false;
  String action = doc["action"] | "";
  String lcdMsg = doc["lcd_message"] | "";

  // --- CASO: PAGO EXITOSO ---
  if (ok && action == "payment_success") {
    float amountPaid   = doc["amount_paid"]   | 0.0f;
    int   chargedHours = doc["charged_hours"] | 0;

    // Encender LED de pago por 2 segundos
    encenderLedPago();

    char linea1[17], linea2[17];
    snprintf(linea1, sizeof(linea1), "Pagado: S/%.2f", amountPaid);
    snprintf(linea2, sizeof(linea2), "%dh - Puede salir", chargedHours);

    mostrarLCD(linea1, linea2);
    delay(4000);
    mostrarLCD("Bienvenido al", "Estacionamiento");

  // --- CASO: YA ESTA PAGADO ---
  } else if (ok && action == "already_paid") {
    // Encender LED de pago brevemente para confirmar
    encenderLedPago();

    mostrarLCD("Ya esta pagado", "Puede salir");
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");

  // --- CASO: NO ESTA ADENTRO ---
  } else if (!ok) {
    String msg = lcdMsg.length() > 0 ? lcdMsg : "Sin sesion";
    mostrarLCD("Error:", msg.substring(0, 16));
    delay(3000);
    mostrarLCD("Bienvenido al", "Estacionamiento");
  }
}

// ============================================================
//  CONSULTAR MENSAJES DEL SERVIDOR PARA EL LCD
//
//  El totem de pago genera hardware_messages que el ESP32
//  consume con fetch_next_lcd_message() y muestra en el LCD.
// ============================================================

void consultarMensajesLCD() {
  String body = "{\"p_target\":\"LCD_MAIN\"}";
  String respuesta = llamarRPC("fetch_next_lcd_message", body);

  if (respuesta.length() == 0) return;

  DynamicJsonDocument doc(512);
  if (deserializeJson(doc, respuesta) != DeserializationError::Ok) return;

  bool ok = doc["ok"] | false;
  if (!ok) return; // No hay mensajes pendientes - es comportamiento normal

  String mensaje = doc["lcd_message"] | "";
  if (mensaje.length() == 0) return;

  Serial.println("[LCD] Mensaje del servidor: " + mensaje);

  // Separar en 2 lineas de maximo 16 caracteres
  String linea1 = mensaje.substring(0, 16);
  String linea2 = (mensaje.length() > 16) ? mensaje.substring(16, 32) : "";

  mostrarLCD(linea1, linea2);
  delay(5000);
  mostrarLCD("Bienvenido al", "Estacionamiento");
}

// ============================================================
//  CONTROL DE TRANQUERA (SERVO UNICO)
// ============================================================

void abrirTranquera() {
  servoGate.write(SERVO_ABIERTO);
  gateOpen     = true;
  gateOpenedAt = millis();
  ledPuerta(true); // LED verde
  Serial.println(F("[GATE] Tranquera -> ABIERTA"));
}

void cerrarTranquera() {
  servoGate.write(SERVO_CERRADO);
  gateOpen = false;
  ledPuerta(false); // LED rojo
  Serial.println(F("[GATE] Tranquera -> CERRADA"));
  mostrarLCD("Bienvenido al", "Estacionamiento");
}

// ============================================================
//  CONTROL DE LEDs
// ============================================================

// LED verde/rojo de la puerta
void ledPuerta(bool verde) {
  digitalWrite(PIN_LED_GATE_GREEN, verde ? HIGH : LOW);
  digitalWrite(PIN_LED_GATE_RED,   verde ? LOW  : HIGH);
}

// LED de pago (se enciende al pagar, se apaga solo por timeout)
void encenderLedPago() {
  digitalWrite(PIN_LED_PAYMENT, HIGH);
  paymentLedOn   = true;
  paymentLedOnAt = millis();
  Serial.println(F("[LED] LED de pago -> ENCENDIDO (2 seg)"));
}

void apagarLedPago() {
  digitalWrite(PIN_LED_PAYMENT, LOW);
  paymentLedOn = false;
  Serial.println(F("[LED] LED de pago -> APAGADO"));
}

// ============================================================
//  CONTROL DEL LCD (UNICO)
// ============================================================

void mostrarLCD(const String& linea1, const String& linea2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(linea1.substring(0, 16));
  if (linea2.length() > 0) {
    lcd.setCursor(0, 1);
    lcd.print(linea2.substring(0, 16));
  }
}

// ============================================================
//  CONEXION Y RECONEXION WIFI
// ============================================================

void iniciarWiFi() {
  Serial.print(F("[WiFi] Conectando a: "));
  Serial.println(WIFI_SSID);
  mostrarLCD("Conectando WiFi", String(WIFI_SSID).substring(0, 16));

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 40) {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    String ip = WiFi.localIP().toString();
    Serial.println("\n[WiFi] Conectado! IP: " + ip);
    mostrarLCD("WiFi conectado!", ip);
    delay(2000);
  } else {
    Serial.println(F("\n[WiFi] FALLO DE CONEXION - verificar SSID/PASSWORD"));
    mostrarLCD("WiFi ERROR!", "Verificar datos");
    delay(3000);
  }
}

void verificarWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiReconnectTry >= RECONEXION_WIFI_INTERVAL_MS) {
      lastWifiReconnectTry = millis();
      Serial.println(F("[WiFi] Desconectado. Intentando reconectar..."));
      mostrarLCD("Reconectando", "WiFi...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      delay(4000);
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi] Reconectado! IP: " + WiFi.localIP().toString());
        mostrarLCD("Bienvenido al", "Estacionamiento");
      }
    }
  }
}

// ============================================================
//  FIN DEL SKETCH - SmartParking_RFID.ino
// ============================================================