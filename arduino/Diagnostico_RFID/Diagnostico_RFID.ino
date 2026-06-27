// ============================================================
//  DIAGNOSTICO RFID - Solo prueba los lectores RC522
//  Carga este sketch para verificar que el hardware funciona
//  ANTES de usar el sketch principal SmartParking_RFID.ino
// ============================================================
//
//  QUE HACE ESTE SKETCH:
//    - NO usa WiFi, NO llama Supabase
//    - Solo lee los dos lectores RFID e imprime el UID
//      en el Monitor Serial (115200 baudios)
//    - Si ves el UID → el RFID funciona, el problema era otro
//    - Si NO ves nada → problema de pines o cableado
//
// ============================================================
//YALA
#include <SPI.h>
#include <MFRC522.h>

// ============================================================
//  PINES - Ajusta si tu cableado es diferente
// ============================================================

// Lector RFID #1 - ENTRADA
#define PIN_SS_ENTRY    5    // SDA del RC522 de entrada
#define PIN_RST_ENTRY   4    // RST del RC522 de entrada

// Lector RFID #2 - SALIDA
#define PIN_SS_EXIT    13    // SDA del RC522 de salida  <- cambio: era GPIO 15 (strapping pin)
#define PIN_RST_EXIT   16    // RST del RC522 de salida

// SPI
#define PIN_SCK   18
#define PIN_MISO  19
#define PIN_MOSI  23

// ============================================================
//  OBJETOS
// ============================================================

MFRC522 rfidEntry(PIN_SS_ENTRY, PIN_RST_ENTRY);
MFRC522 rfidExit (PIN_SS_EXIT,  PIN_RST_EXIT);

// ============================================================
//  SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  while (!Serial) {}

  Serial.println(F(""));
  Serial.println(F("========================================="));
  Serial.println(F("   DIAGNOSTICO RFID RC522 - ESP32"));
  Serial.println(F("========================================="));

  // Poner SS de AMBOS lectores en HIGH antes de inicializar SPI
  // Esto es CRITICO para que no haya conflicto en el bus
  pinMode(PIN_SS_ENTRY, OUTPUT);
  pinMode(PIN_SS_EXIT,  OUTPUT);
  digitalWrite(PIN_SS_ENTRY, HIGH);
  digitalWrite(PIN_SS_EXIT,  HIGH);
  delay(10);

  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI);

  // Inicializar lector de ENTRADA
  rfidEntry.PCD_Init();
  delay(100);

  // Inicializar lector de SALIDA
  rfidExit.PCD_Init();
  delay(100);

  // Verificar version del firmware de cada lector
  Serial.print(F("\n[ENTRADA] Firmware del RC522: "));
  byte versionEntry = rfidEntry.PCD_ReadRegister(MFRC522::VersionReg);
  if (versionEntry == 0x91) {
    Serial.println(F("v1.0 - OK"));
  } else if (versionEntry == 0x92) {
    Serial.println(F("v2.0 - OK"));
  } else if (versionEntry == 0x00 || versionEntry == 0xFF) {
    Serial.println(F("*** FALLO - verifica cableado SPI (SS, RST, MISO, MOSI, SCK, 3.3V) ***"));
  } else {
    Serial.print(F("Desconocido: 0x"));
    Serial.println(versionEntry, HEX);
  }

  Serial.print(F("[SALIDA]  Firmware del RC522: "));
  byte versionExit = rfidExit.PCD_ReadRegister(MFRC522::VersionReg);
  if (versionExit == 0x91) {
    Serial.println(F("v1.0 - OK"));
  } else if (versionExit == 0x92) {
    Serial.println(F("v2.0 - OK"));
  } else if (versionExit == 0x00 || versionExit == 0xFF) {
    Serial.println(F("*** FALLO - verifica cableado SPI (SS, RST, MISO, MOSI, SCK, 3.3V) ***"));
  } else {
    Serial.print(F("Desconocido: 0x"));
    Serial.println(versionExit, HEX);
  }

  Serial.println(F(""));
  Serial.println(F("-----------------------------------------"));
  Serial.println(F(" Acerca un llavero/tarjeta a cualquier"));
  Serial.println(F(" lector. El UID aparecera aqui abajo."));
  Serial.println(F("-----------------------------------------\n"));
}

// ============================================================
//  LOOP
// ============================================================

void loop() {

  // --- Leer lector de ENTRADA ---
  if (rfidEntry.PICC_IsNewCardPresent() && rfidEntry.PICC_ReadCardSerial()) {
    String uid = obtenerUID(rfidEntry);
    Serial.print(F("[ENTRADA] UID detectado: "));
    Serial.print(uid);
    Serial.print(F("  ("));
    Serial.print(rfidEntry.uid.size);
    Serial.println(F(" bytes)"));

    rfidEntry.PICC_HaltA();
    rfidEntry.PCD_StopCrypto1();
    delay(1500); // anti-rebote
  }

  // --- Leer lector de SALIDA ---
  if (rfidExit.PICC_IsNewCardPresent() && rfidExit.PICC_ReadCardSerial()) {
    String uid = obtenerUID(rfidExit);
    Serial.print(F("[SALIDA]  UID detectado: "));
    Serial.print(uid);
    Serial.print(F("  ("));
    Serial.print(rfidExit.uid.size);
    Serial.println(F(" bytes)"));

    rfidExit.PICC_HaltA();
    rfidExit.PCD_StopCrypto1();
    delay(1500); // anti-rebote
  }
}

// ============================================================
//  Convierte UID a String hexadecimal en mayusculas
// ============================================================

String obtenerUID(MFRC522& lector) {
  String uid = "";
  for (byte i = 0; i < lector.uid.size; i++) {
    if (lector.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(lector.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}
