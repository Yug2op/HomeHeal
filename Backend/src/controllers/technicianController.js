import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiErrors.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { User } from '../models/User.model.js';
import { Technician } from '../models/Technician.model.js';
import { Booking } from '../models/Booking.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import mongoose from 'mongoose';

// Register a new technician (Admin/Partner only)
const registerTechnician = asyncHandler(async (req, res) => {
    const {
        // Basic Info
        name, email, phone, password,
        // Personal Info
        dateOfBirth, gender,
        // Emergency Contact
        emergencyContact,
        // Professional Info
        services, skills, experience, bio,
        // Location
        location,
        // Bank Details
        bankDetails,
        // Documents (handled in middleware)
    } = req.body;

    // Check if user already exists
    const existedUser = await User.findOne({
        $or: [{ email }, { phone }]
    });

    if (existedUser) {
        throw new ApiError(409, "User with email or phone already exists");
    }

    // Process uploaded files
    const documents = [];
    
    // Handle ID proof
    if (req.files?.idProof?.[0]) {
        const idProof = await uploadOnCloudinary(req.files.idProof[0].path);
        documents.push({
            type: 'id_proof',
            url: idProof.url,
            publicId: idProof.public_id
        });
    }
    
    // Handle address proof
    if (req.files?.addressProof?.[0]) {
        const addressProof = await uploadOnCloudinary(req.files.addressProof[0].path);
        documents.push({
            type: 'address_proof',
            url: addressProof.url,
            publicId: addressProof.public_id
        });
    }
    
    // Handle certificates
    if (req.files?.certificates?.length) {
        for (const cert of req.files.certificates) {
            const certUpload = await uploadOnCloudinary(cert.path);
            documents.push({
                type: 'certificate',
                url: certUpload.url,
                publicId: certUpload.public_id,
                name: cert.originalname
            });
        }
    }

    // Create new technician
    const technician = await Technician.create({
        name,
        email,
        phone,
        password,
        role: 'technician',
        dateOfBirth,
        gender,
        emergencyContact,
        services,
        skills,
        experience,
        bio,
        location,
        bankDetails,
        status: 'pending_verification',
        documents: documents
    });

    // Remove sensitive data from response
    const createdTechnician = await Technician.findById(technician._id).select(
        "-password -refreshToken"
    );

    if (!createdTechnician) {
        throw new ApiError(500, "Something went wrong while registering the technician");
    }

    return res.status(201).json(
        new ApiResponse(200, createdTechnician, "Technician registered successfully")
    );
});

// Get technician's own profile
const getTechnicianProfile = asyncHandler(async (req, res) => {
    const technician = await Technician.findById(req.user._id).select(
        "-password -refreshToken"
    );

    if (!technician) {
        throw new ApiError(404, "Technician not found");
    }

    return res.status(200).json(
        new ApiResponse(200, technician, "Technician profile retrieved successfully")
    );
});

// Update technician profile        
const updateTechnicianProfile = asyncHandler(async (req, res) => {
    const updates = Object.keys(req.body);
    const allowedUpdates = [
        'name', 'dateOfBirth', 'gender', 'emergencyContact', 'services',
        'skills', 'experience', 'bio', 'location', 'bankDetails', 'profilePicture'
    ];
    const isValidOperation = updates.every(update => 
        allowedUpdates.includes(update)
    );

    if (!isValidOperation) {
        throw new ApiError(400, "Invalid updates!");
    }

    const technician = await Technician.findById(req.user._id);
    
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    // Handle file uploads if any
    if (req.files) {
        if (req.files.profilePicture) {
            const profilePicture = await uploadOnCloudinary(req.files.profilePicture[0].path);
            technician.profilePicture = profilePicture.url;
        }
        // Handle other file uploads if needed
    }

    // Update other fields
    updates.forEach(update => {
        if (req.body[update] !== undefined) {
            technician[update] = req.body[update];
        }
    });

    await technician.save();

    return res.status(200).json(
        new ApiResponse(200, technician, "Profile updated successfully")
    );
});

// Update technician availability
const updateTechnicianAvailability = asyncHandler(async (req, res) => {
    const { status } = req.body;
    
    if (!['available', 'busy', 'offline'].includes(status)) {
        throw new ApiError(400, "Invalid status. Must be 'available', 'busy', or 'offline'");
    }

    const technician = await Technician.findById(req.user._id);
    
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    technician.availability.status = status;
    technician.availability.lastUpdated = new Date();
    
    await technician.save();

    return res.status(200).json(
        new ApiResponse(200, technician.availability, "Availability updated successfully")
    );
});

