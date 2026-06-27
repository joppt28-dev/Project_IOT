// ============================================================
//  SMART PARKING RFID - ESP32
//  Proyecto IoT: Estacionamiento vehicular con RFID + Supabase
// ============================================================
//
//  MATERIALES:
//    - ESP32 (CP2102)
//    - 2x LCD 16x2 con modulo I2C (PCF8574)
//    - 2x Servo SG90 (tranqueras)
//    - 2x Lector RFID RC522
//    - 4x LED (2 entrada + 2 salida)
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
const char* WIFI_SSID     = "TU_SSID_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";

// --- Supabase ---
// Ejemplo: "https://abcdefghij.supabase.co"
const char* SUPABASE_URL      = "https://TU_PROYECTO.supabase.co";
// Tu clave anon publica de Supabase (Settings > API > anon public)
const char* SUPABASE_ANON_KEY = "TU_ANON_KEY_AQUI";

// --- Codigos de los lectores (deben coincidir con la BD) ---
const char* ENTRY_READER_CODE = "ENTRY_READER_01";
const char* EXIT_READER_CODE  = "EXIT_READER_01";

// --- Direccion I2C de los modulos LCD ---
// IMPORTANTE: Los dos LCD en el mismo bus I2C deben tener
// direcciones distintas. Configura el jumper A0 del segundo
// modulo PCF8574 (soldalo o puentealo a GND) para obtener
// 0x26 en lugar de 0x27. Si usas PCF8574A el default es 0x3F.
// Usa un I2C Scanner sketch para verificar tus direcciones.
#define LCD_ENTRY_ADDR  0x27   // LCD de la entrada  (bienvenida)
#define LCD_EXIT_ADDR   0x3F   // LCD de la salida   (validacion pago)

// ============================================================
//  PINES ESP32
// ============================================================
//  PINES ESP32 - TODOS LOS GPIO SON UNICOS
//
//  AUDITORIA COMPLETA DE PINES:
//  GPIO  4 -> RST lector RFID entrada
//  GPIO  5 -> SS  lector RFID entrada
//  GPIO 13 -> SS  lector RFID salida
//  GPIO 14 -> LED rojo salida
//  GPIO 15 -> (libre - era SS salida, strapping pin, no usar)
//  GPIO 16 -> RST lector RFID salida
//  GPIO 18 -> SCK  (bus SPI compartido entre los 2 RC522)
//  GPIO 19 -> MISO (bus SPI compartido entre los 2 RC522)
//  GPIO 21 -> SDA  (bus I2C compartido entre los 2 LCD)
//  GPIO 22 -> SCL  (bus I2C compartido entre los 2 LCD)
//  GPIO 23 -> MOSI (bus SPI compartido entre los 2 RC522)
//  GPIO 25 -> Servo entrada
//  GPIO 26 -> Servo salida
//  GPIO 27 -> LED verde salida
//  GPIO 32 -> LED verde entrada
//  GPIO 33 -> LED rojo entrada
//
//  NOTA: SCK/MISO/MOSI van fisicamente a AMBOS RC522 (asi
//  funciona SPI: bus compartido, chip select distinto).
//  SDA/SCL van fisicamente a AMBOS LCD (asi funciona I2C:
//  bus compartido, direccion distinta 0x27 y 0x3F).
// ============================================================

//  Bus SPI (mismos cables fisicos a ambos RC522)
#define PIN_SCK   18
#define PIN_MISO  19
#define PIN_MOSI  23

//  Lector RFID #1 - ENTRADA (pines unicos de este lector)
#define PIN_SS_ENTRY    5  // SS  / SDA del RC522 de entrada
#define PIN_RST_ENTRY   4  // RST del RC522 de entrada

//  Lector RFID #2 - SALIDA (pines unicos de este lector)
#define PIN_SS_EXIT    13  // SS  / SDA del RC522 de salida (GPIO 13, no strapping)
#define PIN_RST_EXIT   16  // RST del RC522 de salida

