import mongoose from 'mongoose';
import { Booking } from '../models/Booking.model.js';
import { BulkBooking } from '../models/BulkBooking.model.js';
import { User } from '../models/User.model.js';
import OTP, { generateOTP } from '../models/OTP.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiErrors.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { isAdminOrManager } from '../middlewares/role.middleware.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import fs from 'fs';

// Generate a unique booking ID
const generateBookingId = () => {
    return `BK${Date.now().toString().slice(-8)}`;
};

// Create a new booking
const createBooking = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { services, address, scheduleDate, preferredTimeSlot, notes } = req.body;

    // Validate required fields
    if (!services || !Array.isArray(services) || services.length === 0) {
        throw new ApiError(400, 'At least one service is required');
    }

    // Create new booking
    const booking = await Booking.create({
        bookingId: generateBookingId(),
        user: userId,
        services,
        address,
        scheduleDate,
        preferredTimeSlot,
        notes,
        status: 'pending',
        statusHistory: [{
            status: 'pending',
            changedAt: new Date(),
            changedBy: userId
        }]
    });

    // Populate the created booking with user details
    const newBooking = await Booking.findById(booking._id)
        .populate('user', 'name email phone')
        .populate('services.serviceId', 'name description price');

    return res.status(201).json(
        new ApiResponse(201, newBooking, 'Booking created successfully')
    );
});

// Get all bookings with filters
const getAllBookings = asyncHandler(async (req, res) => {
    const { status, startDate, endDate, userId, technicianId } = req.query;
    const user = req.user;

    // Build query
    const query = {};

    // Apply role-based filtering
    if (user.role === 'user') {
        query.user = user._id;
    } else if (user.role === 'technician') {
        query.assigned_technician = user._id;
    }

    // Apply filters
    if (status) query.status = status;
    if (userId && (user.role === 'admin' || user.role === 'manager')) {
        query.user = userId;
    }
    if (technicianId && (user.role === 'admin' || user.role === 'manager')) {
        query.assigned_technician = technicianId;
    }
    if (startDate && endDate) {
        query.scheduleDate = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }

    // Execute query with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
        Booking.find(query)
            .populate('user', 'name email phone')
            .populate('assigned_technician', 'name phone')
            .populate('services.serviceId', 'name price')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Booking.countDocuments(query)
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            bookings,
            total,
            page,
            pages: Math.ceil(total / limit)
        }, 'Bookings fetched successfully')
    );
});

// Get booking by ID
const getBookingById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;

    const booking = await Booking.findOne({
        _id: id,
        $or: [
            { user: userId },
            { assigned_technician: userId }
        ]
    }).populate([
        { path: 'user', select: 'name email phone' },
        { path: 'assigned_technician', select: 'name phone' },
        { path: 'services.serviceId', select: 'name description' },
        { path: 'rescheduledFrom', select: 'bookingId status' }
    ]);

    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    return res.status(200).json(
        new ApiResponse(200, booking, 'Booking retrieved successfully')
    );
});

// Update booking
const updateBookingById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, assigned_technician, scheduleDate, notes } = req.body;
    const user = req.user;

    // Find booking
    const booking = await Booking.findById(id);
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    // Check permission
    if (!isAdminOrManager(User, user._id)) {
        throw new ApiError(403, 'Not authorized to update this booking');
    }

    // Prepare update
    const updateData = {};
    const statusUpdate = {};

    // Only admin can change technician
    if (assigned_technician && user.role === 'admin' || user.role === 'manager' || user.role === 'partner') {
        const technician = await User.findById(assigned_technician);
        if (!technician || technician.role !== 'technician') {
            throw new ApiError(400, 'Invalid technician ID');
        }
        updateData.assigned_technician = assigned_technician;
        statusUpdate.status = 'assigned';
    }

    // Update status if provided
    if (status) {
        const validStatuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            throw new ApiError(400, 'Invalid status');
        }
        statusUpdate.status = status;
        statusUpdate.changedAt = new Date();
        statusUpdate.changedBy = user._id;
        statusUpdate.note = `Status changed to ${status}`;
    }

    // Update schedule date if provided
    if (scheduleDate) {
        updateData.scheduleDate = new Date(scheduleDate);
        updateData.$push = {
            statusHistory: {
                status: 'rescheduled',
                changedAt: new Date(),
                changedBy: user._id,
                note: `Your booking Rescheduled to ${new Date(scheduleDate).toLocaleDateString()}`
            }
        };
    }

    // Update notes if provided
    if (notes !== undefined) {
        updateData.notes = notes;
    }

    // Apply updates
    if (Object.keys(updateData).length > 0) {
        await Booking.findByIdAndUpdate(id, updateData);
    }

    // Update status if changed
    if (statusUpdate.status) {
        await Booking.findByIdAndUpdate(id, {
            status: statusUpdate.status,
            $push: { statusHistory: statusUpdate }
        });
    }

    // Get updated booking
    const updatedBooking = await Booking.findById(id)
        .populate('user', 'name email phone')
        .populate('assigned_technician', 'name phone')
        .populate('services.serviceId', 'name price');

    return res.status(200).json(
        new ApiResponse(200, updatedBooking, 'Booking updated successfully')
    );
});

