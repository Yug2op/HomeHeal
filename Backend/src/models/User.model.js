import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mongoosePaginate from 'mongoose-paginate-v2';

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    first: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50
    },
    last: {
      type: String,
      trim: true,
      maxlength: 50
    }
  },

  // Contact Information
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, 'Please enter a valid email addresses'],
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^\d{10}$/, 'Phone number must be 10 digits'],
  },

  // Authentication
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false,
  },
  refreshToken: {
    type: String,
    select: false,
  },

  // Profile
  avatar: {
    type: String,
    required: [true, 'Avatar is required'],

  },

  // Role and Permissions
  role: {
    type: String,
    enum: ['User', 'Technician', 'Partner', 'Dealer', 'Manager', 'Admin'],
    default: 'User',
    required: true,
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  last_Login: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  addresses: [{
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    landmark: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' },
    isDefault: { type: Boolean, default: false },
    location: {
      coordinates: {
        longitude: { type: Number },
        latitude: { type: Number }
      }
    },
    tag: {
      type: String,
      enum: ['home', 'work', 'other', 'relative', 'temporary'],
      default: 'home'
    }
  }],

  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  // System
  fcmToken: String,

  registration_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'in_review'],
    default: function () {
      return this.role === 'user' ? 'approved' : 'pending';
    },
  },
}, {
  timestamps: true,
  discriminatorKey: 'role',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.set('toJSON', {
  virtuals: false, // or true if you need computed fields like fullName
  versionKey: false // removes __v
});


// Add virtual for fullName
userSchema.virtual('fullName').get(function () {
  return `${this.name.first} ${this.name.last}`.trim();
});

// Pre-save hook for hashing password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare provided password with stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate Access Token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      role: this.role,
      email: this.email,
      phone: this.phone,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Method to generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
};



// Add pagination plugin to user schema
userSchema.plugin(mongoosePaginate);

export const User = mongoose.model('User', userSchema);
