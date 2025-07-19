import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiErrors.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { User } from '../models/User.model.js';
import { Technician } from '../models/Technician.model.js';
import { Booking } from '../models/Booking.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import mongoose from 'mongoose';
import { cleanupTempFile } from '../utils/CleanupFile.js';

// Register a new technician (Admin/Partner only)
const registerTechnician = asyncHandler(async (req, res) => {
    let avatarLocalPath;
    try {
        const {
            email, phone, password,
            dateOfBirth, gender,
            services, skills, experience, bio
        } = req.body;

        // Construct name object from form-data
        const name = {
            first: req.body['name.first'],
            last: req.body['name.last'] || ''
        };

        const bankDetails = {
            accountHolderName: req.body['accountHolderName'] || 'Not provided',
            bankName: req.body['bankName'] || 'Not provided',
            ifscCode: req.body['ifscCode'] || 'Not provided',
            accountNumber: req.body['accountNumber'] || 'Not provided',
            branch: req.body['branch'] || 'Not provided',
        }

        // Emergency Contact
        const emergencyContact = {
            name: req.body['emergencyContact.name'],
            relationship: req.body['emergencyContact.relationship'],
            phone: req.body['emergencyContact.phone']
        };

        if (!email || !phone || !password || !name.first || !dateOfBirth || !gender || !experience || !skills) {
            throw new ApiError(400, 'All required fields must be provided');
        }

        if (!emergencyContact.name || !emergencyContact.relationship || !emergencyContact.phone) {
            throw new ApiError(400, 'Complete emergency contact information is required');
        }

        // Location
        let latitude, longitude;
        if (
            req.body['addresses.location.coordinates.latitude'] !== undefined &&
            req.body['addresses.location.coordinates.longitude'] !== undefined
        ) {
            latitude = parseFloat(req.body['addresses.location.coordinates.latitude']);
            longitude = parseFloat(req.body['addresses.location.coordinates.longitude']);
            if (isNaN(latitude) || isNaN(longitude)) {
                throw new ApiError(400, 'Latitude and Longitude must be valid numbers');
            }
        }

        const defaultAddress = {
            addressLine1: req.body['addresses.addressLine1'] || 'Not provided',
            city: req.body['addresses.city'] || 'Not provided',
            state: req.body['addresses.state'] || 'Not provided',
            pincode: req.body['addresses.pincode'] || '000000',
            country: req.body['addresses.country'] || 'India',
            isDefault: true,
            location: {
                coordinates: {
                    longitude,
                    latitude
                }
            },
            tag: 'home'
        };

        // Handle avatar
        if (!req.files?.avatar?.[0]) throw new ApiError(400, 'Avatar is required');
        avatarLocalPath = req.files.avatar[0].path;

        const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (existingUser) {
            cleanupTempFile(avatarLocalPath);
            throw new ApiError(409, 'User with email or phone already exists');
        }

        const avatar = await uploadOnCloudinary(avatarLocalPath);
        if (!avatar) throw new ApiError(400, 'Avatar upload failed');

        // Process uploaded documents
        const documents = [];
        if (req.files?.idProof?.[0]) {
            const idProof = await uploadOnCloudinary(req.files.idProof[0].path);
            documents.push({ type: 'id_proof', url: idProof.url, publicId: idProof.public_id });
        }
        if (req.files?.addressProof?.[0]) {
            const addressProof = await uploadOnCloudinary(req.files.addressProof[0].path);
            documents.push({ type: 'address_proof', url: addressProof.url, publicId: addressProof.public_id });
        }
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

        // Ensure services is an array of strings
        let serviceList = [];
        if (typeof services === 'string') {
            serviceList = services.split(',').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(services)) {
            serviceList = services.map(s => String(s).trim()).filter(Boolean);
        }

        if (serviceList.length === 0) {
            throw new ApiError(400, 'At least one service is required');
        }

        // Format bank details
        const formattedBankDetails = {
            ...bankDetails,
            ifscCode: bankDetails.ifscCode?.toUpperCase()
        };

        // Format document types
        const formattedDocuments = documents.map(doc => ({
            ...doc,
            type: doc.type === 'certificate' ? 'certification' : doc.type
        }));

        const technician = await Technician.create({
            name,
            email,
            phone,
            password,
            avatar: avatar.url,
            addresses: [defaultAddress],
            role: 'Technician', // Must match enum in User model (capital T)
            dateOfBirth,
            gender,
            emergencyContact,
            services: serviceList,
            skills: Array.isArray(skills) ? skills : [skills],
            experience,
            bio,
            bankDetails: formattedBankDetails,
            documents: formattedDocuments,
            status: 'pending_verification'
        });

        const createdTechnician = await Technician.findById(technician._id).select("-password -refreshToken");

        // Clean up all uploaded files
        const cleanupFiles = [];
        if (avatarLocalPath) cleanupFiles.push(avatarLocalPath);
        if (req.files?.idProof?.[0]?.path) cleanupFiles.push(req.files.idProof[0].path);
        if (req.files?.addressProof?.[0]?.path) cleanupFiles.push(req.files.addressProof[0].path);
        if (req.files?.certificates?.length) {
            req.files.certificates.forEach(cert => {
                if (cert?.path) cleanupFiles.push(cert.path);
            });
        }
        cleanupFiles.forEach(filePath => cleanupTempFile(filePath));

        if (!createdTechnician) throw new ApiError(500, 'Technician registration failed');

        return res.status(201).json(new ApiResponse(201, createdTechnician, 'Technician registered successfully'));

    } catch (error) {
        // Clean up any uploaded files in case of error
        const cleanupFiles = [];
        if (avatarLocalPath) cleanupFiles.push(avatarLocalPath);
        if (req.files?.idProof?.[0]?.path) cleanupFiles.push(req.files.idProof[0].path);
        if (req.files?.addressProof?.[0]?.path) cleanupFiles.push(req.files.addressProof[0].path);
        if (req.files?.certificates?.length) {
            req.files.certificates.forEach(cert => {
                if (cert?.path) cleanupFiles.push(cert.path);
            });
        }
        cleanupFiles.forEach(filePath => cleanupTempFile(filePath));

        throw error;
    }
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

// Update Technician Profile
const updateTechnicianProfile = asyncHandler(async (req, res) => {

    const {
        dateOfBirth,
        gender,
        skills,
        experience,
        bio,
        serviceAreas,
        services,
        'name.first': firstName,
        'name.last': lastName,
        'emergencyContact.name': emergencyContactName,
        'emergencyContact.relationship': emergencyContactRelationship,
        'emergencyContact.phone': emergencyContactPhone,
        'bankDetails.accountHolderName': accountHolderName,
        'bankDetails.accountNumber': accountNumber,
        'bankDetails.ifscCode': ifscCode,
        'bankDetails.bankName': bankName,
        'bankDetails.branch': branch,
        'availability.isOnBreak': isOnBreak,
        'availability.breakStart': breakStart,
        'availability.breakEnd': breakEnd
    } = req.body;

    const updateFields = {};

    // Personal & Contact Info
    if (firstName !== undefined || lastName !== undefined) {
        updateFields.name = {
            first: firstName || req.user.name.first,
            last: lastName || req.user.name.last || ''
        };
    }

    if (dateOfBirth) updateFields.dateOfBirth = dateOfBirth;
    if (gender) updateFields.gender = gender;

    if (emergencyContactName || emergencyContactRelationship || emergencyContactPhone) {
        updateFields.emergencyContact = {
            name: emergencyContactName || req.user.emergencyContact?.name || '',
            relationship: emergencyContactRelationship || req.user.emergencyContact?.relationship || '',
            phone: emergencyContactPhone || req.user.emergencyContact?.phone || ''
        };
    }

    // Professional Info
    if (services) updateFields.services = Array.isArray(services) ? services : services.split(',').map(s => s.trim());
    if (skills) updateFields.skills = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
    if (experience) updateFields.experience = experience;
    if (bio) updateFields.bio = bio;
    if (serviceAreas) updateFields.serviceAreas = Array.isArray(serviceAreas) ? serviceAreas : serviceAreas.split(',').map(s => s.trim());

    // Handle working hours
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const workingHours = {};

    days.forEach(day => {
        const dayData = {
            start: req.body[`availability.workingHours.${day}.start`],
            end: req.body[`availability.workingHours.${day}.end`],
            available: req.body[`availability.workingHours.${day}.available`]
        };

        // Only add day if any field is provided
        if (dayData.start || dayData.end || dayData.available !== undefined) {
            workingHours[day] = {
                start: dayData.start || req.user.availability?.workingHours?.[day]?.start || null,
                end: dayData.end || req.user.availability?.workingHours?.[day]?.end || null,
                available: dayData.available !== undefined
                    ? dayData.available
                    : (req.user.availability?.workingHours?.[day]?.available ?? false)
            };
        }
    });

    // Update availability
    if (Object.keys(workingHours).length > 0) {
        updateFields['availability.workingHours'] = workingHours;
    }

    if (isOnBreak !== undefined) updateFields['availability.isOnBreak'] = isOnBreak;
    if (breakStart !== undefined) updateFields['availability.breakStart'] = breakStart;
    if (breakEnd !== undefined) updateFields['availability.breakEnd'] = breakEnd;

    // Bank Details
    if (accountHolderName || accountNumber || ifscCode || bankName || branch) {
        updateFields.bankDetails = {
            accountHolderName: accountHolderName || req.user.bankDetails?.accountHolderName || '',
            accountNumber: accountNumber || req.user.bankDetails?.accountNumber || '',
            ifscCode: ifscCode || req.user.bankDetails?.ifscCode || '',
            bankName: bankName || req.user.bankDetails?.bankName || '',
            branch: branch || req.user.bankDetails?.branch || ''
        };
    }

    // Handle file uploads
    const handleFileUpload = async (file) => {
        if (!file) return null;
        const url = await uploadOnCloudinary(file);
        return url || null;
    };

    // Handle avatar upload if present
    if (req.file) {
        const avatarUrl = await handleFileUpload(req.file.avatar);
        if (avatarUrl) {
            updateFields.avatar = avatarUrl;
        }
    }

    // Handle document uploads
    if (req.files) {
        const documents = {};

        // ID Proof
        if (req.files.idProof) {
            const idProofUrl = await handleFileUpload(req.files.idProof[0]);
            if (idProofUrl) {
                documents.idProof = {
                    url: idProofUrl,
                    uploadedAt: new Date(),
                    status: 'pending' // or 'verified' based on your workflow
                };
            }
        }

        // Address Proof
        if (req.files.addressProof) {
            const addressProofUrl = await handleFileUpload(req.files.addressProof[0]);
            if (addressProofUrl) {
                documents.addressProof = {
                    url: addressProofUrl,
                    uploadedAt: new Date(),
                    status: 'pending'
                };
            }
        }

        // Certificates (multiple files)
        if (req.files.certificates && req.files.certificates.length > 0) {
            const certificateUrls = await Promise.all(
                req.files.certificates.map(file => handleFileUpload(file))
            );

            updateFields.certificates = [
                ...(req.user.certificates || []), // Keep existing certificates
                ...certificateUrls
                    .filter(url => url) // Filter out any failed uploads
                    .map(url => ({
                        url,
                        uploadedAt: new Date(),
                        status: 'pending',
                        name: 'Certificate', // You might want to make this configurable
                        type: 'certificate'
                    }))
            ];
        }

        // Add documents to update fields if any were processed
        if (Object.keys(documents).length > 0) {
            updateFields.documents = {
                ...req.user.documents, // Keep existing documents
                ...documents
            };
        }
    }

    // Update the technician profile
    const updatedTechnician = await Technician.findByIdAndUpdate(
        req.user._id,
        { $set: updateFields },
        { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!updatedTechnician) {
        throw new ApiError(404, 'Technician not found');
    }

    return res.status(200).json(
        new ApiResponse(200, updatedTechnician, 'Technician profile updated successfully')
    );
});


// Update technician availability
const updateTechnicianAvailability = asyncHandler(async (req, res) => {
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    const technicianId = req.user._id;

    // Find the technician
    const technician = await Technician.findById(technicianId);
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    // Initialize with current availability
    const updateFields = {
        'availability.workingHours': { ...technician.availability?.workingHours || {} }
    };

    // Handle working hours
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    let hasWorkingHoursUpdate = false;

    days.forEach(day => {
        const start = req.body[`availability.workingHours.${day}.start`];
        const end = req.body[`availability.workingHours.${day}.end`];
        const available = req.body[`availability.workingHours.${day}.available`];

        if (start !== undefined || end !== undefined || available !== undefined) {
            if (!updateFields['availability.workingHours'][day]) {
                updateFields['availability.workingHours'][day] = {
                    start: null,
                    end: null,
                    available: false
                };
            }

            if (start !== undefined) updateFields['availability.workingHours'][day].start = start;
            if (end !== undefined) updateFields['availability.workingHours'][day].end = end;
            if (available !== undefined) {
                updateFields['availability.workingHours'][day].available =
                    (available === 'true' || available === true);
            }
            hasWorkingHoursUpdate = true;
        }
    });

    // Only include workingHours in update if there were actual changes
    if (!hasWorkingHoursUpdate) {
        delete updateFields['availability.workingHours'];
    }

    // Update break status
    const isOnBreak = req.body['availability.isOnBreak'];
    const breakStart = req.body['availability.breakStart'];
    const breakEnd = req.body['availability.breakEnd'];

    if (isOnBreak !== undefined) {
        updateFields['availability.isOnBreak'] = isOnBreak === 'true' || isOnBreak === true;
        console.log('Updating break status:', updateFields['availability.isOnBreak']);
    }

    if (breakStart !== undefined) {
        updateFields['availability.breakStart'] = new Date(breakStart);
        console.log('Break start:', breakStart);
    }

    if (breakEnd !== undefined) {
        updateFields['availability.breakEnd'] = new Date(breakEnd);
        console.log('Break end:', breakEnd);
    }

    console.log('Final updateFields:', updateFields);

    // If no updates were provided
    if (Object.keys(updateFields).length === 0) {
        console.error('No valid updates were provided in the request');
        throw new ApiError(400, 'No valid updates provided');
    }

    // Perform update
    const updatedTechnician = await Technician.findByIdAndUpdate(
        technicianId,
        { $set: updateFields },
        { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!updatedTechnician) {
        throw new ApiError(404, 'Technician not found');
    }

    return res.status(200).json(
        new ApiResponse(200, updatedTechnician.availability, 'Availability updated successfully')
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

    const query = { role: 'Technician' }; // Updated to match the role name in the model

    // Apply filters
    if (status) query.status = status;
    if (service) query.services = service; // Changed since services are now strings
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
            { skills: { $in: [new RegExp(search, 'i')] } },
            { services: { $in: [new RegExp(search, 'i')] } }
        ];
    }

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 },
        select: '-password -refreshToken',
        populate: [
            {
                path: 'assignedBookings',
                select: 'status scheduleDate',
                options: { limit: 5 } // Limit the number of populated bookings for performance
            }
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

// Deactivate technician (Admin/Partner only)
const deactivateTechnicianById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if technician exists
    const technician = await Technician.findById(id);
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    // Soft delete by updating status
    technician.status = 'inactive';
    technician.isActive = false;
    await technician.save();

    // Optionally, you might want to revoke tokens or perform cleanup
    const updatedTechnician = await User.findByIdAndUpdate(id, { $set: { refreshToken: null } });

    return res.status(200).json(
        new ApiResponse(200, updatedTechnician , "Technician deactivated successfully")
    );
});

//Delete technician (Admin/ partener only)
const deleteTechnicianById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if technician exists
    const technician = await Technician.findById(id);
    if (!technician) {
        throw new ApiError(404, 'Technician not found');
    }

    
    await User.findByIdAndDelete(id);

    return res.status(200).json(
        new ApiResponse(200, null, "Technician deleted successfully")
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
            { path: 'addresses', select: 'addressLine1 addressLine2 city state postalCode' }
        ]
    };

    const bookings = await Booking.paginate(query, options);

    // Check if no bookings found
    if (bookings.docs.length === 0) {
        return res.status(200).json(
            new ApiResponse(200, {} , `No bookings found for ${technicianId}`)
        );
    }

    return res.status(200).json(
        new ApiResponse(200, bookings, 'Assigned bookings retrieved successfully')
    );
});