// Get all technicians (Admin/Manager only)
const getAllTechnicians = asyncHandler(async (req, res) => {
    const { 
        status, 
        service, 
        available, 
        search,
        page = 1, 
        limit = 10 
    } = req.query;

    const query = { role: 'technician' };
    
    // Apply filters
    if (status) query.status = status;
    if (service) query.services = new mongoose.Types.ObjectId(service);
    if (available === 'true') {
        query['availability.status'] = 'available';
    }
    
    // Search functionality
    if (search) {
        query.$or = [
            { 'name.first': { $regex: search, $options: 'i' } },
            { 'name.last': { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { skills: { $regex: search, $options: 'i' } }
        ];
    }

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 },
        select: '-password -refreshToken',
        populate: [
            { path: 'services', select: 'name description' },
            { path: 'assignedBookings', select: 'status scheduleDate' }
        ]
    };

    const result = await Technician.paginate(query, options);

    return res.status(200).json(
        new ApiResponse(200, result, "Technicians retrieved successfully")
    );
});

// Get technician by ID (Admin/Manager only)
const getTechnicianById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const technician = await Technician.findById(id)
        .select('-password -refreshToken')
        .populate('services', 'name description')
        .populate('assignedBookings', 'status scheduleDate');

    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    return res.status(200).json(
        new ApiResponse(200, technician, "Technician retrieved successfully")
    );
});

// Delete technician (Admin/Partner only)
const deleteTechnicianById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if technician exists
    const technician = await Technician.findById(id);
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    // Soft delete by updating status
    technician.status = 'inactive';
    await technician.save();

    // Optionally, you might want to revoke tokens or perform cleanup
    // await User.findByIdAndUpdate(id, { $set: { refreshToken: null } });

    return res.status(200).json(
        new ApiResponse(200, null, "Technician deactivated successfully")
    );
});

// Get all bookings assigned to the technician
const getAssignedBookings = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;
    const technicianId = req.user._id;

    const query = { assigned_technician: technicianId };
    
    // Filter by status if provided
    if (status) {
        query.status = status;
    }

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { scheduleDate: 1 }, // Sort by schedule date ascending
        populate: [
            { path: 'user', select: 'name phone email' },
            { path: 'services.serviceId', select: 'name description' },
            { path: 'address', select: 'addressLine1 addressLine2 city state postalCode' }
        ]
    };

    const bookings = await Booking.paginate(query, options);

    return res.status(200).json(
        new ApiResponse(200, bookings, 'Assigned bookings retrieved successfully')
    );
});

// Get details of a specific booking
const getBookingDetails = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const technicianId = req.user._id;

    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: technicianId
    })
    .populate('user', 'name phone email')
    .populate('services.serviceId', 'name description price')
    .populate('address', 'addressLine1 addressLine2 city state postalCode')
    .populate('assigned_technician', 'name phone')
    .populate('statusHistory.changedBy', 'name role');

    if (!booking) {
        throw new ApiError(404, 'Booking not found or not assigned to you');
    }

    return res.status(200).json(
        new ApiResponse(200, booking, 'Booking details retrieved successfully')
    );
});

// Accept or reject a booking assignment
const updateBookingAssignment = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { action } = req.body; // 'accept' or 'reject'
    const technicianId = req.user._id;

    if (!['accept', 'reject'].includes(action)) {
        throw new ApiError(400, "Action must be either 'accept' or 'reject'");
    }

    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: technicianId,
        status: 'assigned'
    });

    if (!booking) {
        throw new ApiError(404, 'Booking not found or already processed');
    }

    if (action === 'accept') {
        booking.status = 'confirmed';
        booking.statusHistory.push({
            status: 'confirmed',
            changedAt: new Date(),
            changedBy: technicianId,
            note: 'Technician accepted the booking'
        });
    } else {
        booking.status = 'rejected';
        booking.assigned_technician = null;
        booking.statusHistory.push({
            status: 'rejected',
            changedAt: new Date(),
            changedBy: technicianId,
            note: 'Technician rejected the booking'
        });
    }

    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, booking, `Booking ${action}ed successfully`)
    );
});

// Update job status with validation
const updateJobStatus = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { status, note } = req.body;
    const technicianId = req.user._id;

    const validStatuses = [
        'pending', 'confirmed', 'assigned', 'reached', 
        'otp_pending', 'in_progress', 'completed', 
        'cancelled', 'rescheduled', 'rejected'
    ];

    if (!validStatuses.includes(status)) {
        throw new ApiError(400, 'Invalid status');
    }

    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: technicianId
    });

    if (!booking) {
        throw new ApiError(404, 'Booking not found or not assigned to you');
    }

    // Validate status transition
    const currentStatus = booking.status;
    const validTransitions = {
        'assigned': ['confirmed', 'rejected'],
        'confirmed': ['reached'],
        'reached': ['otp_pending'],
        'otp_pending': ['in_progress'],
        'in_progress': ['completed'],
        // Add other valid transitions as needed
    };

    if (validTransitions[currentStatus] && !validTransitions[currentStatus].includes(status)) {
        throw new ApiError(400, `Cannot change status from ${currentStatus} to ${status}`);
    }

    // Update status
    booking.status = status;
    booking.statusHistory.push({
        status,
        changedAt: new Date(),
        changedBy: technicianId,
        note: note || `Status changed to ${status}`
    });

    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, booking, 'Job status updated successfully')
    );
});