// Cancel booking
const cancelBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    if (!reason) {
        throw new ApiError(400, 'Cancellation reason is required');
    }

    const booking = await Booking.findOne({
        _id: id,
        user: userId,
        status: { $in: ['pending', 'cancelled', 'confirmed'] }
    });

    if (!booking) {
        throw new ApiError(404, 'Booking not found or cannot be cancelled');
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    booking.statusHistory.push({
        status: 'cancelled',
        changedAt: new Date(),
        changedBy: userId,
        note: `Booking cancelled. Reason: ${reason}`
    });

    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, null, 'Booking cancelled successfully')
    );
});

// Delete booking (admin only)
const deleteBookingById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Only allow admins to delete bookings
    if (req.user.role !== 'admin' || req.user.role !== 'manager') {
        throw new ApiError(403, 'Not authorized to delete bookings');
    }

    const booking = await Booking.findByIdAndDelete(id);

    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    return res.status(200).json(
        new ApiResponse(200, null, 'Booking deleted successfully')
    );
});

// Get user bookings
const getUserBookings = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    const query = { user: userId };
    if (status) {
        query.status = status;
    }

    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 },
        populate: [
            { path: 'user', select: 'name email phone' },
            { path: 'assigned_technician', select: 'name phone' },
            { path: 'services.serviceId', select: 'name description' }
        ]
    };

    const bookings = await Booking.paginate(query, options);

    return res.status(200).json(
        new ApiResponse(200, bookings, 'Bookings retrieved successfully')
    );
});

// Update booking status
const updateBookingStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user._id;

    const booking = await Booking.findById(id);
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    if (!status) {
        throw new ApiError(400, 'Status is required');
    }

    // Validate if user has permission to update status
    if (booking.user.toString() !== userId.toString() &&
        booking.assigned_technician?.toString() !== userId.toString()) {
        throw new ApiError(403, 'Not authorized to update this booking');
    }

    // Add status to history
    booking.statusHistory.push({
        status,
        changedAt: new Date(),
        changedBy: userId,
        note: note || `Status changed to ${status}`
    });

    // Update status
    booking.status = status;
    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, booking, 'Booking status updated successfully')
    );
});

// Technician Assignment & Job Flow

