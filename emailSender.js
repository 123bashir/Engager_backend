const nodemailer = require('nodemailer');

let transporter;

async function getTransporter() {
    if (transporter) return transporter;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: parseInt(process.env.SMTP_PORT) === 465,
            requireTLS: parseInt(process.env.SMTP_PORT) === 587,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    } else {
        console.log('[Email] No SMTP credentials in .env — using Ethereal test account...');
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
    }

    return transporter;
}

// ── Send invoice email (order initiated, pending payment) ──
async function sendInvoiceEmail(order, invoicePath) {
    const productPrices = {
        1: { name: 'NFC Stand', price: 39000 },
        2: { name: 'NFC Business Card', price: 29000 },
        3: { name: 'NFC Plate', price: 49000 },
    };
    const product = productPrices[order.productId] || productPrices[1];
    const formattedPrice = `₦${product.price.toLocaleString()}`;
    const invoiceNo = String(order.id).padStart(8, '0');
    const payLink = order.paymentLink || `http://localhost:5173/checkout?orderId=${order.id}`;

    const transport = await getTransporter();

    const mailOptions = {
        from: `"Engager Store" <${process.env.SMTP_USER}>`,
        to: order.email,
        subject: `📄 Invoice #${invoiceNo} — Your Order Has Been Initiated | Engager`,
        html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;color:#333;background:#ffffff;">
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#0d1b2a,#1b3a4b);padding:35px 30px;border-radius:12px 12px 0 0;text-align:center;">
                <h1 style="color:#34A853;margin:0;font-size:28px;letter-spacing:1px;">ENGAGER</h1>
                <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:13px;">Smart NFC Solutions for Business</p>
            </div>

            <!-- Main Content -->
            <div style="padding:30px;border:1px solid #e2e8f0;border-top:none;">
                <!-- Status Badge -->
                <div style="text-align:center;margin-bottom:25px;">
                    <span style="background:#FEF3C7;color:#92400E;padding:8px 20px;border-radius:20px;font-size:13px;font-weight:bold;">⏳ PAYMENT PENDING</span>
                </div>

                <p style="font-size:16px;">Hi <strong>${order.name}</strong>,</p>
                <p style="color:#555;line-height:1.7;">Your order has been initiated! We've prepared your invoice. Complete your payment to finalize the order.</p>

                <!-- Order Summary Card -->
                <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;">
                    <h3 style="margin:0 0 16px;color:#0d1b2a;font-size:16px;border-bottom:2px solid #34A853;padding-bottom:10px;">📋 Order Summary</h3>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Product</td>
                            <td style="text-align:right;font-weight:bold;font-size:14px;color:#1a202c;">${product.name}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Display Title</td>
                            <td style="text-align:right;font-size:14px;color:#1a202c;">${order.title}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Slogan</td>
                            <td style="text-align:right;font-size:14px;color:#1a202c;">${order.slogan || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Shipping</td>
                            <td style="text-align:right;font-size:14px;color:#34A853;font-weight:bold;">FREE</td>
                        </tr>
                        <tr style="border-top:2px solid #e2e8f0;">
                            <td style="padding:14px 0;font-weight:bold;font-size:18px;color:#1a202c;">Total</td>
                            <td style="text-align:right;font-weight:bold;font-size:20px;color:#34A853;">${formattedPrice}</td>
                        </tr>
                    </table>
                </div>

                <p style="color:#64748b;font-size:13px;text-align:center;">Your invoice PDF is attached. You can pay now or later using the link below.</p>

                <!-- CTA Button -->
                <div style="text-align:center;margin:30px 0 20px;">
                    <a href="${payLink}"
                       style="background:linear-gradient(135deg,#34A853,#0d9e42);color:#fff;padding:16px 40px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;box-shadow:0 4px 15px rgba(52,168,83,0.3);">
                        💳 Continue to Payment →
                    </a>
                </div>
            </div>

            <!-- Footer -->
            <div style="text-align:center;padding:20px;background:#f7fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} Engager — Smart NFC Solutions</p>
                <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;">info@engager.tech | +234 702 585 6080 | Yakasai, Kano</p>
            </div>
        </div>
        `,
        attachments: [
            {
                filename: `Invoice_${invoiceNo}.pdf`,
                path: invoicePath,
                contentType: 'application/pdf',
            },
        ],
    };

    const info = await transport.sendMail(mailOptions);

    if (!process.env.SMTP_USER) {
        console.log('─────────────────────────────────────────');
        console.log('📧 Invoice Email Preview (Ethereal):');
        console.log('   ' + nodemailer.getTestMessageUrl(info));
        console.log('─────────────────────────────────────────');
    }

    return info;
}

// ── Send receipt email (after successful payment) ──
async function sendReceiptEmail(order, receiptPath) {
    const productPrices = {
        1: { name: 'NFC Stand', price: 39000 },
        2: { name: 'NFC Business Card', price: 29000 },
        3: { name: 'NFC Plate', price: 49000 },
    };
    const product = productPrices[order.productId] || productPrices[1];
    const formattedPrice = `₦${product.price.toLocaleString()}`;
    const invoiceNo = String(order.id).padStart(8, '0');

    const transport = await getTransporter();

    const mailOptions = {
        from: `"Engager Store" <${process.env.SMTP_USER}>`,
        to: order.email,
        subject: `✅ Payment Confirmed! Receipt #${invoiceNo} — Engager`,
        html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;color:#333;background:#ffffff;">
            <!-- Green Header -->
            <div style="background:linear-gradient(135deg,#0d6e3a,#34A853);padding:35px 30px;border-radius:12px 12px 0 0;text-align:center;">
                <h1 style="color:#ffffff;margin:0;font-size:28px;letter-spacing:1px;">ENGAGER</h1>
                <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:13px;">Smart NFC Solutions for Business</p>
            </div>

            <!-- Main Content -->
            <div style="padding:30px;border:1px solid #e2e8f0;border-top:none;">
                <!-- Success Badge -->
                <div style="text-align:center;margin-bottom:25px;">
                    <span style="background:#D1FAE5;color:#065F46;padding:10px 24px;border-radius:20px;font-size:14px;font-weight:bold;">✅ PAYMENT SUCCESSFUL</span>
                </div>

                <p style="font-size:16px;">Hi <strong>${order.name}</strong>,</p>
                <p style="color:#555;line-height:1.7;">Your payment has been received and your order is confirmed! We're now preparing your custom NFC product. 🎉</p>

                <!-- Receipt Card -->
                <div style="background:#f0fdf4;border:2px solid #d1fae5;border-radius:12px;padding:24px;margin:24px 0;">
                    <h3 style="margin:0 0 16px;color:#166534;font-size:16px;border-bottom:2px solid #34A853;padding-bottom:10px;">🧾 Payment Receipt</h3>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Receipt No.</td>
                            <td style="text-align:right;font-weight:bold;font-size:14px;color:#1a202c;">#${invoiceNo}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Product</td>
                            <td style="text-align:right;font-weight:bold;font-size:14px;color:#1a202c;">${product.name}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Display Title</td>
                            <td style="text-align:right;font-size:14px;color:#1a202c;">${order.title}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Payment Ref.</td>
                            <td style="text-align:right;font-size:13px;color:#64748b;font-family:monospace;">${order.payRef || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;color:#64748b;font-size:14px;">Payment Method</td>
                            <td style="text-align:right;font-size:14px;color:#1a202c;">Paystack</td>
                        </tr>
                        <tr style="border-top:2px solid #bbf7d0;">
                            <td style="padding:14px 0;font-weight:bold;font-size:18px;color:#1a202c;">Amount Paid</td>
                            <td style="text-align:right;font-weight:bold;font-size:22px;color:#34A853;">${formattedPrice}</td>
                        </tr>
                    </table>
                </div>

                <p style="color:#64748b;font-size:13px;text-align:center;">Your receipt PDF is attached for your records.</p>

                <!-- What's Next -->
                <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-top:20px;">
                    <h4 style="margin:0 0 12px;color:#1a202c;font-size:14px;">📦 What happens next?</h4>
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:2;">
                        <li>Your NFC product will be customized with your details</li>
                        <li>We'll notify you when it's ready for shipping</li>
                        <li>Expected delivery: 3-5 business days</li>
                    </ul>
                </div>
            </div>

            <!-- Footer -->
            <div style="text-align:center;padding:20px;background:#f0fdf4;border:1px solid #d1fae5;border-top:none;border-radius:0 0 12px 12px;">
                <p style="margin:0;font-size:12px;color:#34A853;font-weight:bold;">Thank you for choosing Engager! 💚</p>
                <p style="margin:6px 0 0;font-size:11px;color:#94a3b8;">info@engager.tech | +234 702 585 6080 | Yakasai, Kano</p>
            </div>
        </div>
        `,
        attachments: [
            {
                filename: `Receipt_${invoiceNo}.pdf`,
                path: receiptPath,
                contentType: 'application/pdf',
            },
        ],
    };

    const info = await transport.sendMail(mailOptions);

    if (!process.env.SMTP_USER) {
        console.log('─────────────────────────────────────────');
        console.log('🧾 Receipt Email Preview (Ethereal):');
        console.log('   ' + nodemailer.getTestMessageUrl(info));
        console.log('─────────────────────────────────────────');
    }

    return info;
}

// ── Keep the old name for backward compatibility ──
async function sendOrderEmail(order, invoicePath) {
    return sendInvoiceEmail(order, invoicePath);
}

async function sendGenericEmail({ to, subject, body, attachments = [] }) {
    const transport = await getTransporter();

    const formattedAttachments = attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        encoding: 'base64'
    }));

    const mailOptions = {
        from: `"Engager Hub" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="background: #00bcd4; padding: 20px; color: #fff;">
                <h2 style="margin: 0;">Engager Message</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
                <div style="white-space: pre-wrap;">${body}</div>
            </div>
            <div style="text-align: center; font-size: 12px; color: #777; margin-top: 20px;">
                Sent via Engager Administrative Portal
            </div>
        </div>
        `,
        attachments: formattedAttachments
    };

    return await transport.sendMail(mailOptions);
}

module.exports = { sendOrderEmail, sendInvoiceEmail, sendReceiptEmail, sendGenericEmail };