//  Bus I2C (mismos cables fisicos a ambos LCD)
#define PIN_SDA  21
#define PIN_SCL  22

//  Servo - tranquera entrada
#define PIN_SERVO_ENTRY  25

//  Servo - tranquera salida
#define PIN_SERVO_EXIT   26

//  LEDs entrada
#define PIN_LED_ENTRY_GREEN  32  // Verde -> ingreso permitido
#define PIN_LED_ENTRY_RED    33  // Rojo  -> denegado / lleno

//  LEDs salida
#define PIN_LED_EXIT_GREEN   27  // Verde -> salida permitida
#define PIN_LED_EXIT_RED     14  // Rojo  -> no pagado / error


// ============================================================
//  CONSTANTES DE COMPORTAMIENTO
// ============================================================

#define SERVO_ABIERTO   90   // grados del servo cuando la tranquera esta abierta
#define SERVO_CERRADO    0   // grados del servo cuando esta cerrada

#define TIEMPO_TRANQUERA_ABIERTA_MS     5000   // ms que permanece abierta la tranquera
#define TIEMPO_ENTRE_LECTURAS_MS        2000   // ms de espera anti-rebote entre lecturas
#define POLL_LCD_MSG_INTERVAL_MS        4000   // ms entre consultas de mensajes LCD
#define RECONEXION_WIFI_INTERVAL_MS    10000   // ms entre intentos de reconexion WiFi

// ============================================================
//  OBJETOS GLOBALES
// ============================================================

MFRC522 rfidEntry(PIN_SS_ENTRY, PIN_RST_ENTRY);
MFRC522 rfidExit (PIN_SS_EXIT,  PIN_RST_EXIT);

LiquidCrystal_I2C lcdEntry(LCD_ENTRY_ADDR, 16, 2);
LiquidCrystal_I2C lcdExit (LCD_EXIT_ADDR,  16, 2);

Servo servoEntry;
Servo servoExit;

// ============================================================
//  VARIABLES DE ESTADO
// ============================================================

bool     entryGateOpen      = false;
uint32_t entryGateOpenedAt  = 0;

bool     exitGateOpen       = false;
uint32_t exitGateOpenedAt   = 0;

uint32_t lastLcdPoll          = 0;
uint32_t lastEntryRead        = 0;
uint32_t lastExitRead         = 0;
uint32_t lastWifiReconnectTry = 0;

// ============================================================
//  PROTOTIPOS
// ============================================================

