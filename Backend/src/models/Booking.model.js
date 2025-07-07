import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  estimatedDuration: {
    type: Number, // in minutes
    required: true
  }
}, { _id: false });

const partSchema = new mongoose.Schema({
  part: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Part',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  }
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  images: {
    selfieWithUser: {
      type: String, // URL to the stored image
      default: ''
    },
    productBefore: {
      type: String, // URL to the stored image
      default: ''
    },
    productAfter: {
      type: String, // URL to the stored image
      default: ''
    },
    selfieWithUserTimestamp: Date,
    productBeforeTimestamp: Date,
    productAfterTimestamp: Date
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assigned_technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    validate: {
      validator: async function (technicianId) {
        const technician = await User.findById(technicianId);
        return technician && technician.role === 'technician';
      },
      message: 'Technician must be a user with role technician'
    }
  },
  services: [serviceSchema],
  parts: [partSchema],
  address: {
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    country: {
      type: String,
      required: true
    },
    pincode: {
      type: String,
      required: true
    },
    landmark: String,
    tag: {
      type: String,
      enum: ['home', 'work', 'other', 'relative', 'temporary'],
      default: 'home'
    },
    location: {
      coordinates: {
        longitude: {    
          type: Number,
          required: true
        },
        latitude: {
          type: Number,
          required: true
        }
      }
    }
  },
  scheduleDate: {
    type: Date,
    required: true
  },
  preferredTimeSlot: {
    start: {
      type: String,
      required: true,
      match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
    },
    end: {
      type: String,
      required: true,
      match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
    }
  },
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'assigned',
      'in_progress',
      'completed',
      'cancelled',
      'rescheduled',
      'rejected'
    ],
    default: 'pending'
  },
  cancellationReason: String,
  rescheduledFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  payment: {
    method: {
      type: String,
      enum: ['online', 'wallet', 'cash', 'card', 'upi'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    advancePayment: {
      amount: {
        type: Number,   
        default: 150,
        min: 0
      },
      status: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending'
      },
      transactionId: String,
      paymentDate: Date
    },
    transactionId: String,
    paymentDate: Date
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  partsAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    coupon: String,
    amount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  notes: String,
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: String,
  reviewDate: Date,
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
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ technician: 1, status: 1 });
bookingSchema.index({ scheduleDate: 1, 'preferredTimeSlot.start': 1 });
bookingSchema.index({ 'address.location': '2dsphere' });

export const Booking = mongoose.model('Booking', bookingSchema);
