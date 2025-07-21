import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    estimatedDuration: {
        type: Number, // in minutes
        required: true,
        min: 15
    },
    category: {
        type: String,
        required: true,
        enum: ['Appliance Repair', 'Plumbing', 'Electrical', 'Cleaning', 'Pest Control', 'Other'],
        default: 'Other'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    image: {
        type: String, // URL to the service image
        default: ''
    }
}, {
    timestamps: true
});

export const Service = mongoose.model('Service', serviceSchema);