String   leerRFID(MFRC522& lector);
String   llamarRPC(const String& funcion, const String& body);
void     procesarEntrada(const String& rfidCode);
void     procesarSalida(const String& rfidCode);
void     consultarMensajesLCD();
void     abrirTransqueraEntrada();
void     cerrarTransqueraEntrada();
void     abrirTransqueraSalida();
void     cerrarTransqueraSalida();
void     ledEntrada(bool verde);
void     ledSalida(bool verde);
void     mostrarLCDEntrada(const String& linea1, const String& linea2 = "");
void     mostrarLCDSalida (const String& linea1, const String& linea2 = "");
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
  Serial.println(F("========================================"));

  // --- LEDs ---
  pinMode(PIN_LED_ENTRY_GREEN, OUTPUT);
  pinMode(PIN_LED_ENTRY_RED,   OUTPUT);
  pinMode(PIN_LED_EXIT_GREEN,  OUTPUT);
  pinMode(PIN_LED_EXIT_RED,    OUTPUT);

  // Estado inicial: ambos lados en rojo (tranqueras cerradas)
  ledEntrada(false);
  ledSalida(false);

  // --- I2C y LCDs ---
  Wire.begin(PIN_SDA, PIN_SCL);

  lcdEntry.init();
  lcdEntry.backlight();
  mostrarLCDEntrada("Smart Parking", "Iniciando...");

  lcdExit.init();
  lcdExit.backlight();
  mostrarLCDSalida("Smart Parking", "Iniciando...");

  // --- Servos ---
  servoEntry.attach(PIN_SERVO_ENTRY);
  servoExit.attach(PIN_SERVO_EXIT);
  servoEntry.write(SERVO_CERRADO);
  servoExit.write(SERVO_CERRADO);
  delay(500);

  // --- SPI y lectores RFID ---
  // CRITICO: poner SS de AMBOS lectores en HIGH antes de
  // inicializar SPI, para evitar colisiones en el bus.
  pinMode(PIN_SS_ENTRY, OUTPUT);
  pinMode(PIN_SS_EXIT,  OUTPUT);
  digitalWrite(PIN_SS_ENTRY, HIGH);
  digitalWrite(PIN_SS_EXIT,  HIGH);
  delay(10);

  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI);

  rfidEntry.PCD_Init();
  delay(100);
  rfidExit.PCD_Init();
  delay(100);

  // Verificar firmware de cada lector
  Serial.print(F("RFID Entrada (0x"));
  Serial.print(rfidEntry.PCD_ReadRegister(MFRC522::VersionReg), HEX);
  Serial.println(F(") - si es 0x00 o 0xFF: revisa el cableado SPI"));
  Serial.print(F("RFID Salida  (0x"));
  Serial.print(rfidExit.PCD_ReadRegister(MFRC522::VersionReg), HEX);
  Serial.println(F(") - si es 0x00 o 0xFF: revisa el cableado SPI"));

  // --- WiFi ---
  iniciarWiFi();

  // --- Mensajes iniciales en LCD ---
  mostrarLCDEntrada("Bienvenido al", "Estacionamiento");
  mostrarLCDSalida("Salida", "Escanee tarjeta");

  Serial.println(F("\n[OK] Sistema LISTO - esperando tarjetas...\n"));
}

// ============================================================
//  LOOP PRINCIPAL
// ============================================================