// Get details of a specific booking {TO BE CHECKED}
const getBookingDetails = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const technicianId = req.user._id;

    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: technicianId
    })
        .populate('user', 'name phone email')
        .populate('services.serviceId', 'name description price')
        .populate('addresses', 'addressLine1 addressLine2 city state postalCode')
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

    // Find the booking assigned to this technician
    const booking = await Booking.findOne({
        _id: bookingId,
        assigned_technician: technicianId,
        status: 'assigned'
    });

    if (!booking) {
        throw new ApiError(404, 'Booking not found or already processed');
    }

    if (action === 'accept') {
        // If technician accepts, confirm the booking
        booking.status = 'confirmed';
        booking.statusHistory.push({
            status: 'confirmed',
            changedAt: new Date(),
            changedBy: technicianId,
            note: 'Technician accepted the booking'
        });
        
        await booking.save();
    } else {
        // If technician rejects, remove their assignment but keep booking available
        booking.assigned_technician = null;
        booking.status = 'pending'; // Reset status to make it available for other technicians
        
        booking.statusHistory.push({
            status: 'pending',
            changedAt: new Date(),
            changedBy: technicianId,
            note: 'Technician declined the assignment, available for other technicians'
        });
        
        // Add the technician to a declinedBy array to prevent re-assigning to the same technician
        if (!booking.declinedBy) {
            booking.declinedBy = [];
        }
        booking.declinedBy.push({
            technician: technicianId,
            declinedAt: new Date()
        });
        
        await booking.save();
        
        // TODO: Trigger notification to admin/manager about the rejection
        // TODO: Trigger assignment to another available technician if needed
    }

    return res.status(200).json(
        new ApiResponse(200, booking, `Booking ${action === 'accept' ? 'accepted' : 'declined'} successfully`)
    );
});