// Get ratings and feedback for technician
const getRatingsAndFeedback = asyncHandler(async (req, res) => {
    const technicianId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    // Get all completed bookings with ratings for this technician
    const query = {
        assigned_technician: technicianId,
        status: 'completed',
        rating: { $exists: true, $ne: null }
    };

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { reviewDate: -1 },
        select: 'rating review reviewDate',
        populate: [
            { 
                path: 'user',
                select: 'name profilePicture'
            }
        ]
    };

    // Get paginated results
    const result = await Booking.paginate(query, options);

    // Calculate average rating
    const stats = await Booking.aggregate([
        { $match: { 
            assigned_technician: new mongoose.Types.ObjectId(technicianId),
            status: 'completed',
            rating: { $exists: true, $ne: null }
        }},
        { $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 },
            fiveStar: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
            fourStar: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            threeStar: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            twoStar: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
        }}
    ]);

    const ratingStats = stats[0] || {
        averageRating: 0,
        totalRatings: 0,
        fiveStar: 0,
        fourStar: 0,
        threeStar: 0,
        twoStar: 0,
        oneStar: 0
    };

    return res.status(200).json(
        new ApiResponse(200, {
            stats: {
                averageRating: ratingStats.averageRating ? parseFloat(ratingStats.averageRating.toFixed(1)) : 0,
                totalRatings: ratingStats.totalRatings || 0,
                ratingDistribution: {
                    fiveStar: ratingStats.fiveStar || 0,
                    fourStar: ratingStats.fourStar || 0,
                    threeStar: ratingStats.threeStar || 0,
                    twoStar: ratingStats.twoStar || 0,
                    oneStar: ratingStats.oneStar || 0
                }
            },
            reviews: result.docs,
            pagination: {
                total: result.totalDocs,
                page: result.page,
                pages: result.totalPages,
                limit: result.limit
            }
        }, 'Ratings and feedback retrieved successfully')
    );
});

