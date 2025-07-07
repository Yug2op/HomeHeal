import mongoose from 'mongoose';

const partSchema = new mongoose.Schema({
    // Part identification
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Supplier/Dealer ID is required'],
        index: true,
        validate: {
            validator: async function (value) {
                const user = await this.model('User').findOne({ _id: value, tag: 'dealer' });
                if (!user) {
                    throw new Error('Supplier ID is not a valid dealer');
                }
            },
            message: 'Supplier ID is not a valid dealer'
        }       
    },
    sku: {
        type: String,
        required: [true, 'SKU is required'],
        unique: true,
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    cost: {
        type: Number,
        required: true,
        min: 0
    },
    // Stock management
    quantityInStock: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    minimumQuantity: {
        type: Number,
        required: true,
        min: 0,
        default: 5
    },
    reorderLevel: {
        type: Number,
        default: 10,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastRestocked: Date,
    category: {
        type: String,
        required: true,
        enum: ['electrical', 'mechanical', 'plumbing', 'appliance', 'other']
    },
    brand: {
        type: String,
        trim: true
    },
    model: {
        type: String,
        trim: true
    },
    compatibleWith: [{
        type: String,
        trim: true
    }],
    image: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastRestocked: {
        type: Date
    },
    restockThreshold: {
        type: Number,
        default: 10
    },
    // Supplier details (redundant but kept for quick access)
    supplierDetails: {
        name: String,
        contact: {
            phone: String,
            email: String
        },
        leadTime: {
            type: Number,
            default: 3,
            min: 1
        },
        address: {
            street: String,
            city: String,
            state: String,
            pincode: String,
            country: {
                type: String,
                default: 'India'
            }
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for better query performance
// Indexes for better query performance
partSchema.index({ name: 'text', description: 'text', sku: 'text' });
partSchema.index({ category: 1 });
partSchema.index({ brand: 1 });
partSchema.index({ isActive: 1 });
partSchema.index({ supplier: 1, sku: 1 }, { unique: true });
partSchema.index({ 'supplierDetails.contact.email': 1 });

// Virtual for low stock status
partSchema.virtual('isLowStock').get(function () {
    return this.quantityInStock <= this.minimumQuantity;
});

// Method to update stock
partSchema.methods.updateStock = async function (quantity, action = 'add') {
    if (action === 'add') {
        this.quantityInStock += quantity;
    } else if (action === 'remove') {
        if (this.quantityInStock < quantity) {
            throw new Error('Insufficient stock');
        }
        this.quantityInStock -= quantity;

        // Check if we need to reorder
        if (this.quantityInStock <= this.restockThreshold) {
            // Here you could trigger a reorder notification
            console.log(`Low stock alert for ${this.name}. Current stock: ${this.quantityInStock}`);
        }
    }

    if (action === 'add') {
        this.lastRestocked = Date.now();
    }

    return this.save();
};

const Part = mongoose.model('Part', partSchema);

export default Part;
