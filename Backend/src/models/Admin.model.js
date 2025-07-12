import mongoose from 'mongoose';
import { User } from './User.model.js';

const adminSchema = new mongoose.Schema({
  isSuperAdmin: {
    type: Boolean,
    default: true // always true for the only admin
  },

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

  last_active: {
    type: Date,
    default: Date.now
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

// Pre-save hook to update last_active
adminSchema.pre('save', function (next) {
  this.last_active = new Date();
  next();
});

// Method to update admin's last active timestamp
adminSchema.methods.updateLastActive = async function () {
  this.last_active = new Date();
  return this.save();
};

const Admin = User.discriminator('Admin', adminSchema);
export { Admin };
