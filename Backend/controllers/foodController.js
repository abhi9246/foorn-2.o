const axios = require('axios');
const dotenv = require('dotenv');
const History = require('../models/History');
const User = require('../models/User');
const { ClarifaiStub, grpc } = require('clarifai-nodejs-grpc');
const nodemailer = require('nodemailer');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path'); // Add this at the top of the file

dotenv.config();

const stub = ClarifaiStub.grpc();
const metadata = new grpc.Metadata();
metadata.set('Authorization', `Key ${process.env.CLARIFAI_API_KEY}`);

const calculateCalories = (protein, carbs, fats, providedCalories) => {
  return providedCalories || (protein * 4) + (carbs * 4) + (fats * 9);
};

const sendNotificationEmail = async (userEmail, dailyCalories, dailyCalorieIntake) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: userEmail,
      subject: 'Daily Calorie Limit Exceeded',
      html: `<p>Your daily calorie intake (${dailyCalories} kcal) has exceeded your set limit of ${dailyCalorieIntake} kcal.</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log('Notification email sent.');
  } catch (error) {
    console.error('Error sending notification email:', error);
  }
};

exports.analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image.' });
    }

    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const base64Image = req.file.buffer.toString('base64');

    stub.PostModelOutputs(
      {
        model_id: 'food-recognition',
        inputs: [{ data: { image: { base64: base64Image } } }],
      },
      metadata,
      async (err, response) => {
        if (err) {
          console.error('Clarifai error:', err);
          return res.status(500).json({ message: 'Failed to analyze image.' });
        }

        if (response.status.code !== 10000) {
          console.error('Clarifai response error:', response);
          return res.status(500).json({ message: `Clarifai API error: ${response.status.description}` });
        }

        const foods = response.outputs[0].data.concepts.map((concept) => concept.name);
        console.log('Identified foods:', foods);

        try {
          const modelApiResponse = await axios.post(process.env.MODEL_API_URL, { image: base64Image });
          const { protein, carbs, fats, calories: predictedCalories } = modelApiResponse.data;
          const calories = calculateCalories(protein, carbs, fats, predictedCalories);
          const now = new Date();
          const timestamp = `<span class="math-inline">\{now\.getHours\(\)\.toString\(\)\.padStart\(2, '0'\)\}\:</span>{now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
          const date = now.toISOString().slice(0, 10);

          const newMeal = {
            timestamp,
            foods,
            calories,
            macronutrients: { protein, carbs, fats },
          };

          let history = await History.findOne({ userId, date });
          if (history) {
            history.meals.push(newMeal);
            await history.save();
          } else {
            history = new History({
              userId,
              date,
              meals: [newMeal],
            });
            await history.save();
          }

          // Check daily calorie limit
          const dailyHistory = await History.findOne({ userId, date });
          if (dailyHistory) {
            const totalDailyCalories = dailyHistory.meals.reduce((sum, meal) => sum + meal.calories, 0);
            if (totalDailyCalories > user.dailyCalorieIntake) {
              sendNotificationEmail(user.email, totalDailyCalories, user.dailyCalorieIntake);
              return res.status(200).json({ meal: newMeal, exceeded: true, message: 'Daily calorie limit exceeded!' });
            }
          }

          res.status(200).json({ meal: newMeal });

        } catch (error) {
          console.error('Model API error:', error);
          return res.status(500).json({ message: 'Failed to get macronutrient prediction.' });
        }
      }
    );
  } catch (error) {
    console.error('Analyze image error:', error);
    res.status(500).json({ message: 'Failed to process image upload.' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { type, date, month } = req.query;
    const userId = req.user.userId;

    if (type === 'daily' && date) {
      const history = await History.findOne({ userId, date });
      if (history) {
        const dailyCalories = history.meals.reduce((sum, meal) => sum + meal.calories, 0);
        const dailyProtein = history.meals.reduce((sum, meal) => sum + meal.macronutrients.protein, 0);
        const dailyCarbs = history.meals.reduce((sum, meal) => sum + meal.macronutrients.carbs, 0);
        const dailyFats = history.meals.reduce((sum, meal) => sum + meal.macronutrients.fats, 0);
        res.status(200).json({ meals: history.meals, dailyTotals: { calories: dailyCalories, protein: dailyProtein, carbs: dailyCarbs, fats: dailyFats } });
      } else {
        res.status(200).json({ meals: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } });
      }
    } else if (type === 'monthly' && month) {
      const year = month.split('-')[0];
      const monthNumber = month.split('-')[1];
      const startDate = new Date(`<span class="math-inline">\{year\}\-</span>{monthNumber}-01`);
      const endDate = new Date(new Date(startDate).setMonth(startDate.getMonth() + 1));

      const history = await History.find({
        userId,
        date: {
          $gte: startDate.toISOString().slice(0, 10),
          $lt: endDate.toISOString().slice(0, 10),
        },
      }).sort({ date: 1 });

      const dailySummaries = history.map((day) => {
        const dailyCalories = day.meals.reduce((sum, meal) => sum + meal.calories, 0);
        const dailyProtein = day.meals.reduce((sum, meal) => sum + meal.macronutrients.protein, 0);
        const dailyCarbs = day.meals.reduce((sum, meal) => sum + meal.macronutrients.carbs, 0);
        const dailyFats = day.meals.reduce((sum, meal) => sum + meal.macronutrients.fats, 0);
        return {
          date: day.date,
          meals: day.meals,
          dailyTotals: { calories: dailyCalories, protein: dailyProtein, carbs: dailyCarbs, fats: dailyFats },
        };
      });

      res.status(200).json(dailySummaries);
    } else {
      res.status(400).json({ message: 'Invalid history request.' });
    }
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ message: 'Failed to retrieve history.' });
  }
};

