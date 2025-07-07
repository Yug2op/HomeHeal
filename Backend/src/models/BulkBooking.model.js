import mongoose from 'mongoose';

const bulkBookingSchema = new mongoose.Schema({
    // Primary Identifier
    bulkBookingId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Client/Organization Information (redundant from User model)
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Location Information (redundant from individual bookings)
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],  // [longitude, latitude]
            required: true,
            index: '2dsphere'
        },
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            pincode: String,
            formattedAddress: String
        }
    },

    // Booking References
    bookings: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    }],

    // Redundant Booking Information (for faster queries)
    bookingCount: {
        type: Number,
        required: true,
        default: 0
    },
    serviceTypes: [{
        type: String,
        required: true
    }],

    // Scheduling Information
    scheduledDate: {
        type: Date,
        required: true,
        index: true
    },
    preferredTimeSlot: {
        start: { type: String, required: true }, // HH:MM format
        end: { type: String, required: true }   // HH:MM format
    },
    estimatedDuration: {
        type: Number, // in minutes
        required: true
    },

    // Status Information
    status: {
        type: String,
        enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'partially_completed'],
        default: 'pending',
        index: true
    },
    completionPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },

    // Technician Assignments
    assignedTechnicians: [{
        technician: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        technicianName: String,
        assignedServices: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service'
        }],
        assignedBookings: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        }],
        status: {
            type: String,
            enum: ['pending', 'in_progress', 'completed'],
            default: 'pending'
        },
        startTime: Date,
        endTime: Date
    }],

    // Financial Information (redundant from individual bookings)
    totalAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    amountPaid: {
        type: Number,
        default: 0,
        min: 0
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'partial', 'paid', 'refunded'],
        default: 'pending'
    },

    // Metadata
    notes: String,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    tags: [String],
    
    // Status History
    statusHistory: [{
        status: String,
        changedAt: {
            type: Date,
            default: Date.now
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        note: String
    }],

    // Audit Fields
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    deleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date,
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Generate bulk booking ID
bulkBookingSchema.pre('save', async function(next) {
    if (!this.bulkBookingId) {
        const count = await this.constructor.countDocuments();
        this.bulkBookingId = `BB${(count + 1).toString().padStart(6, '0')}`;
    }
    next();
});

// Update status history when status changes
bulkBookingSchema.pre('save', function(next) {
    if (this.isModified('status')) {
        this.statusHistory = this.statusHistory || [];
        this.statusHistory.push({
            status: this.status,
            changedAt: new Date(),
            changedBy: this.updatedBy || this.createdBy,
            note: `Status changed to ${this.status}`
        });
    }
    next();
});

// Update completion percentage based on individual bookings
bulkBookingSchema.methods.updateCompletionStatus = async function() {
    const bookingCount = this.bookings.length;
    if (bookingCount === 0) {
        this.completionPercentage = 0;
        return;
    }

    const completedCount = await mongoose.model('Booking').countDocuments({
        _id: { $in: this.bookings },
        status: 'completed'
    });

    this.completionPercentage = Math.round((completedCount / bookingCount) * 100);
    
    // Update overall status based on completion
    if (this.completionPercentage === 100) {
        this.status = 'completed';
    } else if (this.completionPercentage > 0) {
        this.status = 'partially_completed';
    }

    await this.save();
};

// Indexes for better query performance
bulkBookingSchema.index({ 'location.coordinates': '2dsphere' });
bulkBookingSchema.index({ status: 1, scheduledDate: 1 });
bulkBookingSchema.index({ client: 1, status: 1 });
bulkBookingSchema.index({ 'assignedTechnicians.technician': 1, status: 1 });

const BulkBooking = mongoose.model('BulkBooking', bulkBookingSchema);

export { BulkBooking };