// Assign technician to a booking (manual or auto-assign)
const assignTechnicianToBooking = asyncHandler(async (req, res) => {
    const { id: bookingId } = req.params;
    const { technicianId, forceAssign = false } = req.body;
    const { _id: userId, role } = req.user;

    // Check if user has permission
    if (!['admin', 'manager', 'partner'].includes(role)) {
        throw new ApiError(403, 'Only admin, manager, or partner can assign technicians');
    }

    // Find the booking with service details
    const booking = await Booking.findById(bookingId)
        .populate('services.serviceId', 'category skillsRequired')
        .populate('user', 'location');

    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    // Check if booking already has a technician assigned
    if (booking.assigned_technician && !forceAssign) {
        throw new ApiError(400, 'Booking already has an assigned technician. Use forceAssign=true to override');
    }

    let technician;
    const Technician = User.discriminator('Technician');

    // Manual assignment
    if (technicianId) {
        technician = await Technician.findOne({
            _id: technicianId,
            status: 'active',
            isOnline: true
        });

        if (!technician) {
            throw new ApiError(404, 'Technician not found or not available');
        }

        // Check technician's current workload
        const currentWorkload = await Booking.countDocuments({
            assigned_technician: technician._id,
            status: { $in: ['assigned', 'in_progress'] }
        });

        if (currentWorkload >= technician.maxWorkload) {
            throw new ApiError(400, 'Technician has reached maximum workload');
        }

        // Check if technician has the required skills
        const requiredSkills = booking.services.flatMap(s => s.serviceId.skillsRequired || []);
        if (requiredSkills.length > 0 && technician.skills) {
            const hasRequiredSkills = requiredSkills.every(skill =>
                technician.skills.includes(skill)
            );
            if (!hasRequiredSkills) {
                throw new ApiError(400, 'Technician does not have all the required skills for this booking');
            }
        }
    }
    // Auto-assignment
    else {
        // Get current time for availability check
        const now = new Date();
        const currentDay = now.toLocaleString('en-US', { weekday: 'lowercase' });
        const currentTime = now.getHours() * 100 + now.getMinutes();

        // Find available technicians with required skills
        const availableTechs = await Technician.aggregate([
            // Match active, online technicians
            {
                $match: {
                    status: 'active',
                    isOnline: true,
                    $or: [
                        { 'services': { $in: booking.services.map(s => s.serviceId._id) } },
                        { 'services': { $size: 0 } } // Include techs with no specific services
                    ]
                }
            },
            // Add current workload
            {
                $lookup: {
                    from: 'bookings',
                    let: { techId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$assigned_technician', '$$techId'] },
                                        { $in: ['$status', ['assigned', 'in_progress']] }
                                    ]
                                }
                            }
                        },
                        { $count: 'count' }
                    ],
                    as: 'currentWorkload'
                }
            },
            // Add fields for matching
            {
                $addFields: {
                    currentWorkload: { $arrayElemAt: ['$currentWorkload.count', 0] },
                    // Calculate if currently in working hours
                    isWorkingNow: {
                        $let: {
                            vars: {
                                workingHours: { $ifNull: [`$availability.workingHours.${currentDay}`, { available: false }] }
                            },
                            in: {
                                $and: [
                                    { $eq: ['$$workingHours.available', true] },
                                    {
                                        $ifNull: [
                                            {
                                                $and: [
                                                    { $gte: [currentTime, { $toInt: { $substr: ['$$workingHours.start', 0, 2] } }] },
                                                    { $lte: [currentTime, { $toInt: { $substr: ['$$workingHours.end', 0, 2] } }] }
                                                ]
                                            },
                                            false
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    // Calculate skill match score
                    skillMatchScore: {
                        $size: {
                            $setIntersection: [
                                '$services',
                                booking.services.map(s => s.serviceId._id.toString())
                            ]
                        }
                    }
                }
            },
            // Filter by availability and workload
            {
                $match: {
                    $expr: {
                        $and: [
                            { $lt: [{ $ifNull: ['$currentWorkload', 0] }, '$maxWorkload'] },
                            { $eq: ['$isWorkingNow', true] }
                        ]
                    }
                }
            },
            // Calculate proximity score if booking has location
            ...(booking.user?.location?.coordinates ? [
                {
                    $geoNear: {
                        near: {
                            type: 'Point',
                            coordinates: booking.user.location.coordinates
                        },
                        distanceField: 'distance',
                        spherical: true,
                        maxDistance: 10000, // 10km radius
                        query: {}
                    }
                }
            ] : []),
            // Sort by best match
            {
                $sort: {
                    skillMatchScore: -1,
                    distance: 1,
                    currentWorkload: 1,
                    averageRating: -1
                }
            },
            // Limit results
            { $limit: 5 }
        ]);

        if (availableTechs.length === 0) {
            throw new ApiError(404, 'No available technicians matching the criteria');
        }

        // Get the best match
        technician = availableTechs[0];
    }

    // Update the booking
    booking.assigned_technician = technician._id;
    booking.status = 'assigned';

    // Add to status history
    booking.statusHistory.push({
        status: 'assigned',
        changedAt: new Date(),
        changedBy: userId,
        note: `Technician ${technician.name.first} ${technician.name.last} assigned`,
        metadata: {
            assignmentType: technicianId ? 'manual' : 'auto',
            assignedBy: userId,
            assignedAt: new Date(),
            distance: technician.distance ? `${(technician.distance / 1000).toFixed(2)} km` : null
        }
    });

    await booking.save();

    // Update technician's status if needed
    await Technician.findByIdAndUpdate(technician._id, {
        $set: { 'availability.status': 'busy' },
        $push: {
            'notes': {
                note: `Assigned to booking #${booking.bookingId || booking._id}`,
                createdBy: userId,
                isInternal: true
            }
        }
    });

    // Populate the response
    const updatedBooking = await Booking.findById(booking._id)
        .populate({
            path: 'assigned_technician',
            select: 'name email phone',
            transform: (doc) => ({
                _id: doc._id,
                name: `${doc.name.first} ${doc.name.last}`,
                email: doc.email,
                phone: doc.phone,
                rating: doc.averageRating,
                jobsCompleted: doc.totalJobsCompleted
            })
        })
        .populate('services.serviceId', 'name description price');

    // TODO: Send notification to technician about new assignment
    // await sendNotification(technician._id, {
    //     title: 'New Assignment',
    //     body: `You've been assigned to a new booking #${booking.bookingId || booking._id}`,
    //     data: { bookingId: booking._id.toString() }
    // });

    return res.status(200).json(
        new ApiResponse(200, updatedBooking, 'Technician assigned successfully')
    );
});

// Mark a booking as completed by technician
const markBookingCompleted = asyncHandler(async (req, res) => {
    const { id: bookingId } = req.params;
    const { _id: userId } = req.user;
    const { notes, feedback, rating } = req.body;

    // Find the booking
    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: userId,
        status: { $in: ['assigned', 'in_progress'] }
    }).populate('services.serviceId', 'name price');

    if (!booking) {
        throw new ApiError(404, 'Booking not found or you are not authorized to complete this booking');
    }

    // Update booking status
    booking.status = 'completed';
    booking.completedAt = new Date();
    
    // Calculate total service hours
    const serviceHours = booking.services.reduce((total, service) => {
        return total + (service.duration || 1); // Default to 1 hour if duration not set
    }, 0);

    // Add to status history
    booking.statusHistory.push({
        status: 'completed',
        changedAt: new Date(),
        changedBy: userId,
        note: 'Service completed by technician',
        metadata: {
            notes,
            feedback,
            rating,
            serviceHours
        }
    });

    // Save the booking
    await booking.save();

    // Update technician's stats
    const updateData = {
        $inc: { 
            totalJobsCompleted: 1,
            totalServiceHours: serviceHours
        },
        $set: { 'availability.status': 'available' },
        $push: {
            'notes': {
                note: `Marked booking #${booking.bookingId || booking._id} as completed`,
                createdBy: userId,
                isInternal: true
            }
        }
    };

    // Update technician's average rating if rating is provided
    if (rating >= 1 && rating <= 5) {
        // Get all ratings for this technician
        const ratings = await Booking.aggregate([
            {
                $match: {
                    assigned_technician: new mongoose.Types.ObjectId(userId),
                    'statusHistory.status': 'completed',
                    'statusHistory.metadata.rating': { $exists: true, $gte: 1, $lte: 5 }
                }
            },
            {
                $unwind: '$statusHistory'
            },
            {
                $match: {
                    'statusHistory.status': 'completed',
                    'statusHistory.metadata.rating': { $exists: true, $gte: 1, $lte: 5 }
                }
            },
            {
                $group: {
                    _id: '$assigned_technician',
                    averageRating: { $avg: '$statusHistory.metadata.rating' },
                    totalRatings: { $sum: 1 }
                }
            }
        ]);
        
        if (ratings.length > 0) {
            const { averageRating, totalRatings } = ratings[0];
            updateData.$set.averageRating = parseFloat(averageRating.toFixed(1));
            updateData.$set.totalRatings = totalRatings;
        }
    }

    // Update technician
    await User.findByIdAndUpdate(userId, updateData);

    // Get the updated booking with populated fields
    const updatedBooking = await Booking.findById(booking._id)
        .populate('assigned_technician', 'name email phone')
        .populate('services.serviceId', 'name description price');

    // TODO: Send notification to user about completion
    // await sendNotification(booking.user, {
    //     title: 'Service Completed',
    //     body: `Your service #${booking.bookingId || booking._id} has been marked as completed.`,
    //     data: { bookingId: booking._id.toString() }
    // });

    return res.status(200).json(
        new ApiResponse(200, updatedBooking, 'Booking marked as completed successfully')
    );
});