void loop() {

  // 1. Verificar y reconectar WiFi si es necesario
  verificarWiFi();

  // 2. Cerrar tranqueras automaticamente por timeout
  if (entryGateOpen && (millis() - entryGateOpenedAt >= TIEMPO_TRANQUERA_ABIERTA_MS)) {
    cerrarTransqueraEntrada();
  }
  if (exitGateOpen && (millis() - exitGateOpenedAt >= TIEMPO_TRANQUERA_ABIERTA_MS)) {
    cerrarTransqueraSalida();
  }

  // 3. Leer lector RFID de ENTRADA
  if (millis() - lastEntryRead >= TIEMPO_ENTRE_LECTURAS_MS) {
    String rfidEntrada = leerRFID(rfidEntry);
    if (rfidEntrada.length() > 0) {
      lastEntryRead = millis();
      Serial.println(">> ENTRADA detectada: " + rfidEntrada);
      procesarEntrada(rfidEntrada);
    }
  }

  // 4. Leer lector RFID de SALIDA
  if (millis() - lastExitRead >= TIEMPO_ENTRE_LECTURAS_MS) {
    String rfidSalida = leerRFID(rfidExit);
    if (rfidSalida.length() > 0) {
      lastExitRead = millis();
      Serial.println(">> SALIDA detectada: " + rfidSalida);
      procesarSalida(rfidSalida);
    }
  }

  // 5. Consultar mensajes del dashboard para el LCD de salida
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
//  PROCESAR ESCANEO EN LECTOR DE ENTRADA
// ============================================================

void procesarEntrada(const String& rfidCode) {
  mostrarLCDEntrada("Verificando...", rfidCode.substring(0, min((int)rfidCode.length(), 8)));

  String body = "{\"p_rfid_code\":\"" + rfidCode + "\","
                "\"p_reader_code\":\"" + String(ENTRY_READER_CODE) + "\"}";

  String respuesta = llamarRPC("process_rfid_scan", body);

  // Sin respuesta = error de red
  if (respuesta.length() == 0) {
    ledEntrada(false);
    mostrarLCDEntrada("Error de red", "Reintente");
    delay(3000);
    mostrarLCDEntrada("Bienvenido al", "Estacionamiento");
    return;
  }

  // Parsear respuesta JSON
  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, respuesta) != DeserializationError::Ok) {
    Serial.println(F("[JSON] Error parseando respuesta de entrada"));
    mostrarLCDEntrada("Error sistema", "Reintente");
    delay(3000);
    mostrarLCDEntrada("Bienvenido al", "Estacionamiento");
    return;
  }

  bool   ok     = doc["ok"]     | false;
  String action = doc["action"] | "";
  String reason = doc["reason"] | "";

  // --- CASO: ENTRADA PERMITIDA ---
  if (ok && action == "entry_allowed") {
    int ocupados  = doc["occupied_after_entry"] | 0;
    int capacidad = doc["max_capacity"]          | 0;

    abrirTransqueraEntrada();

    char linea2[17];
    snprintf(linea2, sizeof(linea2), "Espacios: %d/%d", ocupados, capacidad);
    mostrarLCDEntrada("  INGRESO OK!", linea2);
    delay(3000);
    mostrarLCDEntrada("Bienvenido al", "Estacionamiento");

  // --- CASO: ESTACIONAMIENTO LLENO ---
  } else if (reason == "parking_full") {
    int ocupados  = doc["occupied_spaces"] | 0;
    int capacidad = doc["max_capacity"]    | 0;

    ledEntrada(false);

    char linea2[17];
    snprintf(linea2, sizeof(linea2), "%d/%d ocupados", ocupados, capacidad);
    mostrarLCDEntrada("   LLENO!", linea2);

    // Parpadeo LED rojo de entrada como alerta
    for (int i = 0; i < 6; i++) {
      digitalWrite(PIN_LED_ENTRY_RED, LOW);  delay(250);
      digitalWrite(PIN_LED_ENTRY_RED, HIGH); delay(250);
    }
    ledEntrada(false);
    delay(1500);
    mostrarLCDEntrada("Bienvenido al", "Estacionamiento");

  // --- CASO: RFID YA ESTA DENTRO ---
  } else if (reason == "already_inside") {
    ledEntrada(false);
    mostrarLCDEntrada("Ya esta dentro", "Vea la salida");
    delay(4000);
    mostrarLCDEntrada("Bienvenido al", "Estacionamiento");

  // --- CASO: OTRO ERROR ---
  } else {
    ledEntrada(false);
    String lcdMsg = doc["lcd_message"] | "Acceso denegado";
    mostrarLCDEntrada("Denegado", lcdMsg.substring(0, 16));
    delay(3000);
    mostrarLCDEntrada("Bienvenido al", "Estacionamiento");
  }
}

// ============================================================
//  PROCESAR ESCANEO EN LECTOR DE SALIDA
// ============================================================

