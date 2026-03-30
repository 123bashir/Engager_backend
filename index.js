require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS blocked: ${origin}`));
        }
    },
    credentials: true
}));
app.use(express.json({
    limit: '100mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend images from public folder if they exist
const frontendPublicPath = path.join(__dirname, '..', 'frontend', 'engager', 'public');
if (fs.existsSync(frontendPublicPath)) {
    app.use(express.static(frontendPublicPath));
}

// Ensure uploads dir exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Setup Multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Appending extension
    }
});
const upload = multer({ storage: storage });

// Helper for standardized API responses
const apiResponse = (res, status, success, message, data = {}) => {
    return res.status(status).json({ success, message, ...data });
};

// JWT Middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return apiResponse(res, 401, false, 'Authentication required');

    JWT_SECRET =
        jwt.verify(token, process.env.JWT_SECRET || 'dvbrtrghjtrjhtrjhjhjtrjjrjtrjjtjjtrjtrjjtrjtr', (err, user) => {
            if (err) return apiResponse(res, 403, false, 'Session expired. Please login again');
            req.user = user;
            next();
        });
};

const isSuperAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'super-admin') {
        next();
    } else {
        apiResponse(res, 403, false, 'Access denied: Super Admin only');
    }
};

// Database Configuration
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'engager',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000
});

// API Endpoints
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        res.json(rows);
    } catch (error) {
        console.error('Fetch Products Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(rows[0]);
    } catch (error) {
        console.error('Fetch Product Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch product', error: error.message });
    }
});

app.post('/api/products/:id/click', async (req, res) => {
    try {
        await pool.query('UPDATE products SET clicks = clicks + 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Admin Product CRUD
app.post('/api/products', verifyToken, async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ success: false, message: 'Request body is missing' });
        }
        const { name, tag, description, price, oldPrice, image, image_path, gallery } = req.body;
        await pool.query(
            'INSERT INTO products (name, tag, description, price, oldPrice, image, image_path, gallery) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, tag, description, price, oldPrice, image, image_path, JSON.stringify(gallery || [])]
        );
        res.status(201).json({ success: true, message: 'Product created' });
    } catch (error) {
        console.error('Create Product Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create product', error: error.message });
    }
});

app.put('/api/products/:id', verifyToken, async (req, res) => {
    try {
        const fields = req.body;
        const allowedFields = ['name', 'tag', 'description', 'price', 'oldPrice', 'image', 'image_path', 'gallery'];

        let query = 'UPDATE products SET ';
        let params = [];
        let sets = [];

        for (const [key, value] of Object.entries(fields)) {
            if (allowedFields.includes(key)) {
                sets.push(`${key} = ?`);
                params.push(key === 'gallery' ? JSON.stringify(value) : value);
            }
        }

        if (sets.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields provided for update' });
        }

        query += sets.join(', ') + ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(query, params);
        res.json({ success: true, message: 'Product updated' });
    } catch (error) {
        console.error('Update Product Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
    }
});

app.delete('/api/products/:id', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
});

// --- Upload Endpoints ---
app.post('/api/upload/image', async (req, res) => {
    try {
        const { image, folder = 'uploads' } = req.body;
        if (!image) return apiResponse(res, 400, false, 'No image data provided');

        // Extract base64 data
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return apiResponse(res, 400, false, 'Invalid base64 image');
        }

        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.png`;

        const targetDir = path.join(__dirname, folder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const filePath = path.join(targetDir, filename);
        fs.writeFileSync(filePath, buffer);

        const imageUrl = `/${folder}/${filename}`;
        res.json({ success: true, imageUrl });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: 'Failed to upload image' });
    }
});

// --- Auth Endpoints ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await pool.query('SELECT * FROM staff WHERE email = ? AND active = TRUE', [email]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials or account disabled' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET || 'your_jwt_secret_key_here',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, name, email, role, phone, department, position, avatar_url, active as is_active FROM staff WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return apiResponse(res, 404, false, 'User not found');
        }

        res.json({ success: true, user: rows[0] });
    } catch (error) {
        console.error('Fetch Me Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
});

// --- Settings Endpoints ---
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM settings LIMIT 1');
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.put('/api/settings', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const fields = req.body;
        const allowedFields = ['site_name', 'contact_email', 'phone', 'address', 'facebook', 'instagram', 'twitter', 'linkedin', 'logo_url'];

        let query = 'UPDATE settings SET ';
        let params = [];
        let sets = [];

        for (const [key, value] of Object.entries(fields)) {
            if (allowedFields.includes(key)) {
                sets.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (sets.length === 0) return res.status(400).json({ error: 'No valid fields' });

        query += sets.join(', ') + ' WHERE id = 1';
        await pool.query(query, params);
        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- Email Endpoints ---
app.get('/api/email/sent', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM emails ORDER BY sent_at DESC');
        res.json({ success: true, emails: rows });
    } catch (error) {
        console.error('Fetch Emails Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sent emails' });
    }
});