// Reschedule a booking
const rescheduleBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { scheduleDate, preferredTimeSlot, reason } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!scheduleDate || !preferredTimeSlot) {
        throw new ApiError(400, 'New schedule date and time slot are required');
    }

    // Find the booking
    const booking = await Booking.findById(id);
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    // Check if user is authorized (either the booking owner or admin/manager)
    if (booking.user.toString() !== userId.toString() && req.user.role !== 'admin' && req.user.role !== 'manager') {
        throw new ApiError(403, 'Not authorized to reschedule this booking');
    }

    // Check if booking can be rescheduled (only allow rescheduling for certain statuses)
    const allowedStatuses = ['pending', 'confirmed', 'assigned'];
    if (!allowedStatuses.includes(booking.status)) {
        throw new ApiError(400, `Cannot reschedule booking with status: ${booking.status}`);
    }

    // Store old values for history
    const oldScheduleDate = booking.scheduleDate;
    const oldTimeSlot = booking.preferredTimeSlot;

    // Update booking with new schedule
    booking.scheduleDate = scheduleDate;
    booking.preferredTimeSlot = preferredTimeSlot;
    
    // Add to status history
    booking.statusHistory.push({
        status: booking.status,
        changedAt: new Date(),
        changedBy: userId,
        changes: {
            field: 'reschedule',
            from: { scheduleDate: oldScheduleDate, preferredTimeSlot: oldTimeSlot },
            to: { scheduleDate, preferredTimeSlot },
            reason: reason || 'No reason provided'
        }
    });

    // If technician was assigned, reset the assignment
    if (booking.assigned_technician) {
        booking.assigned_technician = undefined;
        booking.status = 'confirmed'; // Change status to confirmed when rescheduling
        booking.statusHistory.push({
            status: 'confirmed',
            changedAt: new Date(),
            changedBy: userId,
            message: 'Technician unassigned due to rescheduling'
        });
    }

    await booking.save();

    // Populate the updated booking with user and service details
    const updatedBooking = await Booking.findById(booking._id)
        .populate('user', 'name email phone')
        .populate('services.serviceId', 'name description price');

    // TODO: Send notification to admin/manager about reschedule
    // TODO: If technician was assigned, notify them about the change
    
    return res.status(200).json(
        new ApiResponse(200, updatedBooking, 'Booking rescheduled successfully')
    );
});

