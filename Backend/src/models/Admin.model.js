import mongoose from 'mongoose';
import { User } from './User.model.js';

// Define the admin-specific schema that extends the base User schema
const adminSchema = new mongoose.Schema({
    // Admin-specific fields
    department: {
        type: String,
        required: [true, 'Department is required'],
        enum: ['operations', 'customer_support', 'technical', 'finance', 'hr', 'management'],
        default: 'operations'
    },

    // Admin-specific information
    jobTitle: {
        type: String,
        required: [true, 'Job title is required'],
        trim: true
    },

    // Admin preferences
    preferences: {
        dashboard_view: {
            type: String,
            enum: ['default', 'analytics', 'management'],
            default: 'default'
        },
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            critical_alerts: { type: Boolean, default: true },
            report_updates: { type: Boolean, default: true }
        }
    },

    // Admin activity tracking
    last_active: {
        type: Date,
        default: Date.now
    },

    // Admin notes (internal use only)
    notes: [{
        content: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Approval information
    approvalStatus: {
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'in_review'],
            default: 'pending'
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin'
        },
        reviewedAt: Date,
        reviewNotes: String
    }
}, {
    timestamps: true,
    discriminatorKey: 'role',
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
adminSchema.virtual('fullName').get(function () {
    return `${this.name.first} ${this.name.last || ''}`.trim();
});

// Pre-save hook to handle first admin setup
adminSchema.pre('save', async function (next) {
    // Auto-approve all admin accounts
    this.approvalStatus = {
        status: 'approved',
        reviewedBy: null, // System auto-approved
        reviewedAt: new Date(),
        reviewNotes: 'Auto-approved as admin'
    };

    next();
});

// Method to update admin's last active timestamp
adminSchema.methods.updateLastActive = async function () {
    this.last_active = new Date();
    return this.save();
};

// Method to add a note to admin's record
adminSchema.methods.addNote = async function (content, adminId) {
    this.notes.push({
        content,
        createdBy: adminId
    });
    return this.save();
};

// Method to approve admin
adminSchema.methods.approve = async function (adminId, notes = '') {
    this.approvalStatus = {
        status: 'approved',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes: notes
    };
    return this.save();
};

// Method to reject admin
adminSchema.methods.reject = async function (adminId, notes = '') {
    this.approvalStatus = {
        status: 'rejected',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes: notes
    };
    return this.save();
};

// Method to check if admin is approved
adminSchema.methods.isApproved = function () {
    return this.approvalStatus.status === 'approved';
};

// Static method to get pending approvals
adminSchema.statics.getPendingApprovals = function () {
    return this.find({ 'approvalStatus.status': 'pending' });
};

// Create and export the model
const Admin = User.discriminator('Admin', adminSchema);
export { Admin };
