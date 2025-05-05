// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;

const authRoutes = require('./routes/authRoutes');
const foodRoutes = require('./routes/foodRoutes');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');

// Ensure the uploads directory exists
(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log(`Created uploads directory at ${uploadDir}`);
  } catch (error) {
    console.error('Error creating uploads directory:', error);
    // If uploads directory cannot be created, the app might not function correctly
    process.exit(1);
  }
})();

// Middleware setup
app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Parse JSON request bodies

// Multer setup for handling file uploads
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });
app.use(upload.single('image')); // Middleware to handle single image uploads with the field name 'image'

// Custom JWT authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401); // Unauthorized
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.sendStatus(403); // Forbidden (invalid token)
    }
    req.user = user; // Attach user payload (typically userId) to the request
    next(); // Proceed to the next middleware or route handler
  });
};

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Optional: Adjust based on your Mongoose version
      // useCreateIndex: true,
      // useFindAndModify: false,
    });
    console.log('MongoDB connected successfully!');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1); // Exit process on database connection failure
  }
};

connectDB();

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/food', authenticateToken, foodRoutes); // Apply authentication middleware to /api/food routes

// Error handling middleware for unhandled errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});