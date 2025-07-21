import express from "express"
import cookieParser from "cookie-parser"
// import cors from "cors"

const app = express()

// Middleware
app.use(express.json({ limit: '16kb' }))
app.use(express.urlencoded({
    extended: true,
    limit: "16kb",
}))
app.use(express.static("public"))
app.use(cookieParser())

// CORS Configuration (commented out for now)
// const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : [];
// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin) return callback(null, true); // Allow Postman, curl, etc.
//     if (allowedOrigins.includes(origin)) {
//       return callback(null, true); // Allow specified origins
//     } else {
//       return callback(new Error("Not allowed by CORS"));
//     }
//   },
//   credentials: true,
// }));

// Import routes
import userRouter from "./routes/userRoutes.js"
import dealerPartRouter from "./routes/dealerPartRoutes.js"
import bookingRouter from "./routes/bookingRoutes.js"
import partBookingRouter from "./routes/partBookingRoutes.js"
import adminRouter from "./routes/adminRoutes.js"
import technicianRouter from "./routes/technicianRoutes.js"
import serviceRouter from "./routes/serviceRoutes.js"
// import healthcheckRouter from "./routes/healthcheck.routes.js"

// Routes declaration
app.use("/api/v1/users", userRouter)
app.use("/api/v1/part-bookings", partBookingRouter)
app.use("/api/v1/dealer/parts", dealerPartRouter)
app.use("/api/v1/bookings", bookingRouter)
app.use("/api/v1/services", serviceRouter)
app.use("/api/v1/admin", adminRouter)
app.use("/api/v1/technicians", technicianRouter)
// app.use("/api/v1/healthcheck", healthcheckRouter)

// http://localhost:5000/api/v1/users/register



export { app }  