void procesarSalida(const String& rfidCode) {
  mostrarLCDSalida("Verificando...", rfidCode.substring(0, min((int)rfidCode.length(), 8)));

  String body = "{\"p_rfid_code\":\"" + rfidCode + "\","
                "\"p_reader_code\":\"" + String(EXIT_READER_CODE) + "\"}";

  String respuesta = llamarRPC("process_rfid_scan", body);

  if (respuesta.length() == 0) {
    ledSalida(false);
    mostrarLCDSalida("Error de red", "Reintente");
    delay(3000);
    mostrarLCDSalida("Salida", "Escanee tarjeta");
    return;
  }

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, respuesta) != DeserializationError::Ok) {
    Serial.println(F("[JSON] Error parseando respuesta de salida"));
    mostrarLCDSalida("Error sistema", "Reintente");
    delay(3000);
    mostrarLCDSalida("Salida", "Escanee tarjeta");
    return;
  }

  bool   ok     = doc["ok"]     | false;
  String action = doc["action"] | "";
  String reason = doc["reason"] | "";

  // --- CASO: SALIDA PERMITIDA (ya pago) ---
  if (ok && action == "exit_allowed") {
    float amountPaid = doc["amount_paid"] | 0.0f;

    abrirTransqueraSalida();

    char linea2[17];
    snprintf(linea2, sizeof(linea2), "Pagado S/ %.2f", amountPaid);
    mostrarLCDSalida(" HASTA LUEGO!", linea2);
    delay(3500);
    mostrarLCDSalida("Salida", "Escanee tarjeta");

  // --- CASO: REQUIERE PAGO (intento de salida sin pagar) ---
  } else if (action == "payment_required") {
    float amountDue   = doc["amount_due"]    | 0.0f;
    int   chargedHrs  = doc["charged_hours"] | 0;

    ledSalida(false); // LED rojo

    char linea1[17], linea2[17];
    snprintf(linea1, sizeof(linea1), "PAGUE: S/ %.2f", amountDue);
    snprintf(linea2, sizeof(linea2), "%dh - Use el app", chargedHrs);

    mostrarLCDSalida(linea1, linea2);

    // Parpadeo LED rojo para alertar que no puede salir
    for (int i = 0; i < 8; i++) {
      digitalWrite(PIN_LED_EXIT_RED, LOW);  delay(200);
      digitalWrite(PIN_LED_EXIT_RED, HIGH); delay(200);
    }
    ledSalida(false); // vuelve al rojo fijo

    delay(2000);
    mostrarLCDSalida("Salida", "Escanee tarjeta");

  // --- CASO: RFID DESCONOCIDO ---
  } else if (reason == "unknown_rfid") {
    ledSalida(false);
    mostrarLCDSalida("RFID no", "registrado");
    delay(3000);
    mostrarLCDSalida("Salida", "Escanee tarjeta");

  // --- CASO: SIN SESION ACTIVA ---
  } else if (reason == "no_active_session") {
    ledSalida(false);
    mostrarLCDSalida("Sin sesion", "activa");
    delay(3000);
    mostrarLCDSalida("Salida", "Escanee tarjeta");

  // --- CASO: OTRO ERROR ---
  } else {
    ledSalida(false);
    String lcdMsg = doc["lcd_message"] | "Acceso denegado";
    mostrarLCDSalida("Denegado", lcdMsg.substring(0, 16));
    delay(3000);
    mostrarLCDSalida("Salida", "Escanee tarjeta");
  }
}

// ============================================================
//  CONSULTAR MENSAJES DEL DASHBOARD PARA EL LCD
//
//  El dashboard llama confirm_parking_payment() que genera
//  un hardware_message. El ESP32 lo consume con
//  fetch_next_lcd_message() y lo muestra en el LCD de salida.
//  Ejemplo de mensaje: "RFID A1B2C3D4 ha pagado S/ 2.00"
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

  Serial.println("[LCD] Mensaje del dashboard: " + mensaje);

  // Separar en 2 lineas de maximo 16 caracteres
  String linea1 = mensaje.substring(0, 16);
  String linea2 = (mensaje.length() > 16) ? mensaje.substring(16, 32) : "";

  // Parpadeo LED verde para avisar que hay un pago confirmado
  for (int i = 0; i < 5; i++) {
    digitalWrite(PIN_LED_EXIT_GREEN, HIGH); delay(200);
    digitalWrite(PIN_LED_EXIT_GREEN, LOW);  delay(200);
  }

  mostrarLCDSalida(linea1, linea2);
  delay(5000);
  mostrarLCDSalida("Salida", "Escanee tarjeta");
  ledSalida(false); // vuelve al rojo de espera
}

// ============================================================
//  CONTROL DE TRANQUERAS (SERVOS)
// ============================================================

void abrirTransqueraEntrada() {
  servoEntry.write(SERVO_ABIERTO);
  entryGateOpen     = true;
  entryGateOpenedAt = millis();
  ledEntrada(true); // LED verde
  Serial.println(F("[GATE] Tranquera ENTRADA -> ABIERTA"));
}