exports.downloadHistory = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.userId;

    const query = { userId };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      query.date = { $gte: startDate };
    } else if (endDate) {
      query.date = { $lte: endDate };
    }

    const history = await History.find(query).sort({ date: 1, 'meals.timestamp': 1 });

    if (!history || history.length === 0) {
      return res.status(200).json({ message: 'No history found for the specified period.' });
    }

    const records = [];
    for (const day of history) {
      for (const meal of day.meals) {
        records.push({
          Date: day.date,
          Time: meal.timestamp,
          Foods: meal.foods.join(', '),
          Calories: meal.calories,
          'Protein(g)': meal.macronutrients.protein,
          'Carbs(g)': meal.macronutrients.carbs,
          'Fats(g)': meal.macronutrients.fats,
        });
      }
      const dailyCalories = day.meals.reduce((sum, meal) => sum + meal.calories, 0);
      const dailyProtein = day.meals.reduce((sum, meal) => sum + meal.macronutrients.protein, 0);
      const dailyCarbs = day.meals.reduce((sum, meal) => sum + meal.macronutrients.carbs, 0);
      const dailyFats = day.meals.reduce((sum, meal) => sum + meal.macronutrients.fats, 0);
      records.push({
        Date: day.date,
        Time: '',
        Foods: 'Total',
        Calories: dailyCalories,
        'Protein(g)': dailyProtein,
        'Carbs(g)': dailyCarbs,
        'Fats(g)': dailyFats,
      });
    }

    const csvWriter = createObjectCsvWriter({
      path: 'history.csv', // The file will be created on the server
      header: [
        { id: 'Date', title: 'Date' },
        { id: 'Time', title: 'Time' },
        { id: 'Foods', title: 'Foods' },
        { id: 'Calories', title: 'Calories' },
        { id: 'Protein(g)', title: 'Protein(g)' },
        { id: 'Carbs(g)', title: 'Carbs(g)' },
        { id: 'Fats(g)', title: 'Fats(g)' },
      ],
    });

    await csvWriter.writeRecords(records);

    const filePath = path.join(__dirname, '../../history.csv'); // Adjust the path as needed
    res.download(filePath, (err) => {
      if (err) {
        console.error('Error downloading CSV:', err);
      }
    });
  } catch (error) {
    console.error('Download history error:', error);
    res.status(500).json({ message: 'Failed to download history.' });
  }
};