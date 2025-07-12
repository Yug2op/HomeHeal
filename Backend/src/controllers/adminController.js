import { User } from '../models/User.model.js';
import { Admin } from '../models/Admin.model.js';
import { Booking } from '../models/Booking.model.js';
import { Technician } from '../models/Technician.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiErrors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { cleanupTempFile } from '../utils/CleanupFile.js';

// Statistics
export const getDashboardStats = asyncHandler(async (req, res) => {
    // Get total users count (excluding admins)
    const totalUsers = await User.countDocuments({ role: 'user' });

    // Get total technicians
    const totalTechnicians = await User.countDocuments({ role: 'technician' });

    // Get total bookings count
    const totalBookings = await Booking.countDocuments();

    // Get recent bookings
    const recentBookings = await Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email phone')
        .populate('technician', 'name phone');

    // Get booking status counts
    const bookingStats = await Booking.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    res.status(200).json(
        new ApiResponse(200, {
            stats: {
                totalUsers,
                totalTechnicians,
                totalBookings,
                bookingStats
            },
            recentBookings
        }, 'Dashboard stats retrieved successfully')
    );
});

// Get System Analytics
export const getSystemAnalytics = asyncHandler(async (req, res) => {
    const { period = 'month' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate = new Date();

    switch (period) {
        case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
        case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
        case 'year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        default:
            startDate.setMonth(now.getMonth() - 1);
    }

    // Get user signups
    const userSignups = await User.aggregate([
        {
            $match: {
                role: 'user',
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Get booking stats
    const bookingStats = await Booking.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                total: { $sum: 1 },
                completed: {
                    $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
                },
                revenue: { $sum: "$totalAmount" }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Get service popularity
    const popularServices = await Booking.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: "$service",
                count: { $sum: 1 },
                revenue: { $sum: "$totalAmount" }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);

    // Get technician performance
    const technicianPerformance = await Booking.aggregate([
        {
            $match: {
                status: 'completed',
                technician: { $exists: true, $ne: null },
                completedAt: { $gte: startDate }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'technician',
                foreignField: '_id',
                as: 'technicianInfo'
            }
        },
        { $unwind: '$technicianInfo' },
        {
            $group: {
                _id: '$technician',
                name: { $first: { $concat: ["$technicianInfo.name.first", " ", { $ifNull: ["$technicianInfo.name.last", ""] }] } },
                totalJobs: { $sum: 1 },
                avgRating: { $avg: "$rating" },
                totalEarnings: { $sum: { $multiply: ["$totalAmount", 0.7] } } // Assuming 70% goes to technician
            }
        },
        { $sort: { totalJobs: -1 } },
        { $limit: 10 }
    ]);

    res.status(200).json(
        new ApiResponse(200, {
            userSignups,
            bookingStats,
            popularServices,
            technicianPerformance,
            period: {
                start: startDate,
                end: now,
                type: period
            }
        }, 'Analytics retrieved successfully')
    );
});

// User Management

// Update User Registration Status
export const updateUserStatus = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { registration_status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(registration_status)) {
        throw new ApiError(400, 'Invalid registration status. Must be one of: ' + validStatuses.join(', '));
    }

    const user = await User.findByIdAndUpdate(
        userId,
        { registration_status },
        { new: true }
    ).select('-password -refreshToken');

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    res.status(200).json(
        new ApiResponse(200, user, 'User registration status updated successfully')
    );
});

// Technician Management

// Update Technician Status
export const updateTechnicianStatus = asyncHandler(async (req, res) => {
    const { technicianId } = req.params;
    const { registration_status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(registration_status)) {
        throw new ApiError(400, 'Invalid registration status. Must be one of: ' + validStatuses.join(', '));
    }

    const technician = await Technician.findByIdAndUpdate(
        technicianId,
        { registration_status },
        { new: true }
    ).select('-password -refreshToken');

    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    res.status(200).json(
        new ApiResponse(200, technician, 'Technician status updated successfully')
    );
});