// Upload selfie by technician after reaching destination
const uploadSelfie = asyncHandler(async (req, res) => {
    const { id: bookingId } = req.params;
    const technicianId = req.user._id;
    const selfieFile = req.file; // This comes from multer middleware

    if (!selfieFile) {
        throw new ApiError(400, 'Selfie image is required');
    }

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
        // Remove the temporary file if booking not found
        if (selfieFile.path) {
            fs.unlinkSync(selfieFile.path);
        }
        throw new ApiError(404, 'Booking not found');
    }

    // Check if the current user is the assigned technician
    if (booking.assigned_technician?.toString() !== technicianId.toString()) {
        // Remove the temporary file if not authorized
        if (selfieFile.path) {
            fs.unlinkSync(selfieFile.path);
        }
        throw new ApiError(403, 'Only the assigned technician can upload selfie');
    }

    // Check if booking is in a valid state for selfie upload
    const allowedStatuses = ['assigned', 'in_progress'];
    if (!allowedStatuses.includes(booking.status)) {
        // Remove the temporary file if status is invalid
        if (selfieFile.path) {
            fs.unlinkSync(selfieFile.path);
        }
        throw new ApiError(400, `Cannot upload selfie for booking with status: ${booking.status}`);
    }

    try {
        // Upload selfie to Cloudinary
        const cloudinaryResponse = await uploadOnCloudinary(selfieFile.path, 'technician_selfies');

        // Update booking with selfie information
        booking.technicianSelfie = {
            public_id: cloudinaryResponse.public_id,
            url: cloudinaryResponse.secure_url,
            uploadedAt: new Date()
        };

        // Update status to 'in_progress' if it was 'assigned'
        if (booking.status === 'assigned') {
            booking.status = 'in_progress';
            booking.statusHistory.push({
                status: 'in_progress',
                changedAt: new Date(),
                changedBy: technicianId,
                note: 'Technician reached location and uploaded selfie'
            });
        } else {
            // If there was a previous selfie, delete it from Cloudinary
            if (booking.technicianSelfie?.public_id) {
                try {
                    await deleteFromCloudinary(booking.technicianSelfie.public_id);
                } catch (error) {
                    console.error('Error deleting old selfie from Cloudinary:', error);
                    // Continue even if deletion of old selfie fails
                }
            }
            
            booking.statusHistory.push({
                status: 'in_progress',
                changedAt: new Date(),
                changedBy: technicianId,
                note: 'Technician updated selfie'
            });
        }

        await booking.save();

        // Populate the updated booking with user and service details
        const updatedBooking = await Booking.findById(booking._id)
            .populate('user', 'name email phone')
            .populate('services.serviceId', 'name description price')
            .populate('assigned_technician', 'name phone');

        // TODO: Send notification to admin/customer about technician arrival
        // await sendNotification(booking.user, {
        //     title: 'Technician Reached Location',
        //     message: `Your technician has arrived at the service location.`
        // });

        return res.status(200).json(
            new ApiResponse(200, updatedBooking, 'Selfie uploaded successfully')
        );
    } catch (error) {
        // Clean up the temporary file in case of any error
        if (selfieFile.path) {
            fs.unlinkSync(selfieFile.path);
        }
        throw new ApiError(500, 'Failed to upload selfie. Please try again.');
    }
});

// upload product before image
const uploadBeforeImage = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { image } = req.body;
    const userId = req.user._id;

    // Find booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    // Check permission
    if (!isAdminOrManager(User, userId)) {
        throw new ApiError(403, 'Not authorized to update this booking');
    }

    // Update booking with product before image
    booking.productBeforeImage = image;
    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, booking, 'Product before image uploaded successfully')
    );
});

// upload product after image
const uploadAfterImage = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { image } = req.body;
    const userId = req.user._id;

    // Find booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    // Check permission
    if (!isAdminOrManager(User, userId)) {
        throw new ApiError(403, 'Not authorized to update this booking');
    }

    // Update booking with product after image
    booking.productAfterImage = image;
    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, booking, 'Product after image uploaded successfully')
    );
});

// Bulk booking 

