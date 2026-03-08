const PDFDocument = require('pdfkit');
const fs = require('fs');

// ── Beautiful Invoice PDF ──
async function generateInvoice(order, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const products = {
      1: { name: 'NFC Stand', price: '₦39,000', amount: 39000 },
      2: { name: 'NFC Business Card', price: '₦29,000', amount: 29000 },
      3: { name: 'NFC Plate', price: '₦49,000', amount: 49000 }
    };
    const product = products[order.productId] || products[1];
    const invoiceNo = String(order.id).padStart(8, '0');
    const date = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Gradient Header Bar ──
    const grad = doc.linearGradient(0, 0, doc.page.width, 0);
    grad.stop(0, '#0d1b2a').stop(1, '#1b3a4b');
    doc.rect(0, 0, doc.page.width, 120).fill(grad);

    // ── Brand Title ──
    doc.fontSize(28).fillColor('#34A853').text('ENGAGER', 50, 30);
    doc.fontSize(10).fillColor('#94a3b8').text('Smart NFC Solutions for Business', 50, 62);
    doc.fontSize(9).fillColor('#64748b').text('info@engager.tech  |  +234 702 585 6080', 50, 78);
    doc.fillColor('#64748b').text('Yakasai, Kano, Nigeria', 50, 92);

    // ── Invoice Badge (right side) ──
    doc.fontSize(22).fillColor('#ffffff').text('INVOICE', doc.page.width - 200, 35, { width: 150, align: 'right' });
    doc.fontSize(10).fillColor('#94a3b8').text(`#${invoiceNo}`, doc.page.width - 200, 62, { width: 150, align: 'right' });
    doc.fillColor('#94a3b8').text(date, doc.page.width - 200, 78, { width: 150, align: 'right' });

    // ── Status Badge ──
    const status = order.status || 'Pending';
    const statusColor = status === 'Paid' ? '#34A853' : '#f59e0b';
    doc.roundedRect(doc.page.width - 150, 95, 100, 20, 4).fill(statusColor);
    doc.fontSize(9).fillColor('#ffffff').text(status.toUpperCase(), doc.page.width - 150, 100, { width: 100, align: 'center' });

    // ── Bill To Section ──
    const yBillTo = 150;
    doc.fontSize(11).fillColor('#34A853').text('BILL TO', 50, yBillTo);
    doc.moveTo(50, yBillTo + 16).lineTo(200, yBillTo + 16).lineWidth(2).strokeColor('#34A853').stroke();

    doc.fontSize(13).fillColor('#1a202c').text(order.name, 50, yBillTo + 25);
    doc.fontSize(10).fillColor('#64748b').text(order.email, 50, yBillTo + 43);

    // ── Order Details ──
    doc.fontSize(11).fillColor('#34A853').text('ORDER DETAILS', 350, yBillTo);
    doc.moveTo(350, yBillTo + 16).lineTo(550, yBillTo + 16).lineWidth(2).strokeColor('#34A853').stroke();
    doc.fontSize(10).fillColor('#64748b').text(`Display Title: ${order.title}`, 350, yBillTo + 25);
    doc.text(`Slogan: ${order.slogan || 'N/A'}`, 350, yBillTo + 40);

    // ── Items Table ──
    const tableTop = 260;

    // Table Header
    doc.rect(50, tableTop, doc.page.width - 100, 35).fill('#0d1b2a');
    doc.fontSize(10).fillColor('#ffffff');
    doc.text('ITEM', 65, tableTop + 11);
    doc.text('QTY', 320, tableTop + 11, { width: 60, align: 'center' });
    doc.text('UNIT PRICE', 390, tableTop + 11, { width: 80, align: 'right' });
    doc.text('TOTAL', doc.page.width - 150, tableTop + 11, { width: 100, align: 'right' });

    // Table Row
    const rowY = tableTop + 35;
    doc.rect(50, rowY, doc.page.width - 100, 40).fill('#f7fafc').stroke('#e2e8f0');
    doc.fontSize(10).fillColor('#1a202c');
    doc.text(product.name, 65, rowY + 13);
    doc.text('1', 320, rowY + 13, { width: 60, align: 'center' });
    doc.text(product.price, 390, rowY + 13, { width: 80, align: 'right' });
    doc.text(product.price, doc.page.width - 150, rowY + 13, { width: 100, align: 'right' });

    // ── Totals Box ──
    const totalsY = rowY + 60;
    const totalsX = doc.page.width - 250;

    doc.rect(totalsX, totalsY, 200, 80).fill('#f7fafc').stroke('#e2e8f0');

    doc.fontSize(10).fillColor('#64748b').text('Subtotal:', totalsX + 15, totalsY + 12);
    doc.fillColor('#1a202c').text(product.price, totalsX + 85, totalsY + 12, { width: 100, align: 'right' });

    doc.fillColor('#64748b').text('Shipping:', totalsX + 15, totalsY + 30);
    doc.fillColor('#34A853').text('FREE', totalsX + 85, totalsY + 30, { width: 100, align: 'right' });

    doc.moveTo(totalsX + 15, totalsY + 48).lineTo(totalsX + 185, totalsY + 48).lineWidth(1).strokeColor('#e2e8f0').stroke();

    doc.fontSize(14).fillColor('#1a202c').font('Helvetica-Bold').text('TOTAL:', totalsX + 15, totalsY + 55);
    doc.fillColor('#34A853').text(product.price, totalsX + 85, totalsY + 55, { width: 100, align: 'right' });
    doc.font('Helvetica');

    // ── Payment Link (only if pending) ──
    if (status !== 'Paid') {
      const linkY = totalsY + 110;
      const payLink = order.paymentLink || `http://localhost:5173/checkout?orderId=${order.id}`;

      doc.fontSize(11).fillColor('#1a202c').text('Ready to complete your purchase?', 50, linkY, { align: 'center', width: doc.page.width - 100 });

      // Green Button
      const btnW = 220, btnH = 36;
      const btnX = (doc.page.width - btnW) / 2;
      const btnY = linkY + 22;

      doc.roundedRect(btnX, btnY, btnW, btnH, 6).fill('#34A853');
      doc.fontSize(13).fillColor('#ffffff').text('💳 Continue to Payment', btnX, btnY + 10, {
        width: btnW,
        align: 'center',
        link: payLink,
      });
    }

    // ── Footer ──
    const footerY = doc.page.height - 80;
    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).lineWidth(1).strokeColor('#e2e8f0').stroke();

    doc.fontSize(8).fillColor('#94a3b8');
    doc.text('Thank you for choosing Engager!', 50, footerY + 10, { align: 'center', width: doc.page.width - 100 });
    doc.text('info@engager.tech  |  +234 702 585 6080  | Yakasai, Kano, Nigeria', 50, footerY + 22, { align: 'center', width: doc.page.width - 100 });
    doc.text(`© ${new Date().getFullYear()} Engager — Smart NFC Solutions`, 50, footerY + 34, { align: 'center', width: doc.page.width - 100 });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', (err) => reject(err));
  });
}

