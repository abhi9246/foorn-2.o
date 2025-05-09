// server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken } = require('./middleware/authMiddleware');

const authRoutes = require('./routes/authRoutes');
const foodRoutes = require('./routes/foodRoutes');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'Uploads');

// Ensure the uploads directory exists
(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log(`Created uploads directory at ${uploadDir}`);
  } catch (error) {
    console.error('Error creating uploads directory:', error);
    process.exit(1);
  }
})();

// Middleware setup
app.use(cors());
app.use(express.json());

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully!');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
connectDB();

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/food', authenticateToken, foodRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});