// Create multiple bookings together as a bulk booking
const createBulkBooking = asyncHandler(async (req, res) => {
    const { clientId, location, bookings, scheduledDate, preferredTimeSlot, notes } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!clientId || !location || !bookings || !Array.isArray(bookings) || bookings.length === 0) {
        throw new ApiError(400, 'Client ID, location, and at least one booking are required');
    }

    // Validate location structure
    if (!location.coordinates || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
        throw new ApiError(400, 'Location must include valid coordinates [longitude, latitude]');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Create individual bookings
        const createdBookings = [];
        const serviceTypes = new Set();
        const errors = [];
        const now = Date.now();

        for (const [index, bookingData] of bookings.entries()) {
            try {
                // Track service types for bulk booking
                if (bookingData.services && Array.isArray(bookingData.services)) {
                    bookingData.services.forEach(service => {
                        if (service.serviceId) {
                            serviceTypes.add(service.serviceId.toString());
                        }
                    });
                }

                const booking = new Booking({
                    ...bookingData,
                    bookingId: `BK${now.toString().slice(-8)}-${index}`,
                    user: clientId,
                    address: location.address,
                    location: {
                        type: 'Point',
                        coordinates: [
                            parseFloat(location.coordinates[0]),
                            parseFloat(location.coordinates[1])
                        ]
                    },
                    scheduledDate,
                    preferredTimeSlot,
                    notes,
                    status: 'pending',
                    statusHistory: [{
                        status: 'pending',
                        changedAt: new Date(),
                        changedBy: userId,
                        note: 'Created as part of bulk booking'
                    }],
                    createdBy: userId
                });

                await booking.save({ session });
                createdBookings.push(booking._id);
            } catch (error) {
                errors.push({
                    index,
                    error: error.message
                });
            }
        }

        if (createdBookings.length === 0) {
            throw new ApiError(400, 'Failed to create any bookings', { errors });
        }

        // Create the bulk booking record
        const bulkBooking = new BulkBooking({
            client: clientId,
            location: {
                type: 'Point',
                coordinates: [
                    parseFloat(location.coordinates[0]),
                    parseFloat(location.coordinates[1])
                ],
                address: location.address,
                formattedAddress: location.formattedAddress || ''
            },
            bookings: createdBookings,
            bookingCount: createdBookings.length,
            serviceTypes: Array.from(serviceTypes),
            scheduledDate,
            preferredTimeSlot,
            notes,
            createdBy: userId,
            status: 'pending',
            statusHistory: [{
                status: 'pending',
                changedAt: new Date(),
                changedBy: userId,
                note: 'Bulk booking created'
            }]
        });

        await bulkBooking.save({ session });
        await session.commitTransaction();

        // Populate the response with booking details
        const populatedBulkBooking = await BulkBooking.findById(bulkBooking._id)
            .populate('client', 'name email phone')
            .populate('bookings', 'bookingId status services')
            .populate('createdBy', 'name email')
            .session(session);

        // TODO: Notify general manager about the new bulk booking
        // await notifyGeneralManagerAboutBulkBooking(populatedBulkBooking);

        return res.status(201).json(
            new ApiResponse(
                201, 
                {
                    bulkBooking: populatedBulkBooking,
                    errors: errors.length > 0 ? errors : undefined
                },
                `Bulk booking created successfully with ${createdBookings.length} booking(s)`
            )
        );
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// booking feedback

// Submit feedback and rating for a completed booking
const submitBookingFeedback = asyncHandler(async (req, res) => {
    const { id: bookingId } = req.params;
    const { rating, review } = req.body;
    const userId = req.user._id;

    // Input validation
    if (!rating || rating < 1 || rating > 5) {
        throw new ApiError(400, 'Please provide a valid rating between 1 and 5');
    }

    // Find the booking
    const booking = await Booking.findOne({
        _id: bookingId,
        user: userId,
        status: 'completed'
    });

    if (!booking) {
        throw new ApiError(404, 'Booking not found or not eligible for feedback');
    }

    // Check if feedback already exists
    if (booking.rating) {
        throw new ApiError(400, 'Feedback already submitted for this booking');
    }

    // Update booking with feedback
    booking.rating = rating;
    booking.review = review;
    booking.reviewDate = new Date();

    await booking.save();

    // TODO: Calculate and update technician's average rating
    // This would require aggregating all ratings for bookings assigned to this technician

    return res.status(200).json(
        new ApiResponse(200, {
            rating: booking.rating,
            review: booking.review,
            reviewDate: booking.reviewDate
        }, 'Thank you for your feedback!')
    );
});

// Get feedback for a specific booking
const getBookingFeedback = asyncHandler(async (req, res) => {
    const { id: bookingId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Find the booking
    const booking = await Booking.findById(bookingId)
        .select('user assigned_technician rating review reviewDate status')
        .populate('user', 'name email')
        .populate('assigned_technician', 'name email');

    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    // Check permissions
    const isOwner = booking.user._id.toString() === userId.toString();
    const isAssignedTechnician = booking.assigned_technician && 
                               booking.assigned_technician._id.toString() === userId.toString();
    const isAdminOrManager = ['admin', 'manager'].includes(userRole);

    if (!isOwner && !isAssignedTechnician && !isAdminOrManager) {
        throw new ApiError(403, 'Not authorized to view this feedback');
    }

    // Only include feedback if it exists
    if (!booking.rating) {
        return res.status(200).json(
            new ApiResponse(200, { hasFeedback: false }, 'No feedback available for this booking')
        );
    }

    const feedback = {
        bookingId: booking._id,
        rating: booking.rating,
        review: booking.review,
        reviewDate: booking.reviewDate,
        user: {
            id: booking.user._id,
            name: booking.user.name
        },
        technician: booking.assigned_technician ? {
            id: booking.assigned_technician._id,
            name: booking.assigned_technician.name
        } : null
    };

    return res.status(200).json(
        new ApiResponse(200, { ...feedback, hasFeedback: true }, 'Feedback retrieved successfully')
    );
});

// Mark technician as reached
const markTechnicianReached = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const technicianId = req.user._id;

    // Verify if the booking exists and is assigned to the technician
    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: technicianId,
        status: { $in: ['assigned'] }
    });

    if (!booking) {
        throw new ApiError(404, 'Booking not found or not assigned to you');
    }

    // Update booking status to 'reached'
    booking.status = 'reached';
    booking.statusHistory.push({
        status: 'reached',
        changedAt: new Date(),
        changedBy: technicianId,
        note: 'Technician has reached the location'
    });
    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, {
            bookingId: booking._id,
            status: booking.status,
            canGenerateOtp: true
        }, 'Location reached successfully. You can now generate OTP.')
    );
});

