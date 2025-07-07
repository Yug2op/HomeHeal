import mongoose from "mongoose";
import { DB_NAME } from "../constants.js"

const connectDB = async () => {
    try {
        const connectionString = `${process.env.MONGO_URI}/${DB_NAME}`;
        const connectionInstance = await mongoose.connect(connectionString);
        console.log(`✅ Connected to MongoDB. Database: ${connectionInstance.connection.name}`);
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

export default connectDB;