app.post('/api/email/send', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const { to, subject, body, attachments } = req.body;

        const { sendGenericEmail } = require('./emailSender');
        await sendGenericEmail({ to, subject, body, attachments });

        // LOG EMAIL in database
        await pool.query(
            'INSERT INTO emails (recipients, subject, body) VALUES (?, ?, ?)',
            [to, subject, body]
        );

        res.json({ success: true, message: 'Email sent successfully!' });
    } catch (error) {
        console.error('Send Email API Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to send email' });
    }
});

// --- Staff Management Endpoints (Super Admin Only) ---
app.get('/api/staff', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, email, role, phone, department, position, avatar_url, active, created_at FROM staff');
        res.json({ success: true, staff: rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch staff' });
    }
});

app.get('/api/staff/:id', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, email, role, phone, department, position, avatar_url, active, created_at FROM staff WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Staff not found' });
        res.json({ success: true, staff: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch staff member' });
    }
});

app.post('/api/staff', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO staff (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, role || 'admin']
        );
        res.status(201).json({ success: true, message: 'Staff created successfully' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create staff' });
    }
});

app.put('/api/staff/:id', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const { name, email, role, active, password } = req.body;
        let query = 'UPDATE staff SET name = ?, email = ?, role = ?, active = ?';
        let params = [name, email, role, active];

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(query, params);
        res.json({ success: true, message: 'Staff updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to update staff' });
    }
});

app.delete('/api/staff/:id', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        // Prevent deleting self
        if (req.user.id == req.params.id) {
            return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
        }
        await pool.query('DELETE FROM staff WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Staff deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete staff' });
    }
});