// Update job status with validation {TO BE CHECKED}
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
        {
            $match: {
                assigned_technician: new mongoose.Types.ObjectId(technicianId),
                status: 'completed',
                rating: { $exists: true, $ne: null }
            }
        },
        {
            $group: {
                _id: null,
                averageRating: { $avg: '$rating' },
                totalRatings: { $sum: 1 },
                fiveStar: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
                fourStar: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                threeStar: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                twoStar: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
            }
        }
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
        {
            $group: {
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
            }
        },
        // Unwind the services array to group by service
        { $unwind: '$jobsByService' },
        { $unwind: '$jobsByService.service' },
        {
            $group: {
                _id: '$jobsByService.service',
                totalJobs: { $sum: 1 },
                totalEarnings: { $sum: '$jobsByService.amount' },
                overallStats: { $first: '$$ROOT' }
            }
        },
        {
            $group: {
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
            }
        },
        {
            $lookup: {
                from: 'services',
                localField: 'services.service',
                foreignField: '_id',
                as: 'serviceDetails'
            }
        },
        {
            $addFields: {
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
            }
        }
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
    const { technicianId, partnerId } = req.params;

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
            { path: 'documents', select: 'type url verified' }
            // { path: 'partner', select: 'name email' }
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

    if (!['pending_verification', 'active', 'on_leave', 'suspended', 'inactive'].includes(status)) {
        throw new ApiError(400, 'Invalid status. Must be one of: pending_verification, active, on_leave, suspended, inactive');
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
    if (['pending_verification', 'active', 'on_leave', 'suspended', 'inactive'].includes(status)) {
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
    deactivateTechnicianById,
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