// Get job statistics for technician
const getJobStats = asyncHandler(async (req, res) => {
    const technicianId = req.user._id;
    const { startDate, endDate } = req.query;

    // Set up date range
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Base match query
    const matchQuery = {
        assigned_technician: new mongoose.Types.ObjectId(technicianId),
        status: 'completed'
    };
    
    if (Object.keys(dateFilter).length > 0) {
        matchQuery.completedAt = dateFilter;
    }

    // Get job statistics
    const stats = await Booking.aggregate([
        { $match: matchQuery },
        { $group: {
            _id: null,
            totalJobs: { $sum: 1 },
            totalEarnings: { $sum: '$finalAmount' },
            avgRating: { $avg: '$rating' },
            jobsByService: { 
                $push: {
                    service: '$services.serviceId',
                    amount: '$finalAmount'
                } 
            }
        }},
        // Unwind the services array to group by service
        { $unwind: '$jobsByService' },
        { $unwind: '$jobsByService.service' },
        { $group: {
            _id: '$jobsByService.service',
            totalJobs: { $sum: 1 },
            totalEarnings: { $sum: '$jobsByService.amount' },
            overallStats: { $first: '$$ROOT' }
        }},
        { $group: {
            _id: null,
            services: {
                $push: {
                    service: '$_id',
                    totalJobs: '$totalJobs',
                    totalEarnings: '$totalEarnings'
                }
            },
            totalJobs: { $first: '$overallStats.totalJobs' },
            totalEarnings: { $first: '$overallStats.totalEarnings' },
            avgRating: { $first: '$overallStats.avgRating' }
        }},
        { $lookup: {
            from: 'services',
            localField: 'services.service',
            foreignField: '_id',
            as: 'serviceDetails'
        }},
        { $addFields: {
            services: {
                $map: {
                    input: '$services',
                    as: 'service',
                    in: {
                        $mergeObjects: [
                            '$$service',
                            {
                                service: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: '$serviceDetails',
                                                as: 'detail',
                                                cond: { $eq: ['$$detail._id', '$$service.service'] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            }
                        ]
                    }
                }
            }
        }}
    ]);

    // Get monthly earnings for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyEarnings = await Booking.aggregate([
        { 
            $match: { 
                assigned_technician: new mongoose.Types.ObjectId(technicianId),
                status: 'completed',
                completedAt: { $gte: sixMonthsAgo }
            } 
        },
        { 
            $group: {
                _id: { 
                    year: { $year: '$completedAt' },
                    month: { $month: '$completedAt' }
                },
                earnings: { $sum: '$finalAmount' },
                jobs: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Format the response
    const result = {
        totalJobs: stats[0]?.totalJobs || 0,
        totalEarnings: stats[0]?.totalEarnings || 0,
        averageRating: stats[0]?.avgRating ? parseFloat(stats[0].avgRating.toFixed(1)) : 0,
        services: stats[0]?.services || [],
        monthlyEarnings: monthlyEarnings.map(item => ({
            year: item._id.year,
            month: item._id.month,
            earnings: item.earnings,
            jobs: item.jobs
        }))
    };

    return res.status(200).json(
        new ApiResponse(200, result, 'Job statistics retrieved successfully')
    );
});

// Assign technician to a partner (Admin/Manager only)
const assignTechnicianToPartner = asyncHandler(async (req, res) => {
    const { technicianId } = req.params;
    const { partnerId } = req.body;
    
    // Check if technician exists and is a technician
    const technician = await Technician.findById(technicianId);
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    // Check if partner exists and is a partner
    const partner = await User.findOne({ _id: partnerId, role: 'partner' });
    if (!partner) {
        throw new ApiError(404, 'Partner not found');
    }

    // Update technician's partner
    technician.partner = partnerId;
    technician.updatedBy = req.user._id;
    await technician.save();

    return res.status(200).json(
        new ApiResponse(200, technician, 'Technician assigned to partner successfully')
    );
});

// Get list of unverified technicians (Admin/Manager only)
const getUnverifiedTechnicians = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status } = req.query;
    
    const query = { 
        role: 'technician',
        isVerified: false 
    };

    // Optional status filter
    if (['pending', 'rejected', 'approved'].includes(status)) {
        query.verificationStatus = status;
    }

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 },
        select: 'name email phone isVerified verificationStatus documents createdAt',
        populate: [
            { path: 'documents', select: 'type url verified' },
            { path: 'partner', select: 'name email' }
        ]
    };

    const technicians = await Technician.paginate(query, options);

    return res.status(200).json(
        new ApiResponse(200, technicians, 'Unverified technicians retrieved successfully')
    );
});

// Change technician status (Admin/Manager only)
const changeTechnicianStatus = asyncHandler(async (req, res) => {
    const { technicianId } = req.params;
    const { status, reason } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
        throw new ApiError(400, 'Invalid status. Must be one of: active, inactive, suspended');
    }

    const technician = await Technician.findById(technicianId);
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    // Store previous status for history
    const previousStatus = technician.status;
    technician.status = status;
    technician.updatedBy = req.user._id;
    
    // Add to status history
    technician.statusHistory = technician.statusHistory || [];
    technician.statusHistory.push({
        status,
        changedBy: req.user._id,
        reason: reason || `Status changed from ${previousStatus} to ${status}`,
        changedAt: new Date()
    });

    await technician.save();

    return res.status(200).json(
        new ApiResponse(200, technician, `Technician status updated to ${status} successfully`)
    );
});

// Get technicians by partner ID (Admin/Manager/Partner)
const getTechniciansByPartnerId = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // If user is a partner, they can only see their own technicians
    const requestingUser = req.user;
    if (requestingUser.role === 'partner' && requestingUser._id.toString() !== partnerId) {
        throw new ApiError(403, 'Not authorized to view these technicians');
    }

    const query = { 
        partner: partnerId,
        role: 'technician' 
    };

    // Filter by status if provided
    if (['active', 'inactive', 'suspended'].includes(status)) {
        query.status = status;
    }

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { name: 1 },
        select: 'name email phone status rating totalJobs isVerified',
        populate: [
            { path: 'services', select: 'name' },
            { path: 'partner', select: 'name email' }
        ]
    };

    const technicians = await Technician.paginate(query, options);

    return res.status(200).json(
        new ApiResponse(200, technicians, 'Technicians retrieved successfully')
    );
});

export {
    registerTechnician,
    getTechnicianProfile,
    updateTechnicianProfile,
    updateTechnicianAvailability,
    getAllTechnicians,
    getTechnicianById,
    deleteTechnicianById,
    getAssignedBookings,
    getBookingDetails,
    updateBookingAssignment,
    updateJobStatus,
    getRatingsAndFeedback,
    getJobStats,
    assignTechnicianToPartner,
    getUnverifiedTechnicians,
    changeTechnicianStatus,
    getTechniciansByPartnerId
};
