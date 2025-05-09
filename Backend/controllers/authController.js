// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const signup = async (req, res) => {
  try {
    const { email, password, weight, height, targetWeight, dailyCalorieIntake } = req.body;

    if (!email || !password || !weight || !height || !targetWeight || !dailyCalorieIntake) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      email,
      password: hashedPassword,
      weight,
      height,
      targetWeight,
      dailyCalorieIntake,
    });

    await newUser.save();
    const token = generateToken(newUser._id);
    res.status(201).json({ token, userId: newUser._id });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Could not register user', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    res.status(200).json({ token, userId: user._id });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Could not log in', error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { targetWeight, dailyCalorieIntake } = req.body;
    const userId = req.user.userId;

    if (!targetWeight && !dailyCalorieIntake) {
      return res.status(400).json({ message: 'At least one field (targetWeight or dailyCalorieIntake) is required' });
    }

    const updateData = {};
    if (targetWeight) updateData.targetWeight = targetWeight;
    if (dailyCalorieIntake) updateData.dailyCalorieIntake = dailyCalorieIntake;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User data updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Could not update user data', error: error.message });
  }
};

module.exports = { signup, login, updateUser };