import { User } from '../models/User.model.js';
import { Admin } from '../models/Admin.model.js';
import { Booking } from '../models/Booking.model.js';
import { Technician } from '../models/Technician.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiErrors.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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

// Update User Status
export const updateUserStatus = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
        userId,
        { isActive },
        { new: true }
    ).select('-password -refreshToken');

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    res.status(200).json(
        new ApiResponse(200, user, 'User status updated successfully')
    );
});

// Technician Management

// Update Technician Status
export const updateTechnicianStatus = asyncHandler(async (req, res) => {
    const { technicianId } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'inactive', 'suspended'];
    if (!validStatuses.includes(status)) {
        throw new ApiError(400, 'Invalid status. Must be one of: ' + validStatuses.join(', '));
    }

    const technician = await Technician.findByIdAndUpdate(
        technicianId,
        { status },
        { new: true }
    ).select('-password -refreshToken');

    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    res.status(200).json(
        new ApiResponse(200, technician, 'Technician status updated successfully')
    );
});

// Admin Management

// Create a new admin account
export const createAdmin = asyncHandler(async (req, res) => {
    const { name, email, phone, password, department, jobTitle } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
        $or: [{ email }, { phone }]
    });

    if (existingAdmin) {
        throw new ApiError(409, 'Admin with this email or phone already exists');
    }

    // Only super admins can create other admins
    if (!req.user?.isSuperAdmin) {
        throw new ApiError(403, 'Not authorized to create admin accounts');
    }

    // Create new admin
    const admin = await Admin.create({
        name,
        email,
        phone,
        password,
        department,
        jobTitle,
        role: 'admin',
        isSuperAdmin: req.body.isSuperAdmin || false
    });

    // Remove sensitive data
    const createdAdmin = await Admin.findById(admin._id).select('-password -refreshToken');

    if (!createdAdmin) {
        throw new ApiError(500, 'Something went wrong while creating admin');
    }

    res.status(201).json(
        new ApiResponse(201, createdAdmin, 'Admin created successfully')
    );
});

// Logout admin
export const logoutAdmin = asyncHandler(async (req, res) => {
    await Admin.findByIdAndUpdate(
        req.admin._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true
        }
    );

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "Admin logged out successfully"));
});

// Login admin
export const loginAdmin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, 'Email and password are required');
    }

    // Find admin by email
    const admin = await Admin.findOne({ email });

    if (!admin) {
        throw new ApiError(401, 'Invalid email or password');
    }

    // Check password
    const isPasswordValid = await admin.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, 'Invalid email or password');
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(admin);

    // Get admin without sensitive data
    const loggedInAdmin = await Admin.findById(admin._id).select('-password -refreshToken');

    // Set refresh token in cookie
    setRefreshTokenCookie(res, refreshToken);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                admin: loggedInAdmin,
                accessToken
            },
            'Admin logged in successfully'
        )
    );
});

// Get logged-in admin's profile
export const getAdminProfile = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user._id).select('-password -refreshToken');
    
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }

    res.status(200).json(
        new ApiResponse(200, admin, 'Admin profile retrieved successfully')
    );
});

// Update admin profile
export const updateAdminProfile = asyncHandler(async (req, res) => {
    const { name, email, phone, department, jobTitle } = req.body;

    const admin = await Admin.findById(req.user._id);
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }

    // Update fields if provided
    if (name) admin.name = name;
    if (email) admin.email = email;
    if (phone) admin.phone = phone;
    if (department) admin.department = department;
    if (jobTitle) admin.jobTitle = jobTitle;

    const updatedAdmin = await admin.save();
    
    // Remove sensitive data
    const adminData = updatedAdmin.toObject();
    delete adminData.password;
    delete adminData.refreshToken;

    res.status(200).json(
        new ApiResponse(200, adminData, 'Profile updated successfully')
    );
});

// Change admin password
export const changeAdminPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const admin = await Admin.findById(req.user._id);
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }

    // Verify current password
    const isPasswordValid = await admin.isPasswordCorrect(currentPassword);
    if (!isPasswordValid) {
        throw new ApiError(401, 'Current password is incorrect');
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.status(200).json(
        new ApiResponse(200, null, 'Password changed successfully')
    );
});

// Get all admins
export const getAllAdmins = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '' } = req.query;
    
    const query = {
        role: 'admin',
        ...(search && {
            $or: [
                { 'name.first': { $regex: search, $options: 'i' } },
                { 'name.last': { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { department: { $regex: search, $options: 'i' } },
                { jobTitle: { $regex: search, $options: 'i' } }
            ]
        })
    };

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 },
        select: '-password -refreshToken'
    };

    const admins = await Admin.paginate(query, options);

    res.status(200).json(
        new ApiResponse(200, admins, 'Admins retrieved successfully')
    );
});

// Get admin by ID
export const getAdminById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const admin = await Admin.findById(id).select('-password -refreshToken');
    
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }

    // Only super admin can view other super admins' details
    if (admin.isSuperAdmin && !req.user.isSuperAdmin) {
        throw new ApiError(403, 'Not authorized to view this admin');
    }

    res.status(200).json(
        new ApiResponse(200, admin, 'Admin retrieved successfully')
    );
});

// Delete admin
export const deleteAdminById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Prevent deleting self
    if (id === req.user._id.toString()) {
        throw new ApiError(400, 'You cannot delete your own account');
    }

    const admin = await Admin.findById(id);
    
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }

    // Only super admin can delete other admins
    if (!req.user.isSuperAdmin) {
        throw new ApiError(403, 'Not authorized to delete admin');
    }

    // Prevent deleting other super admins
    if (admin.isSuperAdmin) {
        throw new ApiError(403, 'Cannot delete a super admin');
    }

    await Admin.findByIdAndDelete(id);

    res.status(200).json(
        new ApiResponse(200, null, 'Admin deleted successfully')
    );
});