// --- Project Endpoints ---
app.get('/api/projects', verifyToken, async (req, res) => {
    try {
        const { status, type, search, sort, order } = req.query;
        let query = 'SELECT * FROM projects WHERE 1=1';
        let params = [];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }
        if (search) {
            query += ' AND (name LIKE ? OR client LIKE ? OR location LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (sort) {
            query += ` ORDER BY ${sort} ${order || 'ASC'}`;
        } else {
            query += ' ORDER BY created_at DESC';
        }

        const [rows] = await pool.query(query, params);
        res.json({ success: true, projects: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch projects' });
    }
});

app.get('/api/projects/:id', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
        res.json({ success: true, project: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch project' });
    }
});

app.post('/api/projects', verifyToken, async (req, res) => {
    try {
        const { name, client, type, status, location, project_manager, completion_percentage, total_budget, spent_budget, start_date, end_date, image_url } = req.body;
        await pool.query(
            'INSERT INTO projects (name, client, type, status, location, project_manager, completion_percentage, total_budget, spent_budget, start_date, end_date, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, client, type, status, location, project_manager, completion_percentage, total_budget, spent_budget, start_date, end_date, image_url]
        );
        res.status(201).json({ success: true, message: 'Project created successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to create project' });
    }
});

app.put('/api/projects/:id', verifyToken, async (req, res) => {
    try {
        const fields = req.body;
        let query = 'UPDATE projects SET ';
        let params = [];
        let sets = [];

        for (const [key, value] of Object.entries(fields)) {
            if (key !== 'id' && key !== 'created_at') {
                sets.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (sets.length === 0) return res.status(400).json({ message: 'No fields to update' });

        query += sets.join(', ') + ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(query, params);
        res.json({ success: true, message: 'Project updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to update project' });
    }
});

app.delete('/api/projects/:id', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Project deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete project' });
    }
});

// --- Dashboard Stats ---
app.get('/api/dashboard/stats', verifyToken, async (req, res) => {
    try {
        const [orderCount] = await pool.query('SELECT COUNT(*) as count FROM orders');
        const [productViews] = await pool.query('SELECT SUM(clicks) as views FROM products');
        const [totalProducts] = await pool.query('SELECT COUNT(*) as count FROM products');
        const [staffCount] = await pool.query('SELECT COUNT(*) as count FROM staff');

        // Real Stats for Charts
        // 1. Orders by product
        const [byProduct] = await pool.query(`
            SELECT p.name, COUNT(o.id) as count 
            FROM products p 
            JOIN orders o ON p.id = o.product_id 
            GROUP BY p.name
        `);

        // 2. Orders per day (last 7 days)
        const [byDay] = await pool.query(`
            SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, COUNT(*) as count 
            FROM orders 
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
            GROUP BY date 
            ORDER BY date ASC
        `);

        // 3. Product Popularity (clicks)
        const [popularity] = await pool.query(`
            SELECT name, clicks 
            FROM products 
            ORDER BY clicks DESC 
            LIMIT 5
        `);

        // Recent Orders
        const [recentOrders] = await pool.query(`
            SELECT o.*, p.name as product_name 
            FROM orders o 
            LEFT JOIN products p ON o.product_id = p.id 
            ORDER BY o.created_at DESC 
            LIMIT 5
        `);

        res.json({
            success: true,
            stats: {
                total_orders: orderCount[0].count || 0,
                total_views: productViews[0].views || 0,
                total_products: totalProducts[0].count || 0,
                total_staff: staffCount[0].count || 0,
                orders_by_product: byProduct,
                orders_by_day: byDay,
                product_popularity: popularity,
                recent_orders: recentOrders
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

// Image Upload Endpoint
app.post('/api/upload', verifyToken, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ success: true, imageUrl });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

const { generateInvoice, generateReceipt } = require('./invoiceGenerator');
const { sendInvoiceEmail, sendReceiptEmail } = require('./emailSender');
const https = require('https');

const verifyPaystackPayment = (reference) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.paystack.co',
            port: 443,
            path: `/transaction/verify/${reference}`,
            method: 'GET',
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
        };

        const reqVerification = https.request(options, res => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', error => {
            reject(error);
        });
        reqVerification.end();
    });
};

// Admin: Get all orders
app.get('/api/orders', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT o.*, p.name AS product_name, p.price AS product_price
            FROM orders o
            LEFT JOIN products p ON o.product_id = p.id
            ORDER BY o.created_at DESC
        `);
        res.json({ success: true, orders: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
});

// Admin: Get single order details
app.get('/api/orders/:id', verifyToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        const [rows] = await pool.query(`
            SELECT o.*, p.name AS product_name, p.price AS product_price, p.image_path as product_image
            FROM orders o
            LEFT JOIN products p ON o.product_id = p.id
            WHERE o.id = ?
        `, [orderId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        res.json({ success: true, order: rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to fetch order details' });
    }
});

// STEP 1: Create order (Pending) + Generate invoice + Send email
app.post('/api/orders', upload.single('photo'), async (req, res) => {
    try {
        const { productId, name, email, title, slogan, color } = req.body;
        const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
        const payRef = 'ENG-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

        // Always create with Pending status
        const [result] = await pool.query(
            'INSERT INTO orders (product_id, name, email, title, slogan, color, photo_path, payment_status, payment_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [productId, name, email, title, slogan, color, photoPath, 'Pending', payRef]
        );
        const orderId = result.insertId;

        // Generate invoice PDF
        const orderData = { id: orderId, name, email, title, slogan, productId, payRef, status: 'Pending' };
        const invoicePath = path.join(__dirname, 'uploads', `Invoice_${orderId}.pdf`);
        await generateInvoice(orderData, invoicePath);

        // Send invoice email
        await sendInvoiceEmail(orderData, invoicePath);

        // Log email
        try {
            const invoiceNo = String(orderId).padStart(8, '0');
            await pool.query(
                'INSERT INTO emails (recipients, subject, body) VALUES (?, ?, ?)',
                [email, `📄 Invoice #${invoiceNo} — Order Initiated | Engager`, `Invoice sent for ${name}. Product ID: ${productId}`]
            );
        } catch (emailLogError) {
            console.error('Failed to log email to DB:', emailLogError);
        }

        res.status(201).json({
            success: true,
            message: 'Order created and invoice sent',
            orderId,
            payRef,
            paymentStatus: 'Pending'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Order failed' });
    }
});

// STEP 2: Verify payment after Paystack -> Update status + Send receipt
app.post('/api/orders/:id/pay', async (req, res) => {
    try {
        const orderId = req.params.id;
        const { reference } = req.body;

        if (!reference) {
            return res.status(400).json({ success: false, error: 'Payment reference is required' });
        }

        // Verify with Paystack
        const verification = await verifyPaystackPayment(reference);
        if (!verification.status || verification.data.status !== 'success') {
            return res.status(400).json({ success: false, error: 'Payment verification failed' });
        }

        // Get order
        const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        const order = rows[0];

        // Update payment status and reference
        await pool.query(
            'UPDATE orders SET payment_status = ?, payment_reference = ? WHERE id = ?',
            ['Paid', reference, orderId]
        );

        // Generate receipt PDF
        const orderData = {
            id: orderId,
            name: order.name,
            email: order.email,
            title: order.title,
            slogan: order.slogan,
            productId: order.product_id,
            payRef: reference,
            status: 'Paid'
        };
        const receiptPath = path.join(__dirname, 'uploads', `Receipt_${orderId}.pdf`);
        await generateReceipt(orderData, receiptPath);

        // Send receipt email
        await sendReceiptEmail(orderData, receiptPath);

        // Log email
        try {
            const invoiceNo = String(orderId).padStart(8, '0');
            await pool.query(
                'INSERT INTO emails (recipients, subject, body) VALUES (?, ?, ?)',
                [order.email, `✅ Payment Confirmed! Receipt #${invoiceNo} — Engager`, `Payment receipt sent to ${order.name}. Reference: ${reference}`]
            );
        } catch (emailLogError) {
            console.error('Failed to log receipt email to DB:', emailLogError);
        }

        res.json({ success: true, message: 'Payment verified, receipt sent!', paymentStatus: 'Paid' });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ success: false, error: 'Payment verification failed' });
    }
});

