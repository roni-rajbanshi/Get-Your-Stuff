require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Import Models
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== CHECK ENV ====================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing in .env");
  process.exit(1);
}

// ==================== CREATE UPLOADS FOLDER ====================
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== MULTER CONFIG ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }

    cb(new Error('Only image files are allowed!'));
  }
});

// ==================== DATABASE ====================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/getyourstuff')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ==================== AUTH MIDDLEWARE ====================
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.userId).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    next();

  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {

    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'buyer'
    });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Current User
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    res.json({ user: req.user });
  }
  catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==================== PRODUCT ROUTES ====================

// Get all products
app.get('/api/products', async (req, res) => {

  try {

    const {
      category,
      search,
      minPrice,
      maxPrice,
      sellerId,
      page = 1,
      limit = 12
    } = req.query;

    let query = { status: 'active' };

    if (category) query.category = category;

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    if (sellerId) {
      query.seller = sellerId;
    }

    if (minPrice || maxPrice) {
      query.price = {};

      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const products = await Product.find(query)
      .populate('seller', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      total
    });

  }
  catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }

});

// Get single product
app.get('/api/products/:id', async (req, res) => {

  try {

    const product = await Product.findById(req.params.id)
      .populate('seller', 'name email phone');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);

  }
  catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }

});

// Create product
app.post('/api/products', authMiddleware, upload.array('images', 5), async (req, res) => {

  try {

    const { title, description, price, originalPrice, category, stock } = req.body;

    if (!req.user || req.user.role !== 'seller') {
      return res.status(403).json({ message: 'Only sellers can create products' });
    }

    const imageUrls = req.files
      ? req.files.map(file => `/uploads/${file.filename}`)
      : [];

    const product = await Product.create({
      title,
      description,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : 0,
      category,
      images: imageUrls,
      seller: req.user._id,
      sellerName: req.user.name,
      stock: Number(stock) || 0
    });

    res.status(201).json({
      message: 'Product created successfully',
      product
    });

  }
  catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }

});

// Update product
app.put('/api/products/:id', authMiddleware, upload.array('images', 5), async (req, res) => {

  try {

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (
      product.seller.toString() !== req.user._id.toString()
      && req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, description, price, originalPrice, category, stock } = req.body;

    if (req.files && req.files.length > 0) {
      product.images = req.files.map(file => `/uploads/${file.filename}`);
    }

    if (title) product.title = title;
    if (description) product.description = description;
    if (price !== undefined) product.price = Number(price);
    if (originalPrice !== undefined) product.originalPrice = Number(originalPrice);
    if (category) product.category = category;
    if (stock !== undefined) product.stock = Number(stock);

    await product.save();

    res.json({
      message: 'Product updated successfully',
      product
    });

  }
  catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }

});

// Delete product
app.delete('/api/products/:id', authMiddleware, async (req, res) => {

  try {

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (
      product.seller.toString() !== req.user._id.toString()
      && req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: 'Product deleted successfully' });

  }
  catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }

});

// ==================== SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});