// Generate and send OTP for booking verification
const generateBookingOtp = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const technicianId = req.user._id;

    // Verify if the booking exists, is assigned to the technician, and status is 'reached'
    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: technicianId,
        status: 'reached'
    });

    if (!booking) {
        throw new ApiError(400, 'Please mark yourself as reached before generating OTP');
    }

    // Invalidate any existing OTPs for this booking
    await OTP.updateMany(
        { booking: bookingId, technician: technicianId, isUsed: false },
        { $set: { isUsed: true } }
    );

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); // OTP expires in 5 minutes

    // Save OTP to database
    const otpRecord = await OTP.create({
        booking: bookingId,
        technician: technicianId,
        otp,
        expiresAt
    });

    // In a real application, you would send this OTP to the user's mobile/email
    // For now, we'll return it in the response (in production, only log it on the server)
    console.log(`OTP for booking ${bookingId}: ${otp}`);

    // Update booking status to 'otp_pending'
    booking.status = 'otp_pending';
    booking.statusHistory.push({
        status: 'otp_pending',
        changedAt: new Date(),
        changedBy: technicianId,
        note: 'OTP generated and waiting for user verification'
    });
    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, {
            message: 'OTP generated successfully',
            otpId: otpRecord._id,
            expiresAt: otpRecord.expiresAt,
            // In production, don't send OTP in response
            // This is just for development/testing
            otp: process.env.NODE_ENV === 'development' ? otp : undefined
        }, 'OTP has been generated and sent to the user')
    );
});

// Verify OTP for booking
const verifyBookingOtp = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const { otp } = req.body;
    const technicianId = req.user._id;

    // Find the most recent valid OTP
    const otpRecord = await OTP.findOne({
        booking: bookingId,
        technician: technicianId,
        isUsed: false,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: 3 }
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
        throw new ApiError(400, 'No valid OTP found or OTP has expired');
    }

    // Increment attempt counter
    otpRecord.attempts += 1;
    
    if (otpRecord.otp !== otp) {
        await otpRecord.save();
        const remainingAttempts = 3 - otpRecord.attempts;
        
        if (remainingAttempts <= 0) {
            throw new ApiError(400, 'Maximum attempts reached. Please generate a new OTP.');
        }
        
        throw new ApiError(400, `Invalid OTP. ${remainingAttempts} attempts remaining.`);
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    // Verify the booking is in 'otp_pending' status
    const booking = await Booking.findOne({
        _id: bookingId,
        status: 'otp_pending',
        assigned_technician: technicianId
    });

    if (!booking) {
        throw new ApiError(400, 'Invalid OTP verification request');
    }

    // Update booking status to 'in_progress'
    booking.status = 'in_progress';
    booking.statusHistory.push({
        status: 'in_progress',
        changedAt: new Date(),
        changedBy: technicianId,
        note: 'OTP verified, service in progress'
    });
    await booking.save();

    return res.status(200).json(
        new ApiResponse(200, {
            bookingId: booking._id,
            status: booking.status,
            verifiedAt: new Date()
        }, 'OTP verified successfully')
    );
});