// ── Beautiful Receipt PDF (sent after payment) ──
async function generateReceipt(order, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const products = {
      1: { name: 'NFC Stand', price: '₦39,000', amount: 39000 },
      2: { name: 'NFC Business Card', price: '₦29,000', amount: 29000 },
      3: { name: 'NFC Plate', price: '₦49,000', amount: 49000 }
    };
    const product = products[order.productId] || products[1];
    const invoiceNo = String(order.id).padStart(8, '0');
    const date = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Green Header (Receipt style) ──
    const grad = doc.linearGradient(0, 0, doc.page.width, 0);
    grad.stop(0, '#0d6e3a').stop(1, '#34A853');
    doc.rect(0, 0, doc.page.width, 120).fill(grad);

    doc.fontSize(28).fillColor('#ffffff').text('ENGAGER', 50, 30);
    doc.fontSize(10).fillColor('rgba(255,255,255,0.8)').text('Smart NFC Solutions for Business', 50, 62);
    doc.fontSize(9).fillColor('rgba(255,255,255,0.7)').text('info@engager.tech  |  +234 702 585 6080', 50, 78);

    // ── RECEIPT Badge ──
    doc.fontSize(22).fillColor('#ffffff').text('RECEIPT', doc.page.width - 200, 35, { width: 150, align: 'right' });
    doc.fontSize(10).fillColor('rgba(255,255,255,0.8)').text(`#${invoiceNo}`, doc.page.width - 200, 62, { width: 150, align: 'right' });
    doc.fillColor('rgba(255,255,255,0.8)').text(date, doc.page.width - 200, 78, { width: 150, align: 'right' });

    // ── PAID Stamp ──
    doc.roundedRect(doc.page.width - 150, 95, 100, 20, 4).fill('#ffffff');
    doc.fontSize(9).fillColor('#34A853').text('✓ PAID', doc.page.width - 150, 100, { width: 100, align: 'center' });

    // ── Success Message ──
    const msgY = 140;
    doc.roundedRect(50, msgY, doc.page.width - 100, 45, 8).fill('#f0fdf4').stroke('#d1fae5');
    doc.fontSize(13).fillColor('#166534').text('✅  Payment Received Successfully!', 70, msgY + 14, { width: doc.page.width - 140 });

    // ── Bill To ──
    const yBillTo = 210;
    doc.fontSize(11).fillColor('#34A853').text('RECEIPT FOR', 50, yBillTo);
    doc.moveTo(50, yBillTo + 16).lineTo(200, yBillTo + 16).lineWidth(2).strokeColor('#34A853').stroke();
    doc.fontSize(13).fillColor('#1a202c').text(order.name, 50, yBillTo + 25);
    doc.fontSize(10).fillColor('#64748b').text(order.email, 50, yBillTo + 43);

    // ── Payment Info ──
    doc.fontSize(11).fillColor('#34A853').text('PAYMENT INFO', 350, yBillTo);
    doc.moveTo(350, yBillTo + 16).lineTo(550, yBillTo + 16).lineWidth(2).strokeColor('#34A853').stroke();
    doc.fontSize(10).fillColor('#64748b');
    doc.text(`Reference: ${order.payRef || 'N/A'}`, 350, yBillTo + 25);
    doc.text(`Method: Paystack`, 350, yBillTo + 40);
    doc.text(`Status: Paid`, 350, yBillTo + 55);

    // ── Items Table ──
    const tableTop = 310;
    doc.rect(50, tableTop, doc.page.width - 100, 35).fill('#0d6e3a');
    doc.fontSize(10).fillColor('#ffffff');
    doc.text('ITEM', 65, tableTop + 11);
    doc.text('CUSTOMIZATION', 250, tableTop + 11);
    doc.text('AMOUNT', doc.page.width - 150, tableTop + 11, { width: 100, align: 'right' });

    const rowY = tableTop + 35;
    doc.rect(50, rowY, doc.page.width - 100, 50).fill('#f7fafc').stroke('#e2e8f0');
    doc.fontSize(10).fillColor('#1a202c').text(product.name, 65, rowY + 10);
    doc.fontSize(9).fillColor('#64748b').text(`Title: ${order.title}`, 250, rowY + 8);
    doc.text(`Slogan: ${order.slogan || 'N/A'}`, 250, rowY + 22);
    doc.fontSize(11).fillColor('#1a202c').text(product.price, doc.page.width - 150, rowY + 15, { width: 100, align: 'right' });

    // ── Total ──
    const totalsY = rowY + 70;
    const totalsX = doc.page.width - 250;
    doc.rect(totalsX, totalsY, 200, 55).fill('#f0fdf4').stroke('#d1fae5');
    doc.fontSize(10).fillColor('#64748b').text('Amount Paid:', totalsX + 15, totalsY + 10);
    doc.fontSize(16).fillColor('#34A853').font('Helvetica-Bold').text(product.price, totalsX + 15, totalsY + 28, { width: 170, align: 'right' });
    doc.font('Helvetica');

    // ── Footer ──
    const footerY = doc.page.height - 80;
    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).lineWidth(1).strokeColor('#e2e8f0').stroke();
    doc.fontSize(8).fillColor('#94a3b8');
    doc.text('Thank you for your purchase!', 50, footerY + 10, { align: 'center', width: doc.page.width - 100 });
    doc.text('info@engager.tech  |  +234 702 585 6080  |  Yakasai, Kano, Nigeria', 50, footerY + 22, { align: 'center', width: doc.page.width - 100 });
    doc.text(`© ${new Date().getFullYear()} Engager — Smart NFC Solutions`, 50, footerY + 34, { align: 'center', width: doc.page.width - 100 });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', (err) => reject(err));
  });
}

module.exports = { generateInvoice, generateReceipt };
