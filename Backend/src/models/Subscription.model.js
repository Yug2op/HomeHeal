import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    plan: {
        type: String,
        enum: ['free', 'basic', 'premium'],
        default: 'free',
        required: true
    },
    subscriptionId: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['active', 'canceled', 'expired'],
        default: 'active',
        required: true
    },
    currentPeriodEnd: {
        type: Date,
        required: true
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    features: {
        prioritySupport: {
            type: Boolean,
            default: false
        },
        subscription_discount: {
            type: Number,
            default: 0
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Pre-save hook to update features based on plan
subscriptionSchema.pre('save', function (next) {
    this.features = getFeaturesForPlan(this.plan);
    this.updatedAt = Date.now();
    next();
});

// Helper function to determine features based on plan
function getFeaturesForPlan(plan) {
    const features = {
        free: {
            prioritySupport: false,
            subscription_discount: 0
        },
        basic: {
            prioritySupport: true,
            subscription_discount: 10
        },
        premium: {
            prioritySupport: true,
            subscription_discount: 20
        },
    };

    return features[plan] || features.free;
}

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
