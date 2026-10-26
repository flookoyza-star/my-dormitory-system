/**
 * LINE Messaging API Service
 * Creates and sends rich interactive Flex Messages to tenants via LINE Official Account
 */

const line = require('@line/bot-sdk');

function getClient(channelAccessToken) {
  if (!channelAccessToken) return null;
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: channelAccessToken
  });
}

/**
 * Builds an official-looking bill/receipt Flex Message
 */
function buildBillFlexMessage(dormSettings, bill, publicUrl = '') {
  const isPaid = bill.status === 'paid';
  const headerColor = isPaid ? '#10b981' : '#2563eb';
  const statusBadgeText = isPaid ? 'ชำระเงินเรียบร้อยแล้ว' : 'รอชำระเงิน';
  const statusBadgeColor = isPaid ? '#059669' : '#dc2626';

  const flexContents = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerColor,
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: dormSettings.dormName || "หอพักสุขสบาย",
          weight: "bold",
          color: "#ffffff",
          size: "lg"
        },
        {
          type: "text",
          text: `ใบแจ้งหนี้ค่าเช่าห้องพัก - ห้อง ${bill.roomNumber}`,
          color: "#ffffffcc",
          size: "sm",
          margin: "xs"
        },
        {
          type: "text",
          text: `ประจำรอบ: ${bill.month}`,
          color: "#ffffffee",
          size: "xs",
          margin: "xs"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: [
        // Status Badge
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "สถานะบิล:",
              size: "sm",
              color: "#64748b"
            },
            {
              type: "text",
              text: statusBadgeText,
              size: "sm",
              weight: "bold",
              color: statusBadgeColor,
              align: "end"
            }
          ]
        },
        {
          type: "separator",
          margin: "md"
        },
        // Item breakdown
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            // Rent
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "1. ค่าเช่าห้อง", size: "sm", color: "#334155" },
                { type: "text", text: `${Number(bill.rent).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
              ]
            },
            // Electricity
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: `2. ค่าไฟ (${bill.electricUnits} หน่วย @ ${bill.electricRate}฿)`, size: "xs", color: "#64748b" },
                { type: "text", text: `${Number(bill.electricAmount).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
              ]
            },
            // Water
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: `3. ค่าน้ำ (${bill.waterUnits} หน่วย @ ${bill.waterRate}฿)`, size: "xs", color: "#64748b" },
                { type: "text", text: `${Number(bill.waterAmount).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
              ]
            },
            // Common fee
            ...(bill.commonFee > 0 ? [{
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "4. ค่าส่วนกลาง", size: "sm", color: "#334155" },
                { type: "text", text: `${Number(bill.commonFee).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
              ]
            }] : []),
            // Parking fee
            ...(bill.parkingFee > 0 ? [{
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: `5. ค่าที่จอดรถ${bill.licensePlate ? ' (' + bill.licensePlate + ')' : ''}`, size: "sm", color: "#334155" },
                { type: "text", text: `${Number(bill.parkingFee).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
              ]
            }] : []),
            // Other fee if any
            ...(bill.otherFee > 0 ? [{
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: `6. อื่นๆ (${bill.otherFeeRemark || 'เพิ่มเติม'})`, size: "xs", color: "#64748b" },
                { type: "text", text: `${Number(bill.otherFee).toLocaleString()} ฿`, size: "sm", align: "end", weight: "bold" }
              ]
            }] : []),
            // Discount if any
            ...(bill.discount > 0 ? [{
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "ส่วนลด", size: "sm", color: "#16a34a" },
                { type: "text", text: `-${Number(bill.discount).toLocaleString()} ฿`, size: "sm", align: "end", color: "#16a34a", weight: "bold" }
              ]
            }] : [])
          ]
        },
        {
          type: "separator",
          margin: "lg"
        },
        // Total Grand
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "ยอดชำระสุทธิ",
              size: "md",
              weight: "bold",
              color: "#0f172a"
            },
            {
              type: "text",
              text: `${Number(bill.totalAmount).toLocaleString()} บาท`,
              size: "xl",
              weight: "bold",
              color: "#dc2626",
              align: "end"
            }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          backgroundColor: "#f8fafc",
          paddingAll: "10px",
          cornerRadius: "8px",
          contents: [
            {
              type: "text",
              text: `📅 กำหนดชำระภายใน: ${bill.dueDate || 'ตามกำหนดของหอพัก'}`,
              size: "xs",
              color: "#475569"
            },
            {
              type: "text",
              text: `💳 โอนเข้าพร้อมเพย์: ${dormSettings.promptpayId || '-'} (${dormSettings.promptpayName || 'ผู้ดูแลหอพัก'})`,
              size: "xs",
              color: "#475569",
              margin: "xs"
            }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        ...(publicUrl ? [{
          type: "button",
          style: "primary",
          color: "#2563eb",
          action: {
            type: "uri",
            label: "ดูบิล & สแกน QR ชำระเงิน",
            uri: `${publicUrl}/tenant-portal.html?billId=${bill.id}`
          }
        }] : []),
        {
          type: "text",
          text: `ติดต่อสอบถาม: ${dormSettings.dormPhone || '-'}`,
          align: "center",
          size: "xxs",
          color: "#94a3b8"
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: `ใบแจ้งหนี้ห้อง ${bill.roomNumber} ยอดชำระ ${Number(bill.totalAmount).toLocaleString()} บาท`,
    contents: flexContents
  };
}

async function sendBillToTenant(channelAccessToken, tenantLineId, dormSettings, bill, publicUrl = '') {
  if (!channelAccessToken) {
    throw new Error('ยังไม่ได้ระบุ LINE Channel Access Token ในการตั้งค่าระบบ');
  }

  if (!tenantLineId) {
    throw new Error(`ห้อง ${bill.roomNumber} ยังไม่มี LINE User ID ของผู้เช่า`);
  }

  const client = getClient(channelAccessToken);
  const flexMessage = buildBillFlexMessage(dormSettings, bill, publicUrl);

  const response = await client.pushMessage({
    to: tenantLineId,
    messages: [flexMessage]
  });

  return response;
}

module.exports = {
  buildBillFlexMessage,
  sendBillToTenant
};