void cerrarTransqueraEntrada() {
  servoEntry.write(SERVO_CERRADO);
  entryGateOpen = false;
  ledEntrada(false); // LED rojo
  Serial.println(F("[GATE] Tranquera ENTRADA -> CERRADA"));
  mostrarLCDEntrada("Bienvenido al", "Estacionamiento");
}

void abrirTransqueraSalida() {
  servoExit.write(SERVO_ABIERTO);
  exitGateOpen     = true;
  exitGateOpenedAt = millis();
  ledSalida(true); // LED verde
  Serial.println(F("[GATE] Tranquera SALIDA -> ABIERTA"));
}

void cerrarTransqueraSalida() {
  servoExit.write(SERVO_CERRADO);
  exitGateOpen = false;
  ledSalida(false); // LED rojo
  Serial.println(F("[GATE] Tranquera SALIDA -> CERRADA"));
  mostrarLCDSalida("Salida", "Escanee tarjeta");
}

// ============================================================
//  CONTROL DE LEDs
//  verde=true  -> LED verde ON, rojo OFF
//  verde=false -> LED verde OFF, rojo ON
// ============================================================

void ledEntrada(bool verde) {
  digitalWrite(PIN_LED_ENTRY_GREEN, verde ? HIGH : LOW);
  digitalWrite(PIN_LED_ENTRY_RED,   verde ? LOW  : HIGH);
}

void ledSalida(bool verde) {
  digitalWrite(PIN_LED_EXIT_GREEN, verde ? HIGH : LOW);
  digitalWrite(PIN_LED_EXIT_RED,   verde ? LOW  : HIGH);
}

// ============================================================
//  CONTROL DE LCDs
// ============================================================

void mostrarLCDEntrada(const String& linea1, const String& linea2) {
  lcdEntry.clear();
  lcdEntry.setCursor(0, 0);
  lcdEntry.print(linea1.substring(0, 16));
  if (linea2.length() > 0) {
    lcdEntry.setCursor(0, 1);
    lcdEntry.print(linea2.substring(0, 16));
  }
}

void mostrarLCDSalida(const String& linea1, const String& linea2) {
  lcdExit.clear();
  lcdExit.setCursor(0, 0);
  lcdExit.print(linea1.substring(0, 16));
  if (linea2.length() > 0) {
    lcdExit.setCursor(0, 1);
    lcdExit.print(linea2.substring(0, 16));
  }
}

// ============================================================
//  CONEXION Y RECONEXION WIFI
// ============================================================

void iniciarWiFi() {
  Serial.print(F("[WiFi] Conectando a: "));
  Serial.println(WIFI_SSID);
  mostrarLCDEntrada("Conectando WiFi", String(WIFI_SSID).substring(0, 16));
  mostrarLCDSalida("Conectando WiFi", "...");

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
    mostrarLCDEntrada("WiFi conectado!", ip);
    mostrarLCDSalida("WiFi conectado!", ip);
    delay(2000);
  } else {
    Serial.println(F("\n[WiFi] FALLO DE CONEXION - verificar SSID/PASSWORD"));
    mostrarLCDEntrada("WiFi ERROR!", "Verificar datos");
    mostrarLCDSalida("WiFi ERROR!", "Sin conexion");
    delay(3000);
  }
}

void verificarWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiReconnectTry >= RECONEXION_WIFI_INTERVAL_MS) {
      lastWifiReconnectTry = millis();
      Serial.println(F("[WiFi] Desconectado. Intentando reconectar..."));
      mostrarLCDEntrada("Reconectando", "WiFi...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      delay(4000);
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi] Reconectado! IP: " + WiFi.localIP().toString());
        mostrarLCDEntrada("Bienvenido al", "Estacionamiento");
        mostrarLCDSalida("Salida", "Escanee tarjeta");
      }
    }
  }
}

// ============================================================
//  FIN DEL SKETCH - SmartParking_RFID.ino
// ============================================================