// Public: Get order by ID (to allow resuming checkout from email)
app.get('/api/orders/public/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, product_id, name, email, title, slogan, color, payment_status, payment_reference FROM orders WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Order not found' });
        res.json({ success: true, order: rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to fetch order details' });
    }
});

// Contact Form Email
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        await transporter.sendMail({
            from: `"Engager Contact Form" <${process.env.SMTP_USER}>`,
            to: process.env.SMTP_USER,
            replyTo: email,
            subject: `📩 New Contact Message from ${name}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0b0f19; color: #fff; padding: 30px; border-radius: 16px;">
                    <h2 style="color: #34A853; margin-bottom: 20px;">New Contact Form Message</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px 0; color: #94a3b8; width: 100px;"><strong>Name:</strong></td>
                            <td style="padding: 10px 0; color: #fff;">${name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #94a3b8;"><strong>Email:</strong></td>
                            <td style="padding: 10px 0; color: #fff;"><a href="mailto:${email}" style="color: #4285F4;">${email}</a></td>
                        </tr>
                    </table>
                    <hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;" />
                    <h3 style="color: #94a3b8; margin-bottom: 10px;">Message:</h3>
                    <p style="color: #fff; line-height: 1.8; background: rgba(255,255,255,0.05); padding: 16px; border-radius: 10px;">${message.replace(/\n/g, '<br/>')}</p>
                    <p style="margin-top: 30px; color: #94a3b8; font-size: 0.85rem;">Sent via Engager website contact form</p>
                </div>
            `,
        });

        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Contact email error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message. Please try again.' });
    }
});

// Paystack Webhook — handles "Pay Later" scenario when payment comes in later
app.post('/api/paystack/webhook', async (req, res) => {
    try {
        const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
            .update(req.rawBody)
            .digest('hex');

        if (hash === req.headers['x-paystack-signature']) {
            const event = req.body;
            if (event.event === 'charge.success') {
                const reference = event.data.reference;

                // Find order by reference and update status
                const [orders] = await pool.query('SELECT * FROM orders WHERE payment_reference = ?', [reference]);
                if (orders.length > 0) {
                    const order = orders[0];
                    if (order.payment_status === 'Pending') {
                        await pool.query('UPDATE orders SET payment_status = ? WHERE id = ?', ['Paid', order.id]);

                        // Generate receipt and send
                        const orderData = {
                            id: order.id,
                            name: order.name,
                            email: order.email,
                            title: order.title,
                            slogan: order.slogan,
                            productId: order.product_id,
                            payRef: reference,
                            status: 'Paid'
                        };
                        const receiptPath = path.join(__dirname, 'uploads', `Receipt_${order.id}.pdf`);
                        await generateReceipt(orderData, receiptPath);
                        await sendReceiptEmail(orderData, receiptPath);
                    }
                }
            }
        }
        res.status(200).send('Webhook Received');
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Admin endpoint to manually fetch/refresh transaction status
app.get('/api/orders/:id/verify-payment', verifyToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });

        const order = rows[0];
        if (!order.payment_reference) return res.status(400).json({ error: 'No payment reference for this order' });

        const verification = await verifyPaystackPayment(order.payment_reference);
        if (verification.status && verification.data.status === 'success') {
            if (order.payment_status !== 'Paid') {
                await pool.query('UPDATE orders SET payment_status = ? WHERE id = ?', ['Paid', orderId]);

                // Generate receipt and send
                const orderData = {
                    id: orderId,
                    name: order.name,
                    email: order.email,
                    title: order.title,
                    slogan: order.slogan,
                    productId: order.product_id,
                    payRef: order.payment_reference,
                    status: 'Paid'
                };
                const receiptPath = path.join(__dirname, 'uploads', `Receipt_${orderId}.pdf`);
                await generateReceipt(orderData, receiptPath);
                await sendReceiptEmail(orderData, receiptPath);
            }
            return res.json({ success: true, status: 'Paid', message: 'Payment successfully verified' });
        } else {
            return res.json({ success: false, status: order.payment_status, message: 'Payment not successful on Paystack' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));

