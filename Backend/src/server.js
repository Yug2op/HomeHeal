import dotenv from 'dotenv';
import { app } from './app.js';
import connectDB from './config/db.js';

// Load environment variables first
dotenv.config();

const PORT = process.env.PORT || 8000;

// Connect to MongoDB
connectDB()
    .then(() => {
        // Start the server after successful DB connection
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server is running on port: ${PORT}`);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (err) => {
            console.error('UNHANDLED REJECTION! 💥 Shutting down...');
            console.error(err);
            server.close(() => {
                process.exit(1);
            });
        });
    })
    .catch((error) => {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    })








