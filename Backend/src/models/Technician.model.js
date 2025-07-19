import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { User } from './User.model.js';

// Define the technician-specific schema that extends the base User schema
const technicianSchema = new mongoose.Schema({
    // Personal Information
    dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other', 'prefer-not-to-say'],
        required: [true, 'Gender is required']
    },

    // Emergency Contact
    emergencyContact: {
        name: {
            type: String,
            required: [true, 'Emergency contact name is required']
        },
        relationship: {
            type: String,
            required: [true, 'Emergency contact relationship is required']
        },
        phone: {
            type: String,
            required: [true, 'Emergency contact phone is required'],
            match: [/^\d{10}$/, 'Phone number must be 10 digits']
        }
    },

    // Professional Information
    services: [{
        type: String,
        trim: true,
        required: [true, 'At least one service is required']
    }],
    skills: [{
        type: String,
        required: [true, 'Skills are required']
    }],
    experience: {
        type: Number, // in years
        required: [true, 'Experience is required'],
        min: [0, 'Experience cannot be negative']
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot be longer than 500 characters'],
        trim: true
    },

    // Service Areas
    serviceAreas: [{
        type: String, // Could be pincodes or area names
        trim: true
    }],

    // Availability
    availability: {
        workingHours: {
            monday: {
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                available: { type: Boolean, default: false }
            },
            tuesday: {
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                available: { type: Boolean, default: false }
            },
            wednesday: {
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                available: { type: Boolean, default: false }
            },
            thursday: {
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                available: { type: Boolean, default: false }
            },
            friday: {
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                available: { type: Boolean, default: false }
            },
            saturday: {
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                available: { type: Boolean, default: false }
            },
            sunday: {
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                available: { type: Boolean, default: false }
            }
        },
        isOnBreak: {
            type: Boolean,
            default: false
        },
        breakStart: Date,
        breakEnd: Date
    },

    // Work Preferences
    maxWorkload: {
        type: Number,
        default: 5,
        min: [1, 'Max workload must be at least 1'],
        max: [10, 'Max workload cannot exceed 10']
    },

    // Performance Metrics
    totalJobsCompleted: {
        type: Number,
        default: 0,
        min: 0
    },
    averageRating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    responseTime: {
        type: Number, // in minutes
        min: 0
    },

    // Verification & Documents
    isVerified: {
        type: Boolean,
        default: false
    },
    documents: [{
        type: {
            type: String, // 'id_proof', 'address_proof', 'certification', etc.
            required: [true, 'Document type is required'],
            enum: {
                values: ['id_proof', 'address_proof', 'certification', 'experience_certificate', 'other'],
                message: '{VALUE} is not a valid document type'
            }
        },
        url: {
            type: String,
            required: [true, 'Document URL is required']
        },
        verified: {
            type: Boolean,
            default: false
        },
        verifiedAt: Date,
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        metadata: mongoose.Schema.Types.Mixed // For any additional document info
    }],

    // Financial Information
    bankDetails: {
        accountHolderName: {
            type: String,
            trim: true
        },
        accountNumber: {
            type: String,
            trim: true
        },
        bankName: {
            type: String,
            trim: true
        },
        ifscCode: {
            type: String,
            trim: true,
            uppercase: true,
            match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format']
        },
        branch: {
            type: String,
            trim: true
        },
    },

    // System Fields
    status: {
        type: String,
        enum: ['pending_verification', 'active', 'on_leave', 'suspended', 'inactive'],
        default: 'pending_verification'
    },
    
    // Reference to bookings assigned to this technician
    assignedBookings: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    }],
    joinedAt: {
        type: Date,
        default: Date.now
    },
    notes: [{
        note: {
            type: String,
            required: [true, 'Note content is required'],
            trim: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        isInternal: {
            type: Boolean,
            default: false
        }
    }]
}, {
    timestamps: true,
    // Remove discriminatorKey as it's already defined in the parent User model
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
technicianSchema.index({ 'location.coordinates': '2dsphere' });

/**
 * Update technician's location
 * @param {Object} coordinates - Object with lng and lat properties
 * @param {string} [addresses] - Optional addresses string
 * @returns {Promise<Technician>} The updated technician document
 */
technicianSchema.methods.updateLocation = async function (coordinates, addresses) {
    if (!coordinates || !coordinates.lng || !coordinates.lat) {
        throw new Error('Invalid coordinates provided');
    }

    this.location = {
        type: 'Point',
        coordinates: [coordinates.lng, coordinates.lat],
        addresses: addresses || this.location?.addresses
    };

    return this.save();
};

/**
 * Update technician's availability status
 * @param {string} status - New status ('available', 'busy', 'offline')
 * @returns {Promise<Technician>} The updated technician document
 */


// Add pagination plugin to the schema
technicianSchema.plugin(mongoosePaginate);

// Create and export the model
const Technician = User.discriminator('Technician', technicianSchema);
export { Technician };