// booking analytics

// Get bookings filtered by region (admin/manager only)
const getBookingsByRegion = asyncHandler(async (req, res) => {
    const { region, startDate, endDate, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    
    // Filter by region (city/state)
    if (region) {
        query['$or'] = [
            { 'address.city': { $regex: region, $options: 'i' } },
            { 'address.state': { $regex: region, $options: 'i' } }
        ];
    }

    // Filter by date range
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // End of the day
            query.createdAt.$lte = end;
        }
    }

    const [bookings, total] = await Promise.all([
        Booking.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('user', 'name email phone')
            .populate('assigned_technician', 'name email phone')
            .lean(),
        Booking.countDocuments(query)
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            bookings,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        }, 'Bookings retrieved successfully')
    );
});

// Get bookings filtered by status (admin/manager only)
const getBookingsByStatus = asyncHandler(async (req, res) => {
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'rejected'];
    if (status && !validStatuses.includes(status)) {
        throw new ApiError(400, 'Invalid status value');
    }

    // Build query
    const query = {};
    if (status) query.status = status;

    // Filter by date range
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    const [bookings, total] = await Promise.all([
        Booking.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('user', 'name email')
            .populate('assigned_technician', 'name')
            .select('bookingId status scheduleDate preferredTimeSlot totalAmount')
            .lean(),
        Booking.countDocuments(query)
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            bookings,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        }, 'Bookings retrieved successfully')
    );
});

// Get booking analytics (admin/manager only)
const getBookingAnalytics = asyncHandler(async (req, res) => {
    const { timeframe = 'week', startDate, endDate } = req.query;
    
    // Validate timeframe
    const validTimeframes = ['day', 'week', 'month', 'year'];
    if (!validTimeframes.includes(timeframe)) {
        throw new ApiError(400, 'Invalid timeframe. Must be one of: day, week, month, year');
    }

    // Calculate date range
    const now = new Date();
    let start, end = now;
    
    if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
    } else {
        // Default to last 30 days if no date range provided
        start = new Date();
        start.setDate(now.getDate() - 30);
    }

    // Group by date and status
    const analytics = await Booking.aggregate([
        {
            $match: {
                createdAt: { $gte: start, $lte: end }
            }
        },
        {
            $project: {
                date: {
                    $dateToString: {
                        format: {
                            day: '%Y-%m-%d',
                            timezone: 'Asia/Kolkata'
                        },
                        date: '$createdAt'
                    }
                },
                status: 1,
                totalAmount: 1
            }
        },
        {
            $group: {
                _id: {
                    date: '$date',
                    status: '$status'
                },
                count: { $sum: 1 },
                totalRevenue: { $sum: '$totalAmount' }
            }
        },
        {
            $group: {
                _id: '$_id.date',
                date: { $first: '$_id.date' },
                statuses: {
                    $push: {
                        status: '$_id.status',
                        count: '$count'
                    }
                },
                totalBookings: { $sum: '$count' },
                totalRevenue: { $sum: '$totalRevenue' }
            }
        },
        { $sort: { date: 1 } }
    ]);

    // Get status summary
    const statusSummary = await Booking.aggregate([
        {
            $match: {
                createdAt: { $gte: start, $lte: end }
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                status: '$_id',
                count: 1
            }
        }
    ]);

    // Calculate totals
    const totals = {
        totalBookings: statusSummary.reduce((sum, item) => sum + item.count, 0),
        totalRevenue: analytics.reduce((sum, item) => sum + (item.totalRevenue || 0), 0),
        statusSummary: statusSummary.reduce((acc, item) => {
            acc[item.status] = item.count;
            return acc;
        }, {})
    };

    return res.status(200).json(
        new ApiResponse(200, {
            timeframe: {
                start,
                end,
                type: timeframe
            },
            analytics,
            ...totals
        }, 'Analytics retrieved successfully')
    );
});

export {
    createBooking,
    getAllBookings,
    getBookingById,
    updateBookingById,
    deleteBookingById,
    getUserBookings,
    updateBookingStatus,
    cancelBooking,
    assignTechnicianToBooking,
    markBookingCompleted,
    rescheduleBooking,
    createBulkBooking,
    getBookingsByRegion,
    getBookingsByStatus,
    getBookingAnalytics,
    uploadSelfie,
    uploadBeforeImage,
    uploadAfterImage,
    submitBookingFeedback,
    getBookingFeedback,
    markTechnicianReached,
    generateBookingOtp,
    verifyBookingOtp,
};
