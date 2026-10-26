/**
 * PromptPay EMVCo QR Code Payload Generator
 * Generates official Thai PromptPay QR codes for Mobile Banking Apps
 */
const QRCode = require('qrcode');

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTag(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function generatePromptPayPayload(target, amount = null) {
  // Sanitize target (phone number or ID card)
  const cleanTarget = target.replace(/[^0-9]/g, '');
  let formattedTarget = '';
  let subTag = '';

  if (cleanTarget.length === 10) {
    // Phone number: convert 08x-xxx-xxxx to 00668xxxxxxxx
    formattedTarget = '0066' + cleanTarget.substring(1);
    subTag = '01';
  } else if (cleanTarget.length === 13) {
    // National ID card
    formattedTarget = cleanTarget;
    subTag = '02';
  } else {
    formattedTarget = cleanTarget;
    subTag = '01';
  }

  // Aid for PromptPay
  const aid = formatTag('00', 'A000000677010111');
  const targetField = formatTag(subTag, formattedTarget);
  const merchantInfo = formatTag('29', aid + targetField);

  let payload = '';
  payload += formatTag('00', '01'); // Payload Format Indicator
  payload += formatTag('01', amount ? '12' : '11'); // Point of Initiation: 12 = Dynamic, 11 = Static
  payload += merchantInfo;
  payload += formatTag('53', '764'); // Currency: THB (764)

  if (amount && Number(amount) > 0) {
    payload += formatTag('54', Number(amount).toFixed(2));
  }

  payload += formatTag('58', 'TH'); // Country Code

  // CRC Placeholder
  const payloadToCrc = payload + '6304';
  const checksum = crc16(payloadToCrc);
  return payloadToCrc + checksum;
}

async function generatePromptPayDataUrl(target, amount) {
  try {
    const payload = generatePromptPayPayload(target, amount);
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    return dataUrl;
  } catch (err) {
    console.error('Error generating PromptPay QR:', err.message);
    return null;
  }
}

module.exports = {
  generatePromptPayPayload,
  generatePromptPayDataUrl
};

