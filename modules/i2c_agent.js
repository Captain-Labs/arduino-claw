// modules/i2c_agent.js — Autonomous I2C Hardware Scanner & Address Discovery Agent
// Enables Arduino-Claw to probe, read, and self-heal I2C communicating devices

export const I2C_SCANNER_SKETCH = `#include <Wire.h>

void setup() {
  Wire.begin();
  Serial.begin(9600);
  while (!Serial && millis() < 2000);
  Serial.println("---I2C_SCAN_START---");
  
  byte count = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C_FOUND:0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      count++;
      delay(10);
    }
  }
  
  if (count == 0) {
    Serial.println("I2C_NONE_FOUND");
  }
  Serial.println("---I2C_SCAN_END---");
}

void loop() {
  delay(1000);
}
`;

/**
 * Checks whether a user prompt or code snippet implies an I2C device with potentially variable address.
 * Standard SSD1306 (0x3C) is excluded unless explicitly ambiguous or failing.
 */
export function isI2CPotentialProject(promptText = '', currentCode = '') {
  const text = (promptText + ' ' + currentCode).toLowerCase();
  
  // Specific I2C devices with variable/unknown addresses
  const i2cKeywords = [
    'liquidcrystal_i2c', 'i2c lcd', 'lcd i2c', 'pcf8574', '16x2 i2c', '20x4 i2c',
    'mpu6050', 'mpu9250', 'bme280', 'bmp280', 'bmp180', 'ds3231', 'ds1307',
    'ina219', 'ads1115', 'vl53l0x', 'hmc5883l', 'bh1750', 'pcf8591', 'mcp23017',
    'i2c scanner', 'find i2c', 'i2c address', 'i2c sensor'
  ];

  // If user explicitly asks for standard OLED, don't scan unless requested
  if (text.includes('oled') && !text.includes('i2c address') && !text.includes('find i2c') && !text.includes('lcd')) {
    return false;
  }

  return i2cKeywords.some(keyword => text.includes(keyword));
}

/**
 * Parses serial buffer output for any I2C discovered address.
 * @param {string} serialText 
 * @returns {string|null} e.g. "0x27", "0x3F", "0x68"
 */
export function parseDiscoveredI2CAddress(serialText) {
  if (!serialText) return null;

  // Match I2C_FOUND:0x27 or standard Arduino I2C scanner text "0x27"
  const match = serialText.match(/I2C_FOUND:(0x[0-9A-Fa-f]{2})/i) ||
                serialText.match(/I2C device found at address (0x[0-9A-Fa-f]{2})/i) ||
                serialText.match(/found at (0x[0-9A-Fa-f]{2})/i);

  if (match && match[1]) {
    return match[1].toUpperCase().replace('0X', '0x');
  }

  return null;
}

/**
 * Checks if serial output indicates an I2C communication failure or missing sensor.
 */
export function hasI2CCommunicationFailure(serialText = '', code = '') {
  const lowerText = serialText.toLowerCase();
  const lowerCode = code.toLowerCase();

  const usesI2C = lowerCode.includes('wire.h') || 
                  lowerCode.includes('liquidcrystal_i2c') || 
                  lowerCode.includes('adafruit_sensor') ||
                  lowerCode.includes('mpu6050') ||
                  lowerCode.includes('bme280');

  if (!usesI2C) return false;

  const failurePatterns = [
    'could not find a valid',
    'sensor not found',
    'check wiring',
    'i2c error',
    'init failed',
    'device not found',
    'mpu6050 connection failed',
    'bme280 not found',
    'failed to initialize'
  ];

  return failurePatterns.some(pat => lowerText.includes(pat